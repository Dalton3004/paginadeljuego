/**
 * Cuentas, sesiones, ranking y partidos en disco (liga.json).
 * No guarda contraseñas en texto plano.
 *
 * FASE 2.1 — Persistencia en memoria + escritura debounced:
 *  - Los datos viven en memoria (una sola carga al arrancar).
 *  - Cada mutación marca dirty y programa un flush asíncrono con debounce.
 *  - Escritura: archivo temporal + rename (atómica). Se conservan .bak y copias diarias.
 *  - Guardado forzado en SIGTERM/SIGINT y al llamar vaciarRemoto/forzarGuardado.
 *
 * LAS CUENTAS NO SE PIERDEN AL SUBIR UNA VERSIÓN NUEVA:
 *  - El archivo ya NO vive dentro de la carpeta del proyecto (que se reemplaza en cada
 *    versión). Se busca, en este orden, un lugar que sobreviva a los cambios de versión:
 *      1. LIGA_DATA        (ruta completa del archivo)
 *      2. LIGA_DATA_DIR / DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH   (carpeta; p. ej. un Volume)
 *      3. /data o /var/data si existen y se puede escribir (Fly.io / Render con disco)
 *      4. ~/.liga-chaquito-f8/   (tu PC: lo comparten todas las versiones del juego)
 *      5. data/ dentro del proyecto (último recurso, es el comportamiento viejo)
 *  - Si hay un data/liga.json viejo dentro del proyecto, se migra solo (se copia o se fusiona).
 *  - Un archivo roto NUNCA se reemplaza por uno vacío: se aparta y se recupera de la copia (.bak).
 *  - Cada guardado deja una copia (.bak) y una copia por día (últimos 7 días).
 *  - Respaldo / restauración manual: ver exportarRespaldo() y restaurarRespaldo().
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sanitizarStatsPartido } from "./perfil.js";
import {
    sanitizarEquipoFavorito,
    esEquipoFavoritoValido,
    sanitizarDatosCarreraServidor,
} from "./career/persistencia_migracion.js";
import {
    accessSync, constants, copyFileSync, existsSync, mkdirSync, readdirSync,
    readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
    promises as fsp,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scryptAsync = promisify(scrypt);

const RAIZ = dirname(fileURLToPath(import.meta.url));
const RUTA_VIEJA = join(RAIZ, "data", "liga.json");

function escribible(dir) {
    try {
        mkdirSync(dir, { recursive: true });
        accessSync(dir, constants.W_OK);
        return true;
    } catch {
        return false;
    }
}

function resolverAlmacenamiento() {
    const env = process.env;
    if (env.LIGA_DATA) return { ruta: env.LIGA_DATA, origen: "LIGA_DATA", volumen: true };
    for (const [nombre, dir] of [
        ["LIGA_DATA_DIR", env.LIGA_DATA_DIR],
        ["DATA_DIR", env.DATA_DIR],
        ["RAILWAY_VOLUME_MOUNT_PATH", env.RAILWAY_VOLUME_MOUNT_PATH],
    ]) {
        if (dir && escribible(dir)) return { ruta: join(dir, "liga.json"), origen: nombre, volumen: true };
    }
    for (const dir of ["/data", "/var/data"]) {
        if (existsSync(dir) && escribible(dir)) return { ruta: join(dir, "liga.json"), origen: "disco " + dir, volumen: true };
    }
    const casa = join(homedir(), ".liga-chaquito-f8");
    if (escribible(casa)) return { ruta: join(casa, "liga.json"), origen: "carpeta del usuario", volumen: false };
    return { ruta: RUTA_VIEJA, origen: "carpeta del proyecto", volumen: false };
}

const ALMACEN = resolverAlmacenamiento();
const DATA_PATH = ALMACEN.ruta;
const BAK_PATH = DATA_PATH + ".bak";

// ---------------------------------------------------------------------------
// RESPALDO REMOTO: las cuentas viven además en un servicio externo, así que sobreviven
// aunque el hosting borre el disco en cada deploy/commit. Se activa con variables de entorno:
//   Upstash Redis (gratis):  UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//                            (también vale KV_REST_API_URL + KV_REST_API_TOKEN)
//   GitHub Gist (gratis):    GITHUB_TOKEN (permiso "gist") + GIST_ID
// Al arrancar se TRAEN las cuentas del remoto y se suman a las locales; después de cada guardado
// se SUBEN. Antes de subir siempre se trae y se fusiona lo que haya, así nunca se pisa nada.
// ---------------------------------------------------------------------------
function configurarRemoto() {
    const env = process.env;
    const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").replace(/\/+$/, "");
    const tok = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "";
    if (url && tok) {
        const llamar = async (cmd) => {
            const r = await fetch(url, {
                method: "POST",
                headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
                body: JSON.stringify(cmd),
                signal: AbortSignal.timeout(15000),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.error) throw new Error("Upstash: " + (j.error || r.status));
            return j.result;
        };
        return {
            nombre: "Upstash Redis",
            conSesiones: true,
            leer: async () => (await llamar(["GET", "liga-chaquito:liga.json"])) || "",
            escribir: async (txt) => { await llamar(["SET", "liga-chaquito:liga.json", txt]); },
        };
    }
    const gtok = env.GITHUB_TOKEN || env.GIST_TOKEN || "";
    const gid = env.GIST_ID || "";
    if (gtok && gid) {
        const H = { Authorization: "Bearer " + gtok, "User-Agent": "liga-chaquito-f8", Accept: "application/vnd.github+json" };
        const API = "https://api.github.com/gists/" + encodeURIComponent(gid);
        return {
            nombre: "GitHub Gist",
            conSesiones: false,   // el gist no es lugar para tokens de sesión
            leer: async () => {
                const r = await fetch(API, { headers: H, signal: AbortSignal.timeout(15000) });
                if (!r.ok) throw new Error("Gist: HTTP " + r.status);
                const f = (await r.json()).files?.["liga.json"];
                if (!f) return "";
                if (f.truncated && f.raw_url) {
                    const raw = await fetch(f.raw_url, { headers: H, signal: AbortSignal.timeout(15000) });
                    if (!raw.ok) throw new Error("Gist raw: HTTP " + raw.status);
                    return await raw.text();
                }
                return f.content || "";
            },
            escribir: async (txt) => {
                const r = await fetch(API, {
                    method: "PATCH",
                    headers: { ...H, "Content-Type": "application/json" },
                    body: JSON.stringify({ files: { "liga.json": { content: txt } } }),
                    signal: AbortSignal.timeout(15000),
                });
                if (!r.ok) throw new Error("Gist: HTTP " + r.status);
            },
        };
    }
    return null;
}

const REMOTO = configurarRemoto();
let envioTimer = null;
let enviando = null;
let pendiente = false;

function aDatos(txt) {
    if (!txt) return null;
    try {
        const d = JSON.parse(txt);
        if (!d || d.v !== 1 || !Array.isArray(d.cuentas)) return null;
        return {
            v: 1,
            cuentas: d.cuentas,
            sesiones: Array.isArray(d.sesiones) ? d.sesiones : [],
            jugadores: Array.isArray(d.jugadores) ? d.jugadores : [],
            partidos: Array.isArray(d.partidos) ? d.partidos : [],
        };
    } catch { return null; }
}

/** Trae lo del remoto, lo suma a lo local (nunca pisa) y sube el resultado. Lanza error si el remoto falla. */
async function sincronizarRemoto() {
    if (!REMOTO) return;
    const txt = await REMOTO.leer();            // si falla, NO se sube nada (no se arriesga lo que hay)
    const local = getData();
    const remoto = aDatos(txt);
    let n = 0;
    if (remoto) n = fusionar(local, remoto);
    else if (txt) throw new Error("el contenido remoto no es un liga.json válido; no se toca");
    if (n) {
        invalidarRankingCache();
        dirty = true;
        await escribirAhora();
        console.log("[persistencia] " + n + " cuenta(s) recuperadas desde " + REMOTO.nombre);
    }
    if (!local.cuentas.length) return;          // nunca se sube un archivo vacío
    const copia = { ...local, sesiones: REMOTO.conSesiones ? local.sesiones : [] };
    await REMOTO.escribir(JSON.stringify(copia));
}

function enviarRemoto() {
    if (!REMOTO) return Promise.resolve();
    if (enviando) { pendiente = true; return enviando; }
    enviando = sincronizarRemoto()
        .catch((e) => {
            console.error("[persistencia] no se pudo sincronizar con " + REMOTO.nombre + ": " + e.message + " (se reintenta)");
            programarEnvio(30000);
        })
        .finally(() => {
            enviando = null;
            if (pendiente) { pendiente = false; programarEnvio(500); }
        });
    return enviando;
}

function programarEnvio(ms = 1500) {
    if (!REMOTO || envioTimer) return;
    envioTimer = setTimeout(() => { envioTimer = null; enviarRemoto(); }, ms);
    envioTimer.unref?.();
}

/** Sube ya mismo lo pendiente (para llamar al apagar el servidor, p. ej. en un deploy). */
export async function vaciarRemoto() {
    // Primero volcar memoria a disco (debounce cancelado)
    if (typeof forzarGuardado === "function") {
        try { await forzarGuardado(); } catch (e) {
            console.error("[persistencia] forzarGuardado en vaciarRemoto:", e.message);
        }
    }
    if (!REMOTO) return;
    if (envioTimer) { clearTimeout(envioTimer); envioTimer = null; }
    if (enviando) await enviando;
    await enviarRemoto();
}

/** Sesión: 14 días; se renueva en cada /api/yo o actividad autenticada. */
const SESION_MS = 14 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 8000;
/** Tope de partidos cliente (solo/liga) por hora por cuenta. */
const PARTIDOS_HORA_MAX = 40;
const NOMBRES_RESERVADOS = new Set([
    "admin", "administrador", "administrator", "root", "system", "sistema",
    "invitado", "guest", "null", "undefined", "moderador", "mod", "soporte",
    "support", "oficial", "liga", "chaquito", "servidor", "server",
]);

function vacio() {
    return { v: 1, cuentas: [], sesiones: [], jugadores: [], partidos: [] };
}

/** Lee y valida un archivo de datos. Devuelve null si no existe o no es un liga.json válido. */
function parsear(ruta) {
    try {
        const data = JSON.parse(readFileSync(ruta, "utf8"));
        if (!data || data.v !== 1) return null;
        data.cuentas = Array.isArray(data.cuentas) ? data.cuentas : [];
        data.sesiones = Array.isArray(data.sesiones) ? data.sesiones : [];
        data.jugadores = Array.isArray(data.jugadores) ? data.jugadores : [];
        data.partidos = Array.isArray(data.partidos) ? data.partidos : [];
        return data;
    } catch {
        return null;
    }
}

function copiasDiarias() {
    try {
        const nombre = basename(DATA_PATH).replace(/\.json$/, "");
        return readdirSync(dirname(DATA_PATH))
            .filter((f) => f.startsWith(nombre + ".") && /\.\d{4}-\d{2}-\d{2}\.json$/.test(f))
            .sort()
            .reverse()
            .map((f) => join(dirname(DATA_PATH), f));
    } catch {
        return [];
    }
}

/** Carga inicial desde disco (una sola vez). No se vuelve a leer en cada request. */
function cargarDesdeDisco() {
    if (existsSync(DATA_PATH)) {
        const data = parsear(DATA_PATH);
        if (data) return data;
        const apartado = DATA_PATH + ".roto-" + Date.now();
        try {
            renameSync(DATA_PATH, apartado);
            console.error("[persistencia] liga.json ilegible, apartado en " + apartado);
        } catch (e) {
            console.error("[persistencia] liga.json ilegible y no se pudo apartar:", e.message);
        }
    }
    for (const copia of [BAK_PATH, ...copiasDiarias()]) {
        const data = parsear(copia);
        if (data) {
            try {
                mkdirSync(dirname(DATA_PATH), { recursive: true });
                copyFileSync(copia, DATA_PATH);
            } catch { /* se sigue con lo leído */ }
            console.warn("[persistencia] datos recuperados desde " + copia + " (" + data.cuentas.length + " cuentas)");
            return data;
        }
    }
    return vacio();
}

// ---------------------------------------------------------------------------
// FASE 2.1 — estado en memoria + escritura debounced asíncrona
// ---------------------------------------------------------------------------
const DEBOUNCE_MS = 400;
let memoria = null;          // objeto vivo (única fuente de verdad)
let dirty = false;           // hay cambios sin volcar a disco
let writeTimer = null;       // debounce
let writing = null;          // Promise del write en curso
let signalHandlersInstalled = false;

// ---------------------------------------------------------------------------
// FASE 2.2 — índices en memoria + ranking cacheado + limpieza de sesiones
// ---------------------------------------------------------------------------
/** token → objeto sesión (misma referencia que en data.sesiones) */
const porToken = new Map();
/** nombre normalizado (lower) → objeto cuenta */
const porNombre = new Map();
/** cache del ranking público */
let rankingCache = null;
let rankingCacheAt = 0;
const RANKING_TTL_MS = 3000;
const LIMPIEZA_SESIONES_MS = 5 * 60 * 1000;
let limpiezaTimer = null;

function invalidarRankingCache() {
    rankingCache = null;
    rankingCacheAt = 0;
}

function reconstruirIndices(data) {
    porToken.clear();
    porNombre.clear();
    invalidarRankingCache();
    for (const c of data.cuentas) {
        if (c && typeof c.nombre === "string") {
            porNombre.set(String(c.nombre).toLowerCase(), c);
        }
    }
    for (const s of data.sesiones) {
        if (s && typeof s.token === "string") porToken.set(s.token, s);
    }
}

function indexarCuenta(cuenta) {
    if (cuenta && typeof cuenta.nombre === "string") {
        porNombre.set(String(cuenta.nombre).toLowerCase(), cuenta);
    }
}

function indexarSesion(sesion) {
    if (sesion && typeof sesion.token === "string") porToken.set(sesion.token, sesion);
}

function desindexarSesion(token) {
    if (token) porToken.delete(token);
}

function desindexarSesionesCuenta(cuentaId, exceptoToken = "") {
    for (const [tok, s] of porToken) {
        if (s.cuentaId === cuentaId && tok !== exceptoToken) porToken.delete(tok);
    }
}

/** Prune de sesiones vencidas sin marcar dirty (para el camino de escritura). */
function pruneSesionesAlEscribir(data) {
    const limite = Date.now() - SESION_MS;
    const vivos = [];
    let cambio = false;
    for (const s of data.sesiones) {
        const marca = s.usada || s.creada || 0;
        if (marca > limite) vivos.push(s);
        else {
            porToken.delete(s.token);
            cambio = true;
        }
    }
    if (cambio) data.sesiones = vivos;
}


/** Quita sesiones vencidas de memoria + índice. Devuelve cuántas limpió. */
function limpiarSesionesVencidas(data = getData()) {
    const limite = Date.now() - SESION_MS;
    const antes = data.sesiones.length;
    if (!antes) return 0;
    const vivos = [];
    for (const s of data.sesiones) {
        const marca = s.usada || s.creada || 0;
        if (marca > limite) {
            vivos.push(s);
        } else {
            porToken.delete(s.token);
        }
    }
    if (vivos.length === antes) return 0;
    data.sesiones = vivos;
    // re-sync index por si quedó algo raro
    if (porToken.size !== vivos.length) {
        porToken.clear();
        for (const s of vivos) if (s && s.token) porToken.set(s.token, s);
    }
    marcarDirty();
    return antes - vivos.length;
}

function programarLimpiezaSesiones() {
    if (limpiezaTimer) return;
    limpiezaTimer = setInterval(() => {
        try {
            const n = limpiarSesionesVencidas();
            if (n) console.log("[persistencia] limpieza: " + n + " sesión(es) vencida(s)");
        } catch (e) {
            console.error("[persistencia] limpieza de sesiones:", e.message);
        }
    }, LIMPIEZA_SESIONES_MS);
    limpiezaTimer.unref?.();
}

function getData() {
    if (!memoria) {
        memoria = cargarDesdeDisco();
        reconstruirIndices(memoria);
    }
    return memoria;
}

/** Compat: leer() ahora devuelve la copia en memoria (mutaciones in-place). */
function leer() {
    return getData();
}

function programarEscritura() {
    if (writeTimer) return;
    writeTimer = setTimeout(() => {
        writeTimer = null;
        escribirAhora().catch((e) => {
            console.error("[persistencia] error al guardar liga.json:", e.message);
        });
    }, DEBOUNCE_MS);
    writeTimer.unref?.();
}

function marcarDirty() {
    dirty = true;
    programarEscritura();
    programarEnvio();
}

/** Escribe a disco de forma asíncrona (tmp + rename). Conserva .bak y copia diaria. */
async function escribirAhora() {
    if (writing) {
        // Encadenar otro flush si sigue dirty al terminar el actual
        await writing;
        if (!dirty) return;
    }
    if (!dirty) return;
    const data = getData();
    dirty = false;

    pruneSesionesAlEscribir(data);

    const run = (async () => {
        await fsp.mkdir(dirname(DATA_PATH), { recursive: true });
        const tmp = DATA_PATH + ".tmp";
        const payload = JSON.stringify(data);
        await fsp.writeFile(tmp, payload, "utf8");
        try {
            if (existsSync(DATA_PATH) && statSync(DATA_PATH).size > 80) {
                await fsp.copyFile(DATA_PATH, BAK_PATH);
            }
        } catch { /* la copia es un extra */ }
        await fsp.rename(tmp, DATA_PATH);
        await copiaDelDiaAsync(data);
    })();

    writing = run.finally(() => { writing = null; });
    await writing;
}

/** Fallback síncrono para señales (proceso a punto de morir). */
function escribirSyncForzado() {
    if (!dirty && !memoria) return;
    const data = getData();
    dirty = false;
    pruneSesionesAlEscribir(data);
    try {
        mkdirSync(dirname(DATA_PATH), { recursive: true });
        const tmp = DATA_PATH + ".tmp";
        writeFileSync(tmp, JSON.stringify(data));
        try {
            if (existsSync(DATA_PATH) && statSync(DATA_PATH).size > 80) copyFileSync(DATA_PATH, BAK_PATH);
        } catch { /* extra */ }
        renameSync(tmp, DATA_PATH);
        copiaDelDia(data);
    } catch (e) {
        console.error("[persistencia] flush síncrono falló:", e.message);
    }
}

function copiaDelDia(data) {
    if (!data.cuentas.length) return;
    try {
        const hoy = new Date().toISOString().slice(0, 10);
        const destino = DATA_PATH.replace(/\.json$/, "") + "." + hoy + ".json";
        if (!existsSync(destino)) copyFileSync(DATA_PATH, destino);
        for (const vieja of copiasDiarias().slice(7)) unlinkSync(vieja);
    } catch { /* extra */ }
}

async function copiaDelDiaAsync(data) {
    if (!data.cuentas.length) return;
    try {
        const hoy = new Date().toISOString().slice(0, 10);
        const destino = DATA_PATH.replace(/\.json$/, "") + "." + hoy + ".json";
        if (!existsSync(destino)) await fsp.copyFile(DATA_PATH, destino);
        for (const vieja of copiasDiarias().slice(7)) {
            try { await fsp.unlink(vieja); } catch { /* ignore */ }
        }
    } catch { /* extra */ }
}

/** Guardado forzado (async). Usar antes de apagar o en tests. */
export async function forzarGuardado() {
    if (writeTimer) {
        clearTimeout(writeTimer);
        writeTimer = null;
    }
    if (dirty || writing) await escribirAhora();
}

function instalarHandlersSenales() {
    if (signalHandlersInstalled) return;
    signalHandlersInstalled = true;
    const flush = () => {
        if (writeTimer) {
            clearTimeout(writeTimer);
            writeTimer = null;
        }
        // Sync: el proceso puede morir antes de que termine un async
        escribirSyncForzado();
    };
    process.once("SIGTERM", flush);
    process.once("SIGINT", flush);
    process.once("beforeExit", () => {
        if (dirty) escribirSyncForzado();
    });
}

/** Alias legacy: mutación → dirty + debounce (ya no escribe síncrono). */
function guardar(_data) {
    marcarDirty();
}

function guardarLocal(_data) {
    // Escritura inmediata síncrona solo si se pide explícitamente desde migración.
    // En el camino normal se usa marcarDirty.
    dirty = true;
    escribirSyncForzado();
}

/** Suma a 'destino' las cuentas de 'origen' que todavía no existen (por id o por nombre). Nunca pisa ni borra. */
function fusionar(destino, origen) {
    const ids = new Set(destino.cuentas.map((c) => c.id));
    const nombres = new Set(destino.cuentas.map((c) => String(c.nombre).toLowerCase()));
    let agregadas = 0;
    for (const c of origen.cuentas) {
        if (!c || typeof c.id !== "string" || typeof c.nombre !== "string" || typeof c.hash !== "string" || typeof c.salt !== "string") continue;
        if (ids.has(c.id) || nombres.has(c.nombre.toLowerCase())) continue;
        destino.cuentas.push(c);
        ids.add(c.id);
        nombres.add(c.nombre.toLowerCase());
        indexarCuenta(c);
        agregadas++;
        const j = origen.jugadores.find((x) => x && x.cuentaId === c.id);
        if (j && !destino.jugadores.some((x) => x.cuentaId === c.id)) destino.jugadores.push(j);
        for (const p of origen.partidos) if (p && p.cuentaId === c.id) destino.partidos.push(p);
        for (const se of origen.sesiones) {
            if (se && se.cuentaId === c.id && !destino.sesiones.some((x) => x.token === se.token)) {
                destino.sesiones.push(se);
                indexarSesion(se);
            }
        }
    }
    destino.partidos.sort((a, b) => (a.cuando || 0) - (b.cuando || 0));
    return agregadas;
}

/** Migra el data/liga.json viejo (dentro de la carpeta del proyecto) al lugar permanente. */
function migrarDatosViejos() {
    if (DATA_PATH === RUTA_VIEJA || !existsSync(RUTA_VIEJA)) return;
    const viejo = parsear(RUTA_VIEJA);
    if (!viejo) return;
    try {
        if (!existsSync(DATA_PATH)) {
            mkdirSync(dirname(DATA_PATH), { recursive: true });
            copyFileSync(RUTA_VIEJA, DATA_PATH);
            console.log("[persistencia] cuentas migradas desde " + RUTA_VIEJA + " (" + viejo.cuentas.length + ")");
        } else {
            const actual = getData();
            const n = fusionar(actual, viejo);
            if (n) {
                // Sync: el boot recarga de disco justo después
                dirty = true;
                escribirSyncForzado();
                console.log("[persistencia] " + n + " cuenta(s) del data/liga.json viejo sumadas a las actuales");
            }
        }
        renameSync(RUTA_VIEJA, RUTA_VIEJA + ".migrado");   // ya está a salvo: no se vuelve a procesar
    } catch (e) {
        console.error("[persistencia] no se pudo migrar el data/liga.json viejo:", e.message);
    }
}

migrarDatosViejos();

// Carga única a memoria (fuente de verdad a partir de aquí).
memoria = cargarDesdeDisco();
reconstruirIndices(memoria);
instalarHandlersSenales();
programarLimpiezaSesiones();
console.log("[persistencia] datos en memoria (" + memoria.cuentas.length + " cuentas, " + memoria.sesiones.length + " sesiones) · índices OK · escritura debounced " + DEBOUNCE_MS + " ms");

// Antes de aceptar pedidos: recuperar del remoto las cuentas que el hosting haya borrado.
if (REMOTO) {
    try {
        await sincronizarRemoto();
        console.log("[persistencia] respaldo remoto activo (" + REMOTO.nombre + ")");
    } catch (e) {
        console.error("[persistencia] no se pudo leer " + REMOTO.nombre + " al arrancar: " + e.message + " (se reintenta)");
        programarEnvio(10000);
    }
}

/** Dónde se guardan las cuentas (para mostrar en el log del servidor). */
export function infoAlmacenamiento() {
    const hospedaje = process.env.RAILWAY_ENVIRONMENT ? "Railway" : process.env.RENDER ? "Render"
        : process.env.FLY_APP_NAME ? "Fly.io" : process.env.GLITCH_DOMAIN ? "Glitch" : "";
    return {
        ruta: DATA_PATH,
        origen: ALMACEN.origen,
        // En un hosting sin disco persistente (Volume) las cuentas se borran en cada deploy.
        riesgo: !!hospedaje && !ALMACEN.volumen && !REMOTO,
        hospedaje,
        remoto: REMOTO ? REMOTO.nombre : "",
    };
}

/** Todo el contenido (cuentas con sus claves ya hasheadas). Sirve para bajar un respaldo. */
export function exportarRespaldo() {
    return leer();
}

/** Suma las cuentas de un respaldo a las actuales. Nunca borra ni pisa cuentas que ya existen. */
export function restaurarRespaldo(contenido) {
    let obj = contenido;
    if (typeof obj === "string") {
        try { obj = JSON.parse(obj); } catch { obj = null; }
    }
    if (!obj || obj.v !== 1 || !Array.isArray(obj.cuentas)) {
        return { status: 400, body: { ok: false, error: "No es un respaldo válido de liga.json." } };
    }
    const origen = {
        cuentas: obj.cuentas,
        sesiones: Array.isArray(obj.sesiones) ? obj.sesiones : [],
        jugadores: Array.isArray(obj.jugadores) ? obj.jugadores : [],
        partidos: Array.isArray(obj.partidos) ? obj.partidos : [],
    };
    const data = leer();
    const agregadas = fusionar(data, origen);
    if (agregadas) {
        invalidarRankingCache();
        guardar(data);
    }
    return { status: 200, body: { ok: true, cuentasAgregadas: agregadas, cuentasTotal: data.cuentas.length } };
}

function normalizarNombre(n) {
    return String(n || "").trim().replace(/\s+/g, " ").slice(0, 20);
}

/** Nombre válido: letras (incluye tildes/ñ), números, guion bajo y espacios simples (O(n) sin ReDoS). */
function nombrePermitido(n) {
    if (!n || n.length > 20) return false;
    if (/^[ _]|[ _]$|[ _]{2}/.test(n)) return false;
    return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _]+$/.test(n);
}

function nombreReservado(n) {
    const key = String(n || "").toLowerCase().replace(/\s+/g, "");
    return NOMBRES_RESERVADOS.has(key) || NOMBRES_RESERVADOS.has(String(n || "").toLowerCase());
}

/** scrypt asíncrono; mismos parámetros que el scryptSync anterior → hashes viejos siguen válidos. */
async function hashPass(password, salt) {
    const buf = await scryptAsync(String(password), String(salt), 32);
    return buf.toString("hex");
}

function entero(n, max) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(max, v);
}

function modoValido(m) {
    return ["solo", "liga", "copa", "supercopa", "historia", "online"].includes(m) ? m : "solo";
}

/** gf/gc coherentes con win/loss/draw. */
function resultadoCoherente(resultado, gf, gc) {
    if (resultado === "win") return gf > gc;
    if (resultado === "loss") return gf < gc;
    return gf === gc;
}

function publicoJugador(j) {
    return {
        id: j.id,
        nombre: j.nombre,
        pj: j.pj || 0,
        pg: j.pg || 0,
        pp: j.pp || 0,
        pe: j.pe || 0,
        pts: j.pts || 0,
        gf: j.gf || 0,
        gc: j.gc || 0,
        equipoFavorito: sanitizarEquipoFavorito(j.equipoFavorito),
    };
}

function publicoPartido(p) {
    const out = {
        id: p.id,
        resultado: p.resultado,
        gf: p.gf || 0,
        gc: p.gc || 0,
        modo: p.modo || "solo",
        cuando: p.cuando,
    };
    if (p.equipoLocal) out.equipoLocal = String(p.equipoLocal).slice(0, 32);
    if (p.equipoRival) out.equipoRival = String(p.equipoRival).slice(0, 32);
    if (p.stats) out.stats = p.stats;
    return out;
}

function ranking(data) {
    const ahora = Date.now();
    if (rankingCache && (ahora - rankingCacheAt) < RANKING_TTL_MS) {
        return rankingCache;
    }
    const lista = data.jugadores
        .map(publicoJugador)
        .sort((a, b) => b.pts - a.pts || b.pg - a.pg || b.pj - a.pj || a.nombre.localeCompare(b.nombre, "es"));
    rankingCache = lista;
    rankingCacheAt = ahora;
    return lista;
}

function asegurarJugador(data, cuenta) {
    let j = data.jugadores.find((x) => x.cuentaId === cuenta.id);
    const favCuenta = sanitizarEquipoFavorito(cuenta.equipoFavorito);
    if (!j) {
        j = {
            id: "j_" + cuenta.id,
            cuentaId: cuenta.id,
            nombre: cuenta.nombre,
            pj: 0, pg: 0, pp: 0, pe: 0, pts: 0, gf: 0, gc: 0,
            equipoFavorito: favCuenta,
            ultimo: 0,
        };
        data.jugadores.push(j);
    } else {
        j.nombre = cuenta.nombre;
        j.equipoFavorito = sanitizarEquipoFavorito(j.equipoFavorito || favCuenta);
    }
    return j;
}

function crearSesion(data, cuentaId) {
    const token = randomBytes(24).toString("hex");
    const ahora = Date.now();
    const sesion = { token, cuentaId, creada: ahora, usada: ahora };
    data.sesiones.push(sesion);
    indexarSesion(sesion);
    return token;
}

function sesionDe(data, token, { renovar = false } = {}) {
    if (!token) return null;
    const sesion = porToken.get(token);
    if (!sesion) return null;
    const marca = sesion.usada || sesion.creada || 0;
    if (marca < Date.now() - SESION_MS) {
        data.sesiones = data.sesiones.filter((s) => s.token !== token);
        desindexarSesion(token);
        marcarDirty();
        return null;
    }
    // cuenta por id: aún lineal, pero hay pocas cuentas; el hot path es el token
    const cuenta = data.cuentas.find((c) => c.id === sesion.cuentaId);
    if (!cuenta) {
        data.sesiones = data.sesiones.filter((s) => s.token !== token);
        desindexarSesion(token);
        return null;
    }
    if (renovar) {
        sesion.usada = Date.now();
    }
    return { sesion, cuenta };
}

/** Cierra todas las sesiones de una cuenta (logout global / cambio de clave). */
function invalidarSesionesCuenta(data, cuentaId, exceptoToken = "") {
    desindexarSesionesCuenta(cuentaId, exceptoToken || "");
    data.sesiones = data.sesiones.filter((s) => s.cuentaId !== cuentaId || (exceptoToken && s.token === exceptoToken));
}

function aplicarResultado(jugador, resultado, gf, gc) {
    jugador.pj += 1;
    jugador.gf = (jugador.gf || 0) + gf;
    jugador.gc = (jugador.gc || 0) + gc;
    jugador.ultimo = Date.now();
    if (resultado === "win") {
        jugador.pg += 1;
        jugador.pts += 3;
    } else if (resultado === "loss") {
        jugador.pp += 1;
    } else {
        jugador.pe += 1;
        jugador.pts += 1;
    }
}

function payloadDe(payload) {
    const body = typeof payload === "string" ? { resultado: payload } : (payload || {});
    const resultado = body.resultado;
    if (!["win", "loss", "draw"].includes(resultado)) return null;
    return {
        resultado,
        gf: entero(body.gf, 40),
        gc: entero(body.gc, 40),
        modo: modoValido(body.modo),
        modoBruto: body.modo ? String(body.modo) : "solo",
        equipoLocal: body.equipoLocal ? String(body.equipoLocal).slice(0, 32) : "",
        equipoRival: body.equipoRival ? String(body.equipoRival).slice(0, 32) : "",
        partidoId: body.partidoId ? String(body.partidoId).slice(0, 80) : "",
        stats: sanitizarStatsPartido(body.stats),
    };
}

export async function registrar({ nombre, password }) {
    const n = normalizarNombre(nombre);
    if (n.length < 3) return { status: 400, body: { ok: false, error: "El nombre tiene que tener al menos 3 letras." } };
    if (!nombrePermitido(n)) {
        return { status: 400, body: { ok: false, error: "El nombre solo puede tener letras, números, guion bajo y espacios simples." } };
    }
    if (nombreReservado(n)) {
        return { status: 400, body: { ok: false, error: "Ese nombre está reservado. Elegí otro." } };
    }
    if (!password || String(password).length < 8) {
        return { status: 400, body: { ok: false, error: "La contraseña tiene que tener al menos 8 caracteres." } };
    }
    const data = leer();
    if (porNombre.has(n.toLowerCase())) {
        return { status: 409, body: { ok: false, error: "Ese jugador ya está registrado." } };
    }
    const salt = randomBytes(16).toString("hex");
    const cuenta = {
        id: "c_" + randomBytes(8).toString("hex"),
        nombre: n,
        salt,
        hash: await hashPass(password, salt),
        equipoFavorito: "",
        datosCarrera: null,
        creada: Date.now(),
    };
    data.cuentas.push(cuenta);
    indexarCuenta(cuenta);
    invalidarRankingCache();
    const jugador = asegurarJugador(data, cuenta);
    const token = crearSesion(data, cuenta.id);
    guardar(data);
    return {
        status: 200,
        body: {
            ok: true,
            token,
            cuenta: { id: cuenta.id, nombre: cuenta.nombre, equipoFavorito: "" },
            jugador: publicoJugador(jugador),
        },
    };
}

export async function entrar({ nombre, password }) {
    const n = normalizarNombre(nombre);
    const data = leer();
    const cuenta = porNombre.get(n.toLowerCase());
    if (!cuenta) return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    let intento;
    let real;
    try {
        intento = Buffer.from(await hashPass(password || "", cuenta.salt), "hex");
        real = Buffer.from(cuenta.hash, "hex");
    } catch {
        return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    }
    if (intento.length !== real.length || !timingSafeEqual(intento, real)) {
        return { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    }
    const jugador = asegurarJugador(data, cuenta);
    const token = crearSesion(data, cuenta.id);
    guardar(data);
    return {
        status: 200,
        body: {
            ok: true,
            token,
            cuenta: {
                id: cuenta.id,
                nombre: cuenta.nombre,
                equipoFavorito: sanitizarEquipoFavorito(cuenta.equipoFavorito),
            },
            jugador: publicoJugador(jugador),
        },
    };
}

export function salir(token) {
    if (!token) return { status: 200, body: { ok: true } };
    const data = leer();
    if (!porToken.has(token)) return { status: 200, body: { ok: true } };
    data.sesiones = data.sesiones.filter((s) => s.token !== token);
    desindexarSesion(token);
    guardar(data);
    return { status: 200, body: { ok: true } };
}

/** Cierra sesión en todos los dispositivos de la cuenta del token. */
export function salirTodos(token) {
    if (!token) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    invalidarSesionesCuenta(data, hallada.cuenta.id);
    guardar(data);
    return { status: 200, body: { ok: true } };
}

export function cuentaDe(token) {
    const data = leer();
    const hallada = sesionDe(data, token, { renovar: true });
    if (!hallada) return null;
    // Persistir renovación de sesión de vez en cuando (cada ~5 min) para no escribir en cada hit
    const usada = hallada.sesion.usada || 0;
    if (Date.now() - usada < 60_000) {
        /* ya renovado en memoria; el próximo guardar lo fija */
    } else {
        hallada.sesion.usada = Date.now();
        guardar(data);
    }
    const jugador = data.jugadores.find((x) => x.cuentaId === hallada.cuenta.id);
    return {
        cuenta: {
            id: hallada.cuenta.id,
            nombre: hallada.cuenta.nombre,
            equipoFavorito: sanitizarEquipoFavorito(hallada.cuenta.equipoFavorito),
        },
        jugador: jugador ? publicoJugador(jugador) : publicoJugador(asegurarJugador(data, hallada.cuenta)),
    };
}

/** Cambia la contraseña e invalida todas las sesiones anteriores (deja la nueva). */
export async function cambiarClave(token, { passwordActual, passwordNueva }) {
    if (!token) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    if (!passwordNueva || String(passwordNueva).length < 8) {
        return { status: 400, body: { ok: false, error: "La contraseña nueva tiene que tener al menos 8 caracteres." } };
    }
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const cuenta = data.cuentas.find((c) => c.id === hallada.cuenta.id);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    let intento;
    let real;
    try {
        intento = Buffer.from(await hashPass(passwordActual || "", cuenta.salt), "hex");
        real = Buffer.from(cuenta.hash, "hex");
    } catch {
        return { status: 401, body: { ok: false, error: "Contraseña actual incorrecta." } };
    }
    if (intento.length !== real.length || !timingSafeEqual(intento, real)) {
        return { status: 401, body: { ok: false, error: "Contraseña actual incorrecta." } };
    }
    const salt = randomBytes(16).toString("hex");
    cuenta.salt = salt;
    cuenta.hash = await hashPass(passwordNueva, salt);
    invalidarSesionesCuenta(data, cuenta.id);
    const nuevoToken = crearSesion(data, cuenta.id);
    guardar(data);
    return {
        status: 200,
        body: { ok: true, token: nuevoToken, cuenta: { id: cuenta.id, nombre: cuenta.nombre } },
    };
}

export function listarRanking() {
    return ranking(leer());
}

export function resumen() {
    const data = leer();
    return {
        cuentas: data.cuentas.length,
        jugadores: data.jugadores.length,
        partidos: data.partidos.length,
        almacenamiento: { origen: ALMACEN.origen, permanente: ALMACEN.volumen || ALMACEN.origen === "carpeta del usuario" },
    };
}

export function historial(token, limite = 12) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    const n = Math.max(1, Math.min(30, parseInt(limite, 10) || 12));
    const partidos = data.partidos
        .filter((p) => p.cuentaId === hallada.cuenta.id)
        .slice(-n)
        .reverse()
        .map(publicoPartido);
    return { status: 200, body: { ok: true, partidos } };
}

function anotarEn(data, cuenta, info, { sumarRanking = true } = {}) {
    const jugador = asegurarJugador(data, cuenta);
    if (info.partidoId && data.partidos.some((p) => p.partidoId === info.partidoId && p.cuentaId === cuenta.id)) {
        return { status: 200, body: { ok: true, repetido: true, jugador: publicoJugador(jugador) } };
    }
    if (!info.partidoId && jugador.ultimo && Date.now() - jugador.ultimo < COOLDOWN_MS) {
        return { status: 429, body: { ok: false, error: "Esperá unos segundos antes de anotar otro partido." } };
    }
    if (sumarRanking) {
        aplicarResultado(jugador, info.resultado, info.gf, info.gc);
    } else {
        jugador.ultimo = Date.now();
    }
    const entrada = {
        id: "p_" + randomBytes(6).toString("hex"),
        partidoId: info.partidoId || "",
        cuentaId: cuenta.id,
        resultado: info.resultado,
        gf: info.gf,
        gc: info.gc,
        modo: info.modo,
        cuando: Date.now(),
    };
    if (info.equipoLocal) entrada.equipoLocal = info.equipoLocal;
    if (info.equipoRival) entrada.equipoRival = info.equipoRival;
    if (info.stats) entrada.stats = info.stats;
    data.partidos.push(entrada);
    if (data.partidos.length > 4000) data.partidos.splice(0, data.partidos.length - 4000);
    if (sumarRanking) invalidarRankingCache();
    guardar(data);
    return { status: 200, body: { ok: true, jugador: publicoJugador(jugador) } };
}

/**
 * POST /api/partido (cliente). Solo acepta modos offline oficiales.
 * NO suman al ranking global. Validaciones: coherencia gf/gc, tope/hora, partidoId repetido.
 * El modo "online" solo cuenta cuando lo dispara el servidor (anotarOnline).
 */
export function anotarPartido(token, payload) {
    const info = payloadDe(payload);
    if (!info) return { status: 400, body: { ok: false, error: "Resultado inválido." } };
    if (info.modo === "online") {
        return { status: 403, body: { ok: false, error: "Los partidos online solo los anota el servidor." } };
    }
    if (info.modoBruto === "arcade" || info.modoBruto === "desafio") {
        return { status: 403, body: { ok: false, error: "Los modos Arcade y Desafíos no alteran el historial oficial." } };
    }
    if (!resultadoCoherente(info.resultado, info.gf, info.gc)) {
        return { status: 400, body: { ok: false, error: "El marcador no coincide con el resultado (win/loss/draw)." } };
    }
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    const haceUnaHora = Date.now() - 60 * 60 * 1000;
    const recientes = data.partidos.filter(
        (p) => p.cuentaId === hallada.cuenta.id && (p.cuando || 0) >= haceUnaHora && p.modo !== "online"
    ).length;
    if (recientes >= PARTIDOS_HORA_MAX) {
        return { status: 429, body: { ok: false, error: "Llegaste al tope de partidos por hora. Probá más tarde." } };
    }
    return anotarEn(data, hallada.cuenta, info, { sumarRanking: false });
}

/** Lo llama el servidor al terminar un partido online. No confía en el cliente. */
export function anotarOnline({ cuentaId, resultado, gf, gc, partidoId, stats }) {
    if (!cuentaId || !partidoId) return { ok: false };
    const info = payloadDe({ resultado, gf, gc, modo: "online", partidoId, stats });
    if (!info) return { ok: false };
    if (!resultadoCoherente(info.resultado, info.gf, info.gc)) return { ok: false };
    const data = leer();
    const cuenta = data.cuentas.find((c) => c.id === cuentaId);
    if (!cuenta) return { ok: false };
    const out = anotarEn(data, cuenta, info, { sumarRanking: true });
    return out.body;
}

/** Lista de amigos de la cuenta (nombres). */
export function listarAmigos(token) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const amigos = Array.isArray(hallada.cuenta.amigos) ? hallada.cuenta.amigos : [];
    return {
        status: 200,
        body: {
            ok: true,
            amigos: amigos.map((a) => ({
                nombre: String(a.nombre || "").slice(0, 20),
                desde: a.desde || 0,
            })).filter((a) => a.nombre.length >= 3),
        },
    };
}

/** Reemplaza la lista de amigos de la cuenta (máx 30). */
export function guardarAmigos(token, lista) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const cuenta = data.cuentas.find((c) => c.id === hallada.cuenta.id);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const limpios = [];
    const seen = new Set();
    const arr = Array.isArray(lista) ? lista : [];
    for (const a of arr) {
        const n = normalizarNombre(a && a.nombre);
        if (n.length < 3) continue;
        if (n.toLowerCase() === String(cuenta.nombre).toLowerCase()) continue;
        const k = n.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        limpios.push({ nombre: n, desde: Number(a.desde) || Date.now() });
        if (limpios.length >= 30) break;
    }
    cuenta.amigos = limpios;
    guardar(data);
    return { status: 200, body: { ok: true, amigos: limpios } };
}

/** Etapa 29: fija o limpia explícitamente el equipo favorito de la cuenta. */
export function actualizarEquipoFavorito(token, payload = {}) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const rawFav = payload && typeof payload === "object" ? payload.equipoFavorito : "";
    if (!esEquipoFavoritoValido(rawFav)) {
        return { status: 400, body: { ok: false, error: "Equipo favorito inválido." } };
    }
    const fav = sanitizarEquipoFavorito(rawFav);
    const cuenta = data.cuentas.find((c) => c.id === hallada.cuenta.id);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    cuenta.equipoFavorito = fav;
    const jugador = asegurarJugador(data, cuenta);
    jugador.equipoFavorito = fav;
    invalidarRankingCache();
    guardar(data);
    return {
        status: 200,
        body: { ok: true, equipoFavorito: fav, jugador: publicoJugador(jugador) },
    };
}

/** Etapa 33: obtiene el respaldo de datos de carrera de la cuenta (null para cuentas antiguas). */
export function obtenerDatosCarrera(token) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    return {
        status: 200,
        body: {
            ok: true,
            equipoFavorito: sanitizarEquipoFavorito(hallada.cuenta.equipoFavorito),
            datosCarrera: hallada.cuenta.datosCarrera || null,
        },
    };
}

/** Etapa 33: guarda de forma segura y acotada los datos de carrera de la cuenta. */
export function guardarDatosCarrera(token, payload = {}) {
    const data = leer();
    const hallada = sesionDe(data, token);
    if (!hallada) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const limpio = sanitizarDatosCarreraServidor(payload);
    if (!limpio) {
        return { status: 400, body: { ok: false, error: "Datos de carrera inválidos o demasiado grandes." } };
    }
    const cuenta = data.cuentas.find((c) => c.id === hallada.cuenta.id);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    cuenta.datosCarrera = limpio;
    if (limpio.equipoFavorito) {
        cuenta.equipoFavorito = limpio.equipoFavorito;
        const jugador = asegurarJugador(data, cuenta);
        jugador.equipoFavorito = limpio.equipoFavorito;
        invalidarRankingCache();
    }
    guardar(data);
    return { status: 200, body: { ok: true, actualizadoEn: limpio.actualizadoEn } };
}



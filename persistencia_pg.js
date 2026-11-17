/**
 * Cuentas, sesiones, ranking y partidos en PostgreSQL (Railway).
 * Misma API que persistencia_json.js, pero ASÍNCRONA.
 *
 * Se activa sola cuando existe DATABASE_URL (Railway la define al vincular el Postgres).
 * - Crea las tablas al arrancar (schema.sql).
 * - Si las tablas están vacías y hay un liga.json viejo (disco/Upstash/Gist), lo importa una vez.
 * - Las contraseñas se guardan hasheadas (scrypt), igual que antes: las cuentas existentes siguen andando.
 */
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const scryptAsync = promisify(scrypt);
const RAIZ = dirname(fileURLToPath(import.meta.url));
/** Sesión: 14 días; se renueva en actividad autenticada. */
const SESION_MS = 14 * 24 * 60 * 60 * 1000;
const COOLDOWN_MS = 8000;
const PARTIDOS_HORA_MAX = 40;
const NOMBRES_RESERVADOS = new Set([
    "admin", "administrador", "administrator", "root", "system", "sistema",
    "invitado", "guest", "null", "undefined", "moderador", "mod", "soporte",
    "support", "oficial", "liga", "chaquito", "servidor", "server",
]);

pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT -> number

const URL_DB = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || "";
const pool = new pg.Pool({
    connectionString: URL_DB,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    ssl: /^(1|true|require)$/i.test(process.env.PGSSL || "") ? { rejectUnauthorized: false } : undefined,
});
pool.on("error", (e) => console.error("[postgres] error en conexión inactiva:", e.message));

// ---------------------------------------------------------------------------
// Arranque: tablas + migración desde liga.json
// ---------------------------------------------------------------------------
async function crearTablas() {
    await pool.query(readFileSync(join(RAIZ, "schema.sql"), "utf8"));
}

async function contar() {
    const r = await pool.query("SELECT (SELECT COUNT(*) FROM cuentas)::int AS c, (SELECT COUNT(*) FROM partidos)::int AS p, (SELECT COUNT(*) FROM jugadores)::int AS j");
    return r.rows[0];
}

async function iniciar() {
    let ultimo;
    for (let i = 1; i <= 5; i++) {
        try { await crearTablas(); ultimo = null; break; } catch (e) {
            ultimo = e;
            console.error(`[postgres] no se pudo preparar la base (intento ${i}/5): ${e.message}`);
            await new Promise((r) => setTimeout(r, 2000 * i));
        }
    }
    if (ultimo) throw ultimo;
    const { c } = await contar();
    console.log(`[postgres] listo · ${c} cuenta(s) en la base`);
    if (c === 0) {
        try {
            // Solo se carga el módulo viejo si la base está vacía: trae lo que haya en disco / respaldo remoto.
            const viejo = await import("./persistencia_json.js");
            const data = viejo.exportarRespaldo();
            if (data.cuentas.length) {
                const out = await restaurarRespaldo(data);
                console.log(`[postgres] importadas ${out.body.cuentasAgregadas} cuenta(s) desde el liga.json anterior`);
            }
        } catch (e) {
            console.error("[postgres] no se pudo importar el liga.json anterior:", e.message);
        }
    }
}
// ---------------------------------------------------------------------------
// Utilidades (idénticas a la versión JSON)
// ---------------------------------------------------------------------------
const normalizarNombre = (n) => String(n || "").trim().replace(/\s+/g, " ").slice(0, 20);
function nombrePermitido(n) {
    return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ _][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/.test(n);
}
function nombreReservado(n) {
    const key = String(n || "").toLowerCase().replace(/\s+/g, "");
    return NOMBRES_RESERVADOS.has(key) || NOMBRES_RESERVADOS.has(String(n || "").toLowerCase());
}
async function hashPass(password, salt) {
    const buf = await scryptAsync(String(password), String(salt), 32);
    return buf.toString("hex");
}
function entero(n, max) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v) || v < 0) return 0;
    return Math.min(max, v);
}
const modoValido = (m) => (["solo", "liga", "online"].includes(m) ? m : "solo");
function resultadoCoherente(resultado, gf, gc) {
    if (resultado === "win") return gf > gc;
    if (resultado === "loss") return gf < gc;
    return gf === gc;
}

const publicoJugador = (j) => ({
    id: j.id, nombre: j.nombre,
    pj: j.pj || 0, pg: j.pg || 0, pp: j.pp || 0, pe: j.pe || 0, pts: j.pts || 0, gf: j.gf || 0, gc: j.gc || 0,
});

function payloadDe(payload) {
    const body = typeof payload === "string" ? { resultado: payload } : (payload || {});
    if (!["win", "loss", "draw"].includes(body.resultado)) return null;
    return {
        resultado: body.resultado,
        gf: entero(body.gf, 40),
        gc: entero(body.gc, 40),
        modo: modoValido(body.modo),
        partidoId: body.partidoId ? String(body.partidoId).slice(0, 80) : "",
    };
}

async function conTransaccion(fn) {
    const cl = await pool.connect();
    try {
        await cl.query("BEGIN");
        const out = await fn(cl);
        await cl.query("COMMIT");
        return out;
    } catch (e) {
        await cl.query("ROLLBACK").catch(() => {});
        throw e;
    } finally {
        cl.release();
    }
}

/** Crea la fila de jugador si falta y sincroniza el nombre. */
async function asegurarJugador(q, cuenta) {
    const r = await q.query(
        `INSERT INTO jugadores (id, cuenta_id, nombre) VALUES ($1, $2, $3)
         ON CONFLICT (cuenta_id) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING *`,
        ["j_" + cuenta.id, cuenta.id, cuenta.nombre],
    );
    return r.rows[0];
}

async function crearSesion(q, cuentaId) {
    const token = randomBytes(24).toString("hex");
    const ahora = Date.now();
    await q.query("INSERT INTO sesiones (token, cuenta_id, creada) VALUES ($1, $2, $3)", [token, cuentaId, ahora]);
    q.query("DELETE FROM sesiones WHERE creada < $1", [Date.now() - SESION_MS]).catch(() => {});
    return token;
}

async function sesionDe(q, token, { renovar = false } = {}) {
    if (!token) return null;
    const r = await q.query(
        `SELECT c.id, c.nombre, s.token FROM sesiones s JOIN cuentas c ON c.id = s.cuenta_id
         WHERE s.token = $1 AND s.creada > $2`,
        [token, Date.now() - SESION_MS],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (renovar) {
        // Renovación: desplaza creada hacia adelante (misma columna, sin migración de esquema)
        q.query("UPDATE sesiones SET creada = $1 WHERE token = $2", [Date.now(), token]).catch(() => {});
    }
    return row;
}

async function invalidarSesionesCuenta(q, cuentaId, exceptoToken = "") {
    if (exceptoToken) {
        await q.query("DELETE FROM sesiones WHERE cuenta_id = $1 AND token <> $2", [cuentaId, exceptoToken]);
    } else {
        await q.query("DELETE FROM sesiones WHERE cuenta_id = $1", [cuentaId]);
    }
}

const ERR_DB = { status: 500, body: { ok: false, error: "Error del servidor. Probá de nuevo en unos segundos." } };
function protegido(fn) {
    return async (...a) => {
        try { return await fn(...a); } catch (e) {
            console.error("[postgres]", fn.name || "operación", "falló:", e.message);
            return ERR_DB;
        }
    };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export const registrar = protegido(async function registrar({ nombre, password }) {
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
    const salt = randomBytes(16).toString("hex");
    const hash = await hashPass(password, salt);
    const cuenta = { id: "c_" + randomBytes(8).toString("hex"), nombre: n, salt, hash, creada: Date.now() };
    try {
        return await conTransaccion(async (cl) => {
            await cl.query("INSERT INTO cuentas (id, nombre, salt, hash, creada) VALUES ($1,$2,$3,$4,$5)",
                [cuenta.id, cuenta.nombre, cuenta.salt, cuenta.hash, cuenta.creada]);
            const jugador = await asegurarJugador(cl, cuenta);
            const token = await crearSesion(cl, cuenta.id);
            return { status: 200, body: { ok: true, token, cuenta: { id: cuenta.id, nombre: cuenta.nombre }, jugador: publicoJugador(jugador) } };
        });
    } catch (e) {
        if (e.code === "23505") return { status: 409, body: { ok: false, error: "Ese jugador ya está registrado." } };
        throw e;
    }
});

export const entrar = protegido(async function entrar({ nombre, password }) {
    const n = normalizarNombre(nombre);
    const mal = { status: 401, body: { ok: false, error: "Usuario o contraseña incorrectos." } };
    const r = await pool.query("SELECT * FROM cuentas WHERE LOWER(nombre) = LOWER($1)", [n]);
    const cuenta = r.rows[0];
    if (!cuenta) return mal;
    let intento, real;
    try {
        intento = Buffer.from(await hashPass(password || "", cuenta.salt), "hex");
        real = Buffer.from(cuenta.hash, "hex");
    } catch { return mal; }
    if (intento.length !== real.length || !timingSafeEqual(intento, real)) return mal;
    const jugador = await asegurarJugador(pool, cuenta);
    const token = await crearSesion(pool, cuenta.id);
    return { status: 200, body: { ok: true, token, cuenta: { id: cuenta.id, nombre: cuenta.nombre }, jugador: publicoJugador(jugador) } };
});

export async function salir(token) {
    if (!token) return;
    try { await pool.query("DELETE FROM sesiones WHERE token = $1", [token]); } catch (e) { console.error("[postgres] salir:", e.message); }
}

export async function salirTodos(token) {
    if (!token) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    try {
        const cuenta = await sesionDe(pool, token);
        if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
        await invalidarSesionesCuenta(pool, cuenta.id);
        return { status: 200, body: { ok: true } };
    } catch (e) {
        console.error("[postgres] salirTodos:", e.message);
        return { status: 500, body: { ok: false, error: "Error del servidor." } };
    }
}

export async function cuentaDe(token) {
    try {
        const cuenta = await sesionDe(pool, token, { renovar: true });
        if (!cuenta) return null;
        const jugador = await asegurarJugador(pool, cuenta);
        return { cuenta: { id: cuenta.id, nombre: cuenta.nombre }, jugador: publicoJugador(jugador) };
    } catch (e) {
        console.error("[postgres] cuentaDe:", e.message);
        return null;
    }
}

export const cambiarClave = protegido(async function cambiarClave(token, { passwordActual, passwordNueva }) {
    if (!token) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    if (!passwordNueva || String(passwordNueva).length < 8) {
        return { status: 400, body: { ok: false, error: "La contraseña nueva tiene que tener al menos 8 caracteres." } };
    }
    const cuentaSes = await sesionDe(pool, token);
    if (!cuentaSes) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const r = await pool.query("SELECT * FROM cuentas WHERE id = $1", [cuentaSes.id]);
    const cuenta = r.rows[0];
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    let intento, real;
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
    const hash = await hashPass(passwordNueva, salt);
    return conTransaccion(async (cl) => {
        await cl.query("UPDATE cuentas SET salt = $1, hash = $2 WHERE id = $3", [salt, hash, cuenta.id]);
        await invalidarSesionesCuenta(cl, cuenta.id);
        const nuevoToken = await crearSesion(cl, cuenta.id);
        return { status: 200, body: { ok: true, token: nuevoToken, cuenta: { id: cuenta.id, nombre: cuenta.nombre } } };
    });
});

export async function listarRanking() {
    try {
        const r = await pool.query(
            `SELECT id, nombre, pj, pg, pp, pe, pts, gf, gc FROM jugadores
             ORDER BY pts DESC, pg DESC, pj DESC, nombre COLLATE "C" ASC LIMIT 500`);
        return r.rows.sort((a, b) => b.pts - a.pts || b.pg - a.pg || b.pj - a.pj || a.nombre.localeCompare(b.nombre, "es"));
    } catch (e) {
        console.error("[postgres] ranking:", e.message);
        return [];
    }
}

export async function resumen() {
    try {
        const { c, p, j } = await contar();
        return { cuentas: c, jugadores: j, partidos: p, almacenamiento: { origen: "PostgreSQL", permanente: true } };
    } catch (e) {
        return { cuentas: 0, jugadores: 0, partidos: 0, almacenamiento: { origen: "PostgreSQL (sin conexión)", permanente: true } };
    }
}

export const historial = protegido(async function historial(token, limite = 12) {
    const cuenta = await sesionDe(pool, token);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    const n = Math.max(1, Math.min(30, parseInt(limite, 10) || 12));
    const r = await pool.query(
        "SELECT id, resultado, gf, gc, modo, cuando FROM partidos WHERE cuenta_id = $1 ORDER BY cuando DESC LIMIT $2",
        [cuenta.id, n]);
    return { status: 200, body: { ok: true, partidos: r.rows } };
});

async function anotarEn(cuenta, info, { sumarRanking = true } = {}) {
    return conTransaccion(async (cl) => {
        await asegurarJugador(cl, cuenta);
        const jr = await cl.query("SELECT * FROM jugadores WHERE cuenta_id = $1 FOR UPDATE", [cuenta.id]);
        const j = jr.rows[0];
        if (info.partidoId) {
            const rep = await cl.query("SELECT 1 FROM partidos WHERE partido_id = $1 AND cuenta_id = $2", [info.partidoId, cuenta.id]);
            if (rep.rowCount) return { status: 200, body: { ok: true, repetido: true, jugador: publicoJugador(j) } };
        } else if (j.ultimo && Date.now() - j.ultimo < COOLDOWN_MS) {
            return { status: 429, body: { ok: false, error: "Esperá unos segundos antes de anotar otro partido." } };
        }
        let jugadorOut = j;
        if (sumarRanking) {
            const win = info.resultado === "win", loss = info.resultado === "loss";
            const up = await cl.query(
                `UPDATE jugadores SET pj = pj + 1, gf = gf + $2, gc = gc + $3, ultimo = $4,
                    pg = pg + $5, pp = pp + $6, pe = pe + $7, pts = pts + $8
                 WHERE cuenta_id = $1 RETURNING *`,
                [cuenta.id, info.gf, info.gc, Date.now(), win ? 1 : 0, loss ? 1 : 0, !win && !loss ? 1 : 0, win ? 3 : loss ? 0 : 1]);
            jugadorOut = up.rows[0];
        } else {
            const up = await cl.query(
                `UPDATE jugadores SET ultimo = $2 WHERE cuenta_id = $1 RETURNING *`,
                [cuenta.id, Date.now()]);
            jugadorOut = up.rows[0] || j;
        }
        await cl.query(
            "INSERT INTO partidos (id, partido_id, cuenta_id, resultado, gf, gc, modo, cuando) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            ["p_" + randomBytes(6).toString("hex"), info.partidoId || "", cuenta.id, info.resultado, info.gf, info.gc, info.modo, Date.now()]);
        return { status: 200, body: { ok: true, jugador: publicoJugador(jugadorOut) } };
    });
}

export const anotarPartido = protegido(async function anotarPartido(token, payload) {
    const info = payloadDe(payload);
    if (!info) return { status: 400, body: { ok: false, error: "Resultado inválido." } };
    if (info.modo === "online") {
        return { status: 403, body: { ok: false, error: "Los partidos online solo los anota el servidor." } };
    }
    if (!resultadoCoherente(info.resultado, info.gf, info.gc)) {
        return { status: 400, body: { ok: false, error: "El marcador no coincide con el resultado (win/loss/draw)." } };
    }
    const cuenta = await sesionDe(pool, token);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Tenés que iniciar sesión." } };
    const haceUnaHora = Date.now() - 60 * 60 * 1000;
    const cnt = await pool.query(
        `SELECT COUNT(*)::int AS n FROM partidos
         WHERE cuenta_id = $1 AND cuando >= $2 AND modo <> 'online'`,
        [cuenta.id, haceUnaHora]);
    if ((cnt.rows[0]?.n || 0) >= PARTIDOS_HORA_MAX) {
        return { status: 429, body: { ok: false, error: "Llegaste al tope de partidos por hora. Probá más tarde." } };
    }
    return anotarEn(cuenta, info, { sumarRanking: false });
});

/** Lo llama el servidor al terminar un partido online. No confía en el cliente. */
export async function anotarOnline({ cuentaId, resultado, gf, gc, partidoId }) {
    if (!cuentaId || !partidoId) return { ok: false };
    const info = payloadDe({ resultado, gf, gc, modo: "online", partidoId });
    if (!info) return { ok: false };
    if (!resultadoCoherente(info.resultado, info.gf, info.gc)) return { ok: false };
    try {
        const r = await pool.query("SELECT id, nombre FROM cuentas WHERE id = $1", [cuentaId]);
        if (!r.rows[0]) return { ok: false };
        return (await anotarEn(r.rows[0], info, { sumarRanking: true })).body;
    } catch (e) {
        console.error("[postgres] anotarOnline:", e.message);
        return { ok: false };
    }
}

export function infoAlmacenamiento() {
    return { ruta: "PostgreSQL (DATABASE_URL)", origen: "PostgreSQL", riesgo: false, hospedaje: process.env.RAILWAY_ENVIRONMENT ? "Railway" : "", remoto: "" };
}

/** Respaldo en el mismo formato liga.json (v1) que usa la versión de archivo. */
export async function exportarRespaldo() {
    const [c, s, j, p] = await Promise.all([
        pool.query("SELECT id, nombre, salt, hash, creada FROM cuentas ORDER BY creada"),
        pool.query("SELECT token, cuenta_id AS \"cuentaId\", creada FROM sesiones"),
        pool.query("SELECT id, cuenta_id AS \"cuentaId\", nombre, pj, pg, pp, pe, pts, gf, gc, ultimo FROM jugadores"),
        pool.query("SELECT id, partido_id AS \"partidoId\", cuenta_id AS \"cuentaId\", resultado, gf, gc, modo, cuando FROM partidos ORDER BY cuando"),
    ]);
    return { v: 1, cuentas: c.rows, sesiones: s.rows, jugadores: j.rows, partidos: p.rows };
}

/** Suma cuentas de un respaldo (liga.json). Nunca borra ni pisa las existentes. */
export async function restaurarRespaldo(contenido) {
    let obj = contenido;
    if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch { obj = null; } }
    if (!obj || obj.v !== 1 || !Array.isArray(obj.cuentas)) {
        return { status: 400, body: { ok: false, error: "No es un respaldo válido de liga.json." } };
    }
    const jugadores = Array.isArray(obj.jugadores) ? obj.jugadores : [];
    const partidos = Array.isArray(obj.partidos) ? obj.partidos : [];
    const sesiones = Array.isArray(obj.sesiones) ? obj.sesiones : [];
    try {
        const agregadas = await conTransaccion(async (cl) => {
            let n = 0;
            for (const c of obj.cuentas) {
                if (!c || typeof c.id !== "string" || typeof c.nombre !== "string" || typeof c.hash !== "string" || typeof c.salt !== "string") continue;
                const ins = await cl.query(
                    "INSERT INTO cuentas (id, nombre, salt, hash, creada) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                    [c.id, c.nombre, c.salt, c.hash, Number(c.creada) || Date.now()]);
                if (!ins.rowCount) continue;
                n++;
                const j = jugadores.find((x) => x && x.cuentaId === c.id) || {};
                await cl.query(
                    `INSERT INTO jugadores (id, cuenta_id, nombre, pj, pg, pp, pe, pts, gf, gc, ultimo)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
                    ["j_" + c.id, c.id, c.nombre, entero(j.pj, 1e9), entero(j.pg, 1e9), entero(j.pp, 1e9), entero(j.pe, 1e9),
                        entero(j.pts, 1e9), entero(j.gf, 1e9), entero(j.gc, 1e9), Number(j.ultimo) || 0]);
                for (const p of partidos) {
                    if (!p || p.cuentaId !== c.id || !["win", "loss", "draw"].includes(p.resultado)) continue;
                    await cl.query(
                        "INSERT INTO partidos (id, partido_id, cuenta_id, resultado, gf, gc, modo, cuando) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
                        [String(p.id || "p_" + randomBytes(6).toString("hex")), String(p.partidoId || ""), c.id, p.resultado,
                            entero(p.gf, 40), entero(p.gc, 40), modoValido(p.modo), Number(p.cuando) || Date.now()]);
                }
                for (const s of sesiones) {
                    if (!s || s.cuentaId !== c.id || typeof s.token !== "string") continue;
                    await cl.query("INSERT INTO sesiones (token, cuenta_id, creada) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                        [s.token, c.id, Number(s.creada) || Date.now()]);
                }
            }
            return n;
        });
        const { c } = await contar();
        return { status: 200, body: { ok: true, cuentasAgregadas: agregadas, cuentasTotal: c } };
    } catch (e) {
        console.error("[postgres] restaurar:", e.message);
        return ERR_DB;
    }
}

export async function vaciarRemoto() {
    await pool.end().catch(() => {});
}

// Al final: todo lo de arriba ya está definido (la migración usa restaurarRespaldo).
await iniciar();

export const listarAmigos = protegido(async function listarAmigos(token) {
    const cuenta = await sesionDe(pool, token);
    if (!cuenta) return { status: 401, body: { ok: false, error: "Sin sesión." } };
    const r = await pool.query(
        "SELECT amigo_nombre AS nombre, desde FROM amigos WHERE cuenta_id = $1 ORDER BY desde ASC",
        [cuenta.id],
    );
    return {
        status: 200,
        body: {
            ok: true,
            amigos: r.rows.map((a) => ({
                nombre: String(a.nombre || "").slice(0, 20),
                desde: Number(a.desde) || 0,
            })).filter((a) => a.nombre.length >= 3),
        },
    };
});

export const guardarAmigos = protegido(async function guardarAmigos(token, lista) {
    const cuenta = await sesionDe(pool, token);
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
    await conTransaccion(async (cl) => {
        await cl.query("DELETE FROM amigos WHERE cuenta_id = $1", [cuenta.id]);
        for (const a of limpios) {
            await cl.query(
                "INSERT INTO amigos (cuenta_id, amigo_nombre, desde) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
                [cuenta.id, a.nombre, a.desde],
            );
        }
    });
    return { status: 200, body: { ok: true, amigos: limpios } };
});

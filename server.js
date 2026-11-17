/**
 * Liga Chaquito F8 — entrypoint del servidor.
 * Arma Express + Socket.IO y delega en módulos (rutas/, matchmaking, salas).
 *
 * Ver comentarios de protocolo en versiones anteriores / CHANGELOG_FASE3.md.
 */
import express from "express";
import compression from "compression";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Server } from "socket.io";

import {
    PORT, ROOT, VERSION_JUEGO, origenPermitido, corsOriginRespuesta, ADMIN_TOKEN,
} from "./config.js";
import { setIo, cola, salas, salaPrivadaPorCodigo, tickStats } from "./estado.js";
import { setCrearSala, iniciarLoopMatchmaking } from "./matchmaking.js";
import { crearSala } from "./salas.js";
import { registerOnlineSockets } from "./onlineSockets.js";
import { Partido } from "./partido_online.js";
import {
    vaciarRemoto, forzarGuardado, resumen, infoAlmacenamiento,
} from "./persistencia.js";

import { registrarRutasAuth } from "./rutas/auth.js";
import { registrarRutasRanking } from "./rutas/ranking.js";
import { registrarRutasPartidos } from "./rutas/partidos.js";
import { registrarRutasAmigos } from "./rutas/amigos.js";
import { registrarRutasAdmin } from "./rutas/admin.js";
import { metrics } from "./obs/metrics.js";
import { initErrores, registrarError, instalarHandlersGlobales } from "./obs/errors.js";

// ---------------------------------------------------------------------------
// Rate limiting simple en memoria (por IP)
// ---------------------------------------------------------------------------
const rateBuckets = new Map();
function rateKey(kind, id) {
    return kind + ":" + id;
}
function rateLimit(kind, id, { ventanaMs = 60_000, max = 60, bloqueoMs = 5 * 60_000, fallosParaBloqueo = 0 } = {}) {
    const key = rateKey(kind, id);
    const ahora = Date.now();
    let b = rateBuckets.get(key);
    if (!b || ahora > b.reset) {
        b = { n: 0, reset: ahora + ventanaMs, blockUntil: 0, fallos: 0 };
        rateBuckets.set(key, b);
    }
    if (b.blockUntil && ahora < b.blockUntil) {
        const seg = Math.ceil((b.blockUntil - ahora) / 1000);
        return { ok: false, status: 429, error: `Demasiados intentos. Probá de nuevo en ${seg} s.` };
    }
    b.n += 1;
    if (b.n > max) {
        if (fallosParaBloqueo > 0) {
            b.fallos = (b.fallos || 0) + 1;
            if (b.fallos >= fallosParaBloqueo) {
                b.blockUntil = ahora + bloqueoMs;
                b.fallos = 0;
                const seg = Math.ceil(bloqueoMs / 1000);
                return { ok: false, status: 429, error: `Cuenta o IP bloqueada temporalmente. Esperá ${seg} s.` };
            }
        }
        return { ok: false, status: 429, error: "Demasiados pedidos. Aflojá un toque y reintentá." };
    }
    return { ok: true, bucket: b };
}
function marcarFalloAuth(kind, id) {
    const key = rateKey(kind, id);
    const b = rateBuckets.get(key);
    if (!b) return;
    b.fallos = (b.fallos || 0) + 1;
    if (b.fallos >= 8) {
        b.blockUntil = Date.now() + 10 * 60_000;
        b.fallos = 0;
    }
}
setInterval(() => {
    const ahora = Date.now();
    for (const [k, b] of rateBuckets) {
        if (b.reset < ahora - 120_000 && (!b.blockUntil || b.blockUntil < ahora)) rateBuckets.delete(k);
    }
}, 60_000).unref?.();

function ipDe(req) {
    const xf = req.headers["x-forwarded-for"];
    if (typeof xf === "string" && xf) return xf.split(",")[0].trim().slice(0, 64);
    return (req.ip || req.socket?.remoteAddress || "0.0.0.0").toString().slice(0, 64);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, cb) => {
            if (!origin || origenPermitido(origin)) cb(null, true);
            else cb(new Error("Origen no permitido"), false);
        },
        methods: ["GET", "POST"],
    },
    allowEIO3: true,
    transports: ["websocket", "polling"],
});
setIo(io);
setCrearSala(crearSala);

// Seguridad + CORS + compresión
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "connect-src 'self' ws: wss:",
        "worker-src 'self' blob:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);
    const origin = req.headers.origin;
    if (origin && origenPermitido(origin)) {
        res.setHeader("Access-Control-Allow-Origin", corsOriginRespuesta(origin) || origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Token");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});
app.use(compression({ threshold: 1024 }));
app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/admin")) return next();
    const lim = rateLimit("api", ipDe(req), { ventanaMs: 60_000, max: 120 });
    if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
    next();
});

// Admin (antes del json 32kb)
registrarRutasAdmin(app, { rateLimit, ipDe });

app.use(express.json({ limit: "32kb" }));
app.use("/data", (_req, res) => res.sendStatus(404));

app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, servicio: "liga-chaquito-f8", version: VERSION_JUEGO, nombresUsuario: true });
});
// Observabilidad: métricas (texto tipo Prometheus / JSON) y errores reportados por el cliente
function refrescarGauges() {
    metrics.setGauge("partidos_activos", salas.size);
    metrics.setGauge("cola", cola.length);
}
app.get("/metrics", (_req, res) => {
    refrescarGauges();
    res.type("text/plain").send(metrics.toPrometheus());
});
app.get("/metrics.json", (_req, res) => {
    refrescarGauges();
    res.json(metrics.snapshot());
});
app.post("/client-errors", (req, res) => {
    const lim = rateLimit("client-errors", ipDe(req), { ventanaMs: 60_000, max: 30 });
    if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
    const d = req.body;
    if (!d || typeof d !== "object") return res.status(400).json({ error: "JSON inválido" });
    registrarError("cliente", String(d.mensaje || "error de cliente").slice(0, 500), {
        stack: typeof d.stack === "string" ? d.stack.slice(0, 4000) : undefined,
        url: typeof d.url === "string" ? d.url.slice(0, 500) : undefined,
        ua: String(req.headers["user-agent"] || "").slice(0, 300),
    });
    if (typeof d.latencia_ms === "number" && Number.isFinite(d.latencia_ms) && d.latencia_ms >= 0 && d.latencia_ms < 60_000) {
        metrics.observe("latencia_ms", d.latencia_ms);
    }
    res.sendStatus(204);
});
app.get("/api/version", (_req, res) => {
    res.json({ ok: true, version: VERSION_JUEGO });
});
app.get("/api/estado-servidor", (_req, res) => {
    res.json({
        servicio: "liga-chaquito-f8",
        enCola: cola.length,
        salasPrivadas: salaPrivadaPorCodigo.size,
        salasActivas: salas.size,
    });
});
// "/" lo sirve express.static (index.html del dist o fuente)
app.get("/api/salud", async (_req, res) => {
    const avg = tickStats.n ? tickStats.sumMs / tickStats.n : 0;
    res.json({
        ok: true,
        version: VERSION_JUEGO,
        ...(await resumen()),
        enCola: cola.length,
        salasActivas: salas.size,
        salasPrivadas: salaPrivadaPorCodigo.size,
        tick: {
            hz: Math.round(1000 / (1000 / 60)),
            budgetMs: Math.round((1000 / 60) * 100) / 100,
            n: tickStats.n,
            avgMs: Math.round(avg * 1000) / 1000,
            maxMs: Math.round(tickStats.maxMs * 1000) / 1000,
            overBudget: tickStats.overBudget,
        },
    });
});

// Estáticos: preferir dist/ (Vite build con hash). Fallback al árbol fuente.
const DIST = join(ROOT, "dist");
const USA_DIST = existsSync(join(DIST, "index.html"));
const PRIVADO = /^\/(?:data|node_modules|tests|rutas|obs|scripts|\.[^/]*)(?:\/|$)|^\/(?:server|partido_online|persistencia(?:_json|_pg)?|sim_offline|config|estado|matchmaking|salas|onlineSockets|vite\.config)\.js$|^\/(?:package(?:-lock)?\.json|schema\.sql|Procfile|fly\.toml|railway\.toml|render\.yaml)$|\.(?:md|txt|log)$/i;
app.use((req, res, next) => {
    let ruta = "";
    try { ruta = decodeURIComponent(req.path); } catch { return res.status(400).end(); }
    if (PRIVADO.test(ruta) || ruta.includes("..")) return res.status(404).end();
    next();
});
const staticOpts = {
    setHeaders(res, ruta) {
        // JS/CSS hasheados en dist/a/* → caché larga
        if (USA_DIST && /[\\/]a[\\/][^/]+-[a-f0-9]{8,}\.(js|css)$/i.test(ruta)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            return;
        }
        if (/\.(html|js|mjs|cjs|css|map)$/i.test(ruta)) {
            res.setHeader("Cache-Control", "no-cache");
            return;
        }
        if (/\.(json)$/i.test(ruta)) {
            res.setHeader("Cache-Control", "no-cache");
            return;
        }
        if (/\.(png|jpe?g|gif|webp|svg|ico|mp3|ogg|wav|woff2?|ttf|otf)$/i.test(ruta)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
    },
};
if (USA_DIST) {
    app.use(express.static(DIST, staticOpts));
    console.log("[liga-chaquito] cliente: dist/ (esbuild, assets con hash)");
} else {
    console.log("[liga-chaquito] cliente: fuente (sin dist/; corré npm run build)");
}
app.use(express.static(ROOT, staticOpts));

// API de dominio
const deps = { rateLimit, ipDe, marcarFalloAuth };
registrarRutasAuth(app, deps);
registrarRutasRanking(app);
registrarRutasPartidos(app, deps);
registrarRutasAmigos(app);

// Sockets + matchmaking loop
registerOnlineSockets(io);

const esEntradaDirecta = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esEntradaDirecta) {
    instalarHandlersGlobales();
    console.log("[liga-chaquito] Sentry:", initErrores() ? "activado" : "desactivado");
    httpServer.listen(PORT, "0.0.0.0", () => {
        iniciarLoopMatchmaking();
        console.log(`[liga-chaquito] matchmaking + fisicas en :${PORT}`);
        const alm = infoAlmacenamiento();
        resumen().then((r) => console.log(`[liga-chaquito] cuentas: ${r.cuentas} · guardadas en ${alm.ruta} (${alm.origen})`));
        if (alm.remoto) console.log(`[liga-chaquito] respaldo remoto de cuentas: ${alm.remoto}`);
        const apagar = () => {
            Promise.resolve()
                .then(() => forzarGuardado())
                .then(() => vaciarRemoto())
                .catch(() => {})
                .finally(() => process.exit(0));
        };
        process.once("SIGTERM", apagar);
        process.once("SIGINT", apagar);
        if (alm.riesgo) {
            console.warn(`[liga-chaquito] ATENCIÓN: ${alm.hospedaje} sin disco persistente. Las cuentas se BORRAN en cada deploy. `
                + "Configurá el respaldo remoto (UPSTASH_REDIS_REST_URL/TOKEN o GITHUB_TOKEN+GIST_ID) o un Volume (ver DEPLOY.md).");
        }
        if (!ADMIN_TOKEN) console.log("[liga-chaquito] tip: definí ADMIN_TOKEN para poder bajar/restaurar un respaldo de las cuentas.");
    });
}

export { Partido, app, httpServer, io };

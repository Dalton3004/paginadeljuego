/**
 * Rutas de autenticación: registro, login, logout, perfil, clave.
 */
import {
    registrar, entrar, salir, salirTodos, cuentaDe, cambiarClave,
} from "../persistencia.js";

function tokenDe(req) {
    const h = req.headers.authorization || "";
    if (h.startsWith("Bearer ")) return h.slice(7).trim();
    return (req.headers["x-token"] || req.query?.token || "").toString().trim();
}

export function registrarRutasAuth(app, { rateLimit, ipDe, marcarFalloAuth }) {
    app.post("/api/registro", async (req, res) => {
        const lim = rateLimit("registro", ipDe(req), { ventanaMs: 60_000, max: 8, fallosParaBloqueo: 0 });
        if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
        const out = await registrar(req.body || {});
        res.status(out.status).json(out.body);
    });

    app.post("/api/login", async (req, res) => {
        const lim = rateLimit("login", ipDe(req), { ventanaMs: 60_000, max: 20, fallosParaBloqueo: 0 });
        if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
        const out = await entrar(req.body || {});
        if (!out.body?.ok) marcarFalloAuth("login", ipDe(req));
        res.status(out.status).json(out.body);
    });

    app.post("/api/logout", async (req, res) => {
        const out = (await salir(tokenDe(req))) || { status: 200, body: { ok: true } };
        res.status(out.status || 200).json(out.body || { ok: true });
    });

    app.post("/api/logout-todos", async (req, res) => {
        const out = await salirTodos(tokenDe(req));
        res.status(out.status).json(out.body);
    });

    app.post("/api/cambiar-clave", async (req, res) => {
        const lim = rateLimit("clave", ipDe(req), { ventanaMs: 60_000, max: 10 });
        if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
        const out = await cambiarClave(tokenDe(req), req.body || {});
        res.status(out.status).json(out.body);
    });

    app.get("/api/yo", async (req, res) => {
        const yo = await cuentaDe(tokenDe(req));
        if (!yo) return res.status(401).json({ ok: false, error: "Sin sesión." });
        res.json({ ok: true, ...yo });
    });
}

export { tokenDe };

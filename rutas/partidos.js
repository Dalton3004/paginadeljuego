/**
 * Historial de partidos y anotación offline (solo/liga).
 */
import { historial, anotarPartido } from "../persistencia.js";
import { tokenDe } from "./auth.js";
import { calcularPerfil } from "../perfil.js";

export function registrarRutasPartidos(app, { rateLimit, ipDe }) {
    app.get("/api/partidos", async (req, res) => {
        const out = await historial(tokenDe(req), Number(req.query?.n) || 30);
        res.status(out.status).json(out.body);
    });

    // Perfil: estadísticas, racha y logros sobre los últimos 30 partidos de la cuenta.
    app.get("/api/perfil", async (req, res) => {
        const out = await historial(tokenDe(req), 30);
        if (out.status !== 200) return res.status(out.status).json(out.body);
        res.json({ ok: true, perfil: calcularPerfil(out.body.partidos) });
    });

    app.post("/api/partido", async (req, res) => {
        const lim = rateLimit("partido", ipDe(req), { ventanaMs: 60_000, max: 40 });
        if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
        const out = await anotarPartido(tokenDe(req), req.body || {});
        res.status(out.status).json(out.body);
    });
}

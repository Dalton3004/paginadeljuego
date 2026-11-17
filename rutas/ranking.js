/**
 * Ranking público.
 */
import { listarRanking } from "../persistencia.js";

export function registrarRutasRanking(app) {
    app.get("/api/ranking", async (_req, res) => {
        res.json({ ok: true, ranking: await listarRanking() });
    });
}

/**
 * Respaldo / restauración de cuentas (ADMIN_TOKEN).
 */
import express from "express";
import { exportarRespaldo, restaurarRespaldo, resumen } from "../persistencia.js";
import { ADMIN_TOKEN, VERSION_JUEGO, esAdmin } from "../config.js";
import { salas, cola, salaPrivadaPorCodigo, tickStats } from "../estado.js";
import { metrics } from "../obs/metrics.js";

/** Página del panel (F6 6.8): estática, no trae datos; los datos exigen el token en cada pedido. */
const PAGINA = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin · Liga Chaquito</title>
<style>body{font:14px sans-serif;max-width:860px;margin:2em auto;padding:0 1em}pre{background:#eee;padding:1em;overflow:auto}</style>
<h1>Panel de administración</h1>
<input id="t" type="password" placeholder="ADMIN_TOKEN" autocomplete="off">
<button id="entrar">Entrar</button> <button id="respaldo">Bajar respaldo</button>
<h2>Estado del servidor</h2><pre id="estado">Ingresá el token.</pre>
<script>
const hdr = () => ({ Authorization: "Bearer " + document.getElementById("t").value });
async function cargar() {
  const r = await fetch("/api/admin/estado", { headers: hdr() });
  document.getElementById("estado").textContent = r.ok ? JSON.stringify(await r.json(), null, 2) : "Error " + r.status;
}
document.getElementById("entrar").addEventListener("click", cargar);
document.getElementById("respaldo").addEventListener("click", async () => {
  const r = await fetch("/api/admin/respaldo", { headers: hdr() });
  if (!r.ok) return alert("Error " + r.status);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await r.blob());
  a.download = "respaldo.json";
  a.click();
});
</script></html>`;

/** Foto del servidor en vivo: partidas activas, cola y métricas. No expone ids de socket ni de cuenta. */
export async function estadoAdmin() {
    const ahora = Date.now();
    return {
        ok: true,
        version: VERSION_JUEGO,
        almacenamiento: await resumen(),
        cola: cola.map((c) => ({ pts: c.pts, esperaSeg: Math.round((ahora - c.desde) / 1000) })),
        salasPrivadas: salaPrivadaPorCodigo.size,
        salas: [...salas.values()].map((s) => ({
            id: String(s.id).slice(0, 8),
            estado: s.partido.estado,
            ticks: s.partido.tick,
            local: { nombre: s.partido.nombres.local, equipo: s.partido.equipoLocalId },
            visitante: { nombre: s.partido.nombres.visitante, equipo: s.partido.equipoVisitanteId },
            goles: [s.partido.golesLocal, s.partido.golesVisitante],
            reconectando: !!s.desconexion,
            revancha: !!s.revancha,
        })),
        tick: { n: tickStats.n, maxMs: tickStats.maxMs, overBudget: tickStats.overBudget },
        metricas: metrics.snapshot(),
    };
}

export function registrarRutasAdmin(app, { rateLimit, ipDe } = {}) {
    app.get("/api/admin/respaldo", async (req, res) => {
        if (!ADMIN_TOKEN) return res.sendStatus(404);
        if (!esAdmin(req)) return res.status(401).json({ ok: false, error: "Clave incorrecta." });
        const datos = await exportarRespaldo();
        res.type("json").send(JSON.stringify(datos));
    });

    app.get("/admin", (_req, res) => {
        if (!ADMIN_TOKEN) return res.sendStatus(404);
        res.type("html").send(PAGINA);
    });

    app.get("/api/admin/estado", async (req, res) => {
        if (!ADMIN_TOKEN) return res.sendStatus(404);
        if (rateLimit) {
            const lim = rateLimit("admin", ipDe(req), { ventanaMs: 60_000, max: 30 });
            if (!lim.ok) return res.status(lim.status).json({ ok: false, error: lim.error });
        }
        if (!esAdmin(req)) return res.status(401).json({ ok: false, error: "Clave incorrecta." });
        res.json(await estadoAdmin());
    });

    app.post("/api/admin/restaurar", express.json({ limit: "25mb" }), async (req, res) => {
        if (!ADMIN_TOKEN) return res.sendStatus(404);
        if (!esAdmin(req)) return res.status(401).json({ ok: false, error: "Clave incorrecta." });
        await new Promise((r) => setImmediate(r));
        const out = await restaurarRespaldo(req.body);
        res.status(out.status).json(out.body);
    });
}

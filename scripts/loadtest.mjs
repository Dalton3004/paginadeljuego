/**
 * Test de carga: N partidos simultáneos (Partido real del servidor), mide el tiempo de tick.
 * Uso: node scripts/loadtest.mjs [partidos=20] [ticks=600]
 * Un "tick total" = avanzar TODOS los partidos un paso (lo que el servidor hace cada 1/TICK_HZ s).
 * Falla (exit 1) si el p95 del tick total supera el presupuesto (TICK_BUDGET_MS, default 1000/TICK_HZ).
 */
import { pathToFileURL } from 'node:url';
import { Partido, TICK_HZ } from '../partido_online.js';
import { Metrics } from '../obs/metrics.js';

export function correr({ partidos = 20, ticks = 600 } = {}) {
    const lista = Array.from({ length: partidos }, (_, i) =>
        new Partido(`carga${i}`, `L${i}`, `V${i}`, 'retoneta', 'macabro', { local: `L${i}`, visitante: `V${i}` })
    );
    const muestras = [];
    for (let t = 0; t < ticks; t++) {
        const t0 = process.hrtime.bigint();
        for (const p of lista) p.avanzar();
        muestras.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return {
        partidos,
        ticks,
        hz: TICK_HZ,
        budget_ms: 1000 / TICK_HZ,
        avg_ms: muestras.reduce((a, b) => a + b, 0) / muestras.length,
        p95_ms: Metrics.percentile(muestras, 95),
        max_ms: Math.max(...muestras),
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [partidos, ticks] = process.argv.slice(2).map(Number);
    const r = correr({ partidos: partidos || 20, ticks: ticks || 900 });
    console.log(JSON.stringify(r, null, 2));
    const budget = Number(process.env.TICK_BUDGET_MS) || r.budget_ms;
    if (r.p95_ms > budget) {
        console.error(`FALLO: p95 ${r.p95_ms.toFixed(3)}ms > ${budget}ms`);
        process.exit(1);
    }
}

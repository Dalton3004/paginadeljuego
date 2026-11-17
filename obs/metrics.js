/**
 * Métricas básicas en memoria: partidos activos, cola, latencia, tick.
 * Se exponen en /metrics (texto tipo Prometheus) y /metrics.json.
 */
export class Metrics {
    constructor() {
        this.gauges = { partidos_activos: 0, cola: 0 };
        this.counters = { errores_servidor: 0, errores_cliente: 0 };
        this.series = { latencia_ms: [], tick_ms: [] };
        this.maxSamples = 1000;
    }
    setGauge(name, v) {
        this.gauges[name] = v;
    }
    inc(name, n = 1) {
        this.counters[name] = (this.counters[name] || 0) + n;
    }
    observe(name, v) {
        const s = (this.series[name] ||= []);
        s.push(v);
        if (s.length > this.maxSamples) s.shift();
    }
    static percentile(arr, p) {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
    }
    summary(name) {
        const a = this.series[name] || [];
        return {
            count: a.length,
            avg: a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0,
            p50: Metrics.percentile(a, 50),
            p95: Metrics.percentile(a, 95),
            max: a.length ? Math.max(...a) : 0,
        };
    }
    snapshot() {
        const series = {};
        for (const k of Object.keys(this.series)) series[k] = this.summary(k);
        return { gauges: { ...this.gauges }, counters: { ...this.counters }, series };
    }
    /** Formato texto estilo Prometheus. */
    toPrometheus() {
        const out = [];
        for (const [k, v] of Object.entries(this.gauges)) out.push(`${k} ${v}`);
        for (const [k, v] of Object.entries(this.counters)) out.push(`${k}_total ${v}`);
        for (const k of Object.keys(this.series)) {
            const s = this.summary(k);
            out.push(`${k}{q="avg"} ${s.avg}`, `${k}{q="p95"} ${s.p95}`, `${k}{q="max"} ${s.max}`);
        }
        return out.join('\n') + '\n';
    }
}

export const metrics = new Metrics();

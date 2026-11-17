/**
 * Telemetría del cliente: reporta errores a /client-errors y mide la latencia (RTT a /health).
 * No toca NetSync (suavizado de snapshots); es independiente.
 */
export function crearTelemetria({ baseUrl = '', fetchFn = (...a) => globalThis.fetch(...a) } = {}) {
    const enviar = (payload) =>
        fetchFn(baseUrl + '/client-errors', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch(() => {});
    return {
        reportarError(err, extra = {}) {
            const e = err instanceof Error ? err : new Error(String(err));
            return enviar({ mensaje: e.message, stack: e.stack, url: globalThis.location && globalThis.location.href, ...extra });
        },
        /** Mide RTT de una petición y lo reporta. */
        async medirLatencia() {
            const t0 = Date.now();
            try {
                await fetchFn(baseUrl + '/health');
            } catch (e) {
                return this.reportarError(e, { tipo: 'conexion' });
            }
            const ms = Date.now() - t0;
            await enviar({ mensaje: 'latencia', latencia_ms: ms, tipo: 'metrica' });
            return ms;
        },
        instalarHandlersGlobales() {
            globalThis.addEventListener('error', (ev) => this.reportarError(ev.error || ev.message));
            globalThis.addEventListener('unhandledrejection', (ev) => this.reportarError(ev.reason));
        },
    };
}

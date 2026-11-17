/**
 * Registro de errores con integración tipo Sentry, DESACTIVADA por defecto.
 * Se activa solo si SENTRY_ENABLED=1 y existe SENTRY_DSN (y @sentry/node instalado).
 */
import { createRequire } from 'node:module';
import { metrics } from './metrics.js';

const require = createRequire(import.meta.url);
let sentry = null;

export function initErrores(env = process.env) {
    if (env.SENTRY_ENABLED !== '1' || !env.SENTRY_DSN) return false;
    try {
        sentry = require('@sentry/node');
        sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV || 'development' });
        return true;
    } catch (e) {
        console.warn('[errores] Sentry solicitado pero no disponible:', e.message);
        sentry = null;
        return false;
    }
}

export function registrarError(origen, err, contexto = {}) {
    const e = err instanceof Error ? err : new Error(String(err));
    metrics.inc(origen === 'cliente' ? 'errores_cliente' : 'errores_servidor');
    console.error(JSON.stringify({ nivel: 'error', origen, mensaje: e.message, stack: e.stack, ...contexto }));
    if (sentry) {
        sentry.withScope((s) => {
            s.setTag('origen', origen);
            s.setExtras(contexto);
            sentry.captureException(e);
        });
    }
}

export function instalarHandlersGlobales() {
    process.on('uncaughtException', (e) => registrarError('servidor', e, { tipo: 'uncaughtException' }));
    process.on('unhandledRejection', (e) => registrarError('servidor', e, { tipo: 'unhandledRejection' }));
}

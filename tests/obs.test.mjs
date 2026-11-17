// Observabilidad sin red: métricas, errores y Sentry desactivado por defecto.
// node --test tests/obs.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Metrics, metrics } from '../obs/metrics.js';
import { initErrores, registrarError } from '../obs/errors.js';

describe('metrics', () => {
    test('percentiles y resumen', () => {
        const m = new Metrics();
        for (let i = 1; i <= 100; i++) m.observe('tick_ms', i);
        const s = m.summary('tick_ms');
        assert.equal(s.count, 100);
        assert.equal(s.p50, 50);
        assert.equal(s.p95, 95);
        assert.equal(s.max, 100);
    });

    test('la ventana de muestras está acotada', () => {
        const m = new Metrics();
        m.maxSamples = 10;
        for (let i = 0; i < 50; i++) m.observe('x', i);
        assert.equal(m.series.x.length, 10);
    });

    test('formato Prometheus', () => {
        const m = new Metrics();
        m.setGauge('partidos_activos', 3);
        m.inc('errores_cliente');
        m.observe('latencia_ms', 42);
        const txt = m.toPrometheus();
        assert.match(txt, /partidos_activos 3/);
        assert.match(txt, /errores_cliente_total 1/);
        assert.match(txt, /latencia_ms\{q="p95"\} 42/);
    });
});

describe('errores', () => {
    test('Sentry desactivado por defecto', () => {
        assert.equal(initErrores({}), false);
        assert.equal(initErrores({ SENTRY_DSN: 'x' }), false);
    });

    test('registrarError cuenta por origen', () => {
        const antes = { ...metrics.counters };
        const orig = console.error;
        console.error = () => {};
        try {
            registrarError('cliente', 'boom');
            registrarError('servidor', new Error('x'));
        } finally {
            console.error = orig;
        }
        assert.equal(metrics.counters.errores_cliente, antes.errores_cliente + 1);
        assert.equal(metrics.counters.errores_servidor, antes.errores_servidor + 1);
    });
});

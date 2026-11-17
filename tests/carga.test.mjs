// Carga: 20 partidos simultáneos tienen que entrar en el presupuesto de tick del servidor.
// node --test tests/carga.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correr } from '../scripts/loadtest.mjs';

test('carga: 20 partidos simultáneos dentro del presupuesto de tick', () => {
    const r = correr({ partidos: 20, ticks: 500 });
    assert.ok(r.p95_ms < r.budget_ms, `p95 ${r.p95_ms}ms excede ${r.budget_ms}ms`);
});

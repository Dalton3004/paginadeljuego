// El servidor descartaba TODO el input online porque el cliente manda `tiro` y `barrer` (botones táctiles)
// y la lista de teclas permitidas no los incluía: nadie se podía mover.
// node --test tests/input_valido.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputValido } from '../onlineSockets.js';

test('inputValido acepta exactamente lo que manda el cliente (game/online.js: this.teclas)', () => {
    const cliente = { w: false, a: false, s: true, d: false, espacio: false, tiro: true, barrer: false, shift: true, e: false, r: false, q: false };
    assert.equal(inputValido(cliente), true);
});

test('inputValido sigue rechazando claves desconocidas, valores raros y no-objetos', () => {
    assert.equal(inputValido({ w: true, hack: true }), false);
    assert.equal(inputValido({ w: 'si' }), false);
    assert.equal(inputValido([true]), false);
    assert.equal(inputValido(null), false);
});

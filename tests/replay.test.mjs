// Replay del gol (F8 8.6): buffer de ~5 s, clip congelado e inmune a mutaciones.
// node --test tests/replay.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Replay } from '../sim/replay.js';

const snap = (t, x = 0) => ({ t, pelota: { x, y: 0 }, jugadores: [{ id: 'a', x, y: 0, lado: 0 }] });

describe('replay', () => {
    test('guarda solo los últimos ~5 s', () => {
        const r = new Replay({ duracionSeg: 5, hz: 30 });
        for (let i = 0; i < 30 * 12; i++) r.grabar(snap(i / 30));
        const dur = r.buffer[r.buffer.length - 1].t - r.buffer[0].t;
        assert.ok(dur <= 5.01, `duración ${dur}`);
        assert.ok(r.buffer.length <= r.maxFrames);
    });

    test('sin grabaciones no hay clip', () => {
        assert.equal(new Replay().capturarGol(), false);
    });

    test('el clip es una copia: mutar el snapshot original no lo altera', () => {
        const r = new Replay();
        const s = snap(0, 10);
        r.grabar(s);
        r.grabar(snap(1, 20));
        r.capturarGol();
        s.pelota.x = 999;
        s.jugadores[0].x = 999;
        assert.equal(r.clip[0].pelota.x, 10);
        assert.equal(r.clip[0].jugadores[0].x, 10);
    });

    test('reproduce hasta el final y se detiene; saltar() corta antes', () => {
        const r = new Replay({ duracionSeg: 5, hz: 10 });
        for (let i = 0; i <= 20; i++) r.grabar(snap(i / 10, i));
        assert.equal(r.capturarGol(), true);
        const mitad = r.avanzar(1);
        assert.ok(mitad && r.reproduciendo);
        const fin = r.avanzar(10);
        assert.equal(fin.pelota.x, 20);
        assert.equal(r.reproduciendo, false);
        assert.equal(r.avanzar(0.1), null);
        r.capturarGol();
        r.saltar();
        assert.equal(r.reproduciendo, false);
    });
});

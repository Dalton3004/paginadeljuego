// Partido online sin red: dos "sockets" mandan teclas; snapshot y reconexión.
// node --test tests/online.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Partido } from '../partido_online.js';

describe('partido online', () => {
    let p;
    const idle = {
        w: false, a: false, s: false, d: false, shift: false,
        espacio: false, tiro: false, barrer: false, e: false, r: false, q: false,
    };
    const input = (id, o) => p.aplicarInput(id, Object.assign({}, idle, o));

    test('el partido online arranca (prematch + cuenta regresiva) y pasa a EN_JUEGO', () => {
        p = new Partido('sala1', 'A', 'B', 'retoneta', 'macabro', { local: 'Ana', visitante: 'Beto' });
        for (let i = 0; i < 60 * 7 && p.gestor.estado !== 'EN_JUEGO'; i++) p.avanzar();
        assert.equal(p.gestor.estado, 'EN_JUEGO');
    });

    test('la tecla R en el online manda un pase elevado', () => {
        const h = p.lados.local.humano;
        p.ball.owner = h;
        h.hasBall = true;
        h.facing.set(0, -1);
        input('A', { r: true });
        p.avanzar();
        input('A', {});
        let zmax = 0;
        let bytes = 0;
        let snaps = 0;
        for (let i = 0; i < 90; i++) {
            p.avanzar();
            const s = p.snapshot();
            zmax = Math.max(zmax, s.pelota.z);
            if (i % 2 === 0) {
                bytes += JSON.stringify(s).length;
                snaps++;
            }
            assert.ok(typeof s.pelota.z === 'number');
        }
        assert.ok(zmax > 25, 'R lanzó la pelota por el aire en el servidor (z máx ' + zmax.toFixed(1) + ')');
        const kbs = bytes / snaps / 1024;
        assert.ok(kbs > 0 && kbs < 50);
    });

    test('el snapshot incluye z y pesa poco', () => {
        const s = p.snapshot();
        assert.ok(typeof s.pelota.z === 'number');
        const kb = JSON.stringify(s).length / 1024;
        assert.ok(kb < 20, 'snapshot compacto');
    });

    test('30 s con teclas al azar de los dos lados: ningún valor inválido', () => {
        for (let i = 0; i < 60 * 30; i++) {
            if (i % 20 === 0) {
                input('A', {
                    w: Math.random() < 0.5,
                    d: Math.random() < 0.5,
                    shift: Math.random() < 0.3,
                    e: Math.random() < 0.2,
                    r: Math.random() < 0.1,
                });
                input('B', {
                    s: Math.random() < 0.5,
                    a: Math.random() < 0.5,
                    espacio: Math.random() < 0.3,
                });
            }
            p.avanzar();
            const s = p.snapshot();
            for (const j of s.jugadores) assert.ok(isFinite(j.x) && isFinite(j.y));
            assert.ok(isFinite(s.pelota.x) && isFinite(s.pelota.z) && s.pelota.z >= 0);
        }
    });

    test('rebindearSocket mueve el control al nuevo socketId', () => {
        const p2 = new Partido('sala2', 'S1', 'S2', 'retoneta', 'macabro', { local: 'A', visitante: 'B' });
        for (let i = 0; i < 60 * 7 && p2.gestor.estado !== 'EN_JUEGO'; i++) p2.avanzar();
        assert.equal(p2.gestor.estado, 'EN_JUEGO');
        assert.ok(p2.rebindearSocket('local', 'S1b'));
        assert.equal(p2.porSocket.get('S1b'), 'local');
        assert.equal(p2.porSocket.get('S1'), undefined);
        p2.aplicarInput('S1b', Object.assign({}, idle, { w: true }));
        p2.avanzar();
        assert.equal(p2.lados.local.humano.keys.up, true);
    });

    test('forzarVictoriaAbandono deja 3-0 y FINALIZADO', () => {
        const p3 = new Partido('sala3', 'X', 'Y', 'retoneta', 'macabro', { local: 'A', visitante: 'B' });
        p3.forzarVictoriaAbandono('local');
        assert.equal(p3.gestor.estado, 'FINALIZADO');
        assert.equal(p3.golesLocal, 3);
        assert.equal(p3.golesVisitante, 0);
        p3.forzarVictoriaAbandono('rival');
        assert.equal(p3.golesLocal, 3);
    });
});

// Perfil (F6 6.5): estadísticas, rachas y logros. Lógica pura, sin red.
// node --test tests/perfil.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPerfil, LOGROS } from '../perfil.js';

// historial() devuelve el más NUEVO primero; armamos en orden cronológico y lo damos vuelta.
const hist = (...p) => p.map(([resultado, gf, gc]) => ({ resultado, gf, gc, modo: 'online', cuando: 0 })).reverse();

describe('perfil', () => {
    test('sin partidos: todo en cero y sin logros', () => {
        const p = calcularPerfil([]);
        assert.equal(p.partidas, 0);
        assert.equal(p.efectividad, 0);
        assert.equal(p.rachaActual, 0);
        assert.ok(p.logros.every((l) => !l.desbloqueado));
    });

    test('totales, efectividad, racha actual y vallas invictas', () => {
        const p = calcularPerfil(hist(['loss', 0, 2], ['win', 3, 0], ['win', 2, 1], ['win', 1, 0]));
        assert.equal(p.partidas, 4);
        assert.deepEqual([p.ganadas, p.empatadas, p.perdidas], [3, 0, 1]);
        assert.equal(p.golesFavor, 6);
        assert.equal(p.golesContra, 3);
        assert.equal(p.efectividad, 75);
        assert.equal(p.mejorRacha, 3);
        assert.equal(p.rachaActual, 3);
        assert.equal(p.vallasInvictas, 2);
    });

    test('un empate corta la racha actual; derrotas seguidas dan racha negativa', () => {
        assert.equal(calcularPerfil(hist(['win', 1, 0], ['win', 1, 0], ['draw', 1, 1])).rachaActual, 0);
        assert.equal(calcularPerfil(hist(['win', 1, 0], ['loss', 0, 1], ['loss', 0, 2])).rachaActual, -2);
    });

    test('logros se desbloquean con sus condiciones', () => {
        const p = calcularPerfil(hist(['win', 2, 0], ['win', 2, 0], ['win', 1, 0]));
        const ok = Object.fromEntries(p.logros.map((l) => [l.id, l.desbloqueado]));
        assert.equal(ok.primer_partido, true);
        assert.equal(ok.primera_victoria, true);
        assert.equal(ok.racha_3, true);
        assert.equal(ok.goleador, true); // 5 goles
        assert.equal(ok.muralla, true);
        assert.equal(ok.veterano, false); // 3 partidos, no 10
        assert.equal(p.logros.length, Object.keys(LOGROS).length);
    });

    test('no modifica el arreglo recibido', () => {
        const h = hist(['win', 1, 0], ['loss', 0, 1]);
        const copia = JSON.stringify(h);
        calcularPerfil(h);
        assert.equal(JSON.stringify(h), copia);
    });
});

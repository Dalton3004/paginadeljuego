// Replay del gol (F8 8.6 + Fase A Etapa 3): buffer temporal, archivo multi-gol,
// interpolación, cámara con zoom/seguimiento de pelota, cámara lenta y pausa de impacto.
// node --test tests/replay.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Replay, CamaraReplay } from '../sim/replay.js';

const snap = (t, x = 240, y = 320) => ({
    t,
    pelota: { x, y, z: 0 },
    jugadores: [{ id: 'a', x, y, lado: 0 }],
});

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

    test('archiva múltiples goles y permite reproducirlos por índice en post-partido', () => {
        const r = new Replay({ duracionSeg: 4, hz: 10 });
        for (let i = 0; i <= 15; i++) r.grabar(snap(i / 10, 100 + i, 200));
        r.capturarGol({ nombre: 'Fabri', minuto: 22, marcadorLocal: 1, marcadorRival: 0 });
        r.agregarColaGol(snap(1.6, 240, 80), 0.45);

        for (let i = 20; i <= 35; i++) r.grabar(snap(i / 10, 200 + i, 150));
        r.capturarGol({ nombre: 'Mariano', minuto: 78, marcadorLocal: 2, marcadorRival: 0 });

        assert.equal(r.goles.length, 2);
        assert.equal(r.reproducirGol(0), true);
        assert.equal(r.metaActual.nombre, 'Fabri');
        assert.equal(r.reproducirGol(1), true);
        assert.equal(r.metaActual.nombre, 'Mariano');
        assert.equal(r.reproducirGol(99), false);
    });

    test('avanzarConCamara interpola, aplica pausa de impacto, cámara lenta y encuadre dentro de 480x640', () => {
        const r = new Replay({ duracionSeg: 4, hz: 10 });
        for (let i = 0; i <= 20; i++) {
            r.grabar(snap(i / 10, 20 + i * 10, 580 - i * 24));
        }
        r.capturarGol({ nombre: 'Fabri', minuto: 45 });
        r.agregarColaGol(snap(2.2, 240, 75), 0.45);

        let vioPausaImpacto = false;
        let vioCamaraLenta = false;
        let pasos = 0;
        while (r.reproduciendo && pasos < 400) {
            const info = r.avanzarConCamara(1 / 30);
            assert.ok(info && info.frame && info.camara);
            if (info.enPausaImpacto) vioPausaImpacto = true;
            if (info.enCamaraLenta) vioCamaraLenta = true;
            // Verificar que la cámara nunca muestre fuera del lienzo 480x640
            const z = info.camara.zoom;
            assert.ok(z >= 1.1 && z <= 1.5);
            assert.ok(info.camara.offsetX <= 0.01 && info.camara.offsetX >= 480 * (1 - z) - 0.01);
            assert.ok(info.camara.offsetY <= 0.01 && info.camara.offsetY >= 640 * (1 - z) - 0.01);
            pasos++;
        }
        assert.equal(r.reproduciendo, false);
        assert.equal(vioPausaImpacto, true, 'hubo micro-pausa dramática en el impacto del gol');
        assert.equal(vioCamaraLenta, true, 'hubo cámara lenta en el tramo final');

        assert.equal(r.alternarVelocidad(), 0.5);
        assert.equal(r.alternarVelocidad(), 1);
    });

    test('CamaraReplay mantiene encuadre válido aun con pelota en las esquinas extremas', () => {
        const cam = new CamaraReplay({ width: 480, height: 640 });
        for (const [x, y] of [[0, 0], [480, 640], [0, 640], [480, 0]]) {
            const out = cam.actualizar(snap(1, x, y), { dt: 0.5, cursor: 1, duracion: 1 });
            const halfW = 480 / (2 * out.zoom);
            const halfH = 640 / (2 * out.zoom);
            assert.ok(out.cx >= halfW - 1e-6 && out.cx <= 480 - halfW + 1e-6);
            assert.ok(out.cy >= halfH - 1e-6 && out.cy <= 640 - halfH + 1e-6);
        }
    });
});

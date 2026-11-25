/**
 * Tests unitarios y de integración — FASE A (Etapas 0, 1, 2 y 4):
 * Planteles, Estadísticas reales del motor, Valoración y Figura del Partido,
 * Impacto en tabla de Liga y Persistencia/Perfil.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarSimulacion } from '../sim_offline.js';
import { LigaCore } from '../liga.js';
import { sanitizarStatsPartido, HistorialLocalStore } from '../perfil.js';
import { Partido } from '../partido_online.js';

const S = cargarSimulacion();
const {
    CONFIG,
    Pelota,
    Jugador,
    GestorPartido,
    EstadoPartido,
    calcularValoraciones,
    asignarNombresPlantel,
} = S;

const DT = 1 / 60;

function crearPartidoPrueba() {
    const cx = CONFIG.WIDTH / 2;
    const cy = CONFIG.HEIGHT / 2;
    const players = [
        new Jugador(cx, 430, { isHuman: true, team: 'local', mobilityId: 'local_0' }),
        new Jugador(cx - 70, 430, { team: 'local', mobilityId: 'local_1' }),
        new Jugador(cx + 70, 490, { team: 'local', mobilityId: 'local_2' }),
        new Jugador(cx, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }),
        new Jugador(cx, 210, { team: 'rival', mobilityId: 'rival_0' }),
        new Jugador(cx - 70, 160, { team: 'rival', mobilityId: 'rival_1' }),
        new Jugador(cx + 70, 160, { team: 'rival', mobilityId: 'rival_2' }),
        new Jugador(cx, 95, { team: 'rival', isGK: true, mobilityId: 'rival_gk' }),
    ];
    const ball = new Pelota(cx, cy);
    const gestor = new GestorPartido(ball, players, {
        equipoLocalId: 'retoneta',
        equipoRivalId: 'el_boguero',
    });
    gestor.estado = EstadoPartido.EN_JUEGO;
    for (const p of players) p.frozen = false;
    return { ball, players, gestor };
}

describe('Etapa 0 y 4 — Planteles e identidad', () => {
    test('asigna nombres reales de La Retoneta (Fabri, Mariano, Reta) y del rival sin alterar física', () => {
        const { players } = crearPartidoPrueba();
        assert.equal(players[0].nombre, 'Fabri');
        assert.equal(players[1].nombre, 'Mariano');
        assert.equal(players[2].nombre, 'Reta');
        assert.equal(players[3].nombre, 'Gato');
        assert.equal(players[4].nombre, 'Boguero');
        assert.equal(players[7].isGK, true);
    });

    test('equipos desconocidos reciben nombres de respaldo seguros', () => {
        const ps = [
            new Jugador(100, 400, { team: 'local', mobilityId: 'local_0' }),
            new Jugador(100, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }),
        ];
        asignarNombresPlantel(ps, { localId: 'club_inexistente' });
        assert.ok(ps[0].nombre.length >= 3);
        assert.equal(ps[1].nombre, 'Arquero');
    });
});

describe('Etapa 1 — Estadísticas reales desde eventos de la simulación', () => {
    test('posesión, ataques y llegadas al área se calculan con tiempo real de control', () => {
        const { ball, players, gestor } = crearPartidoPrueba();
        // Congelamos IA para medir tiempo exacto de posesión
        for (const p of players) p.frozen = true;

        players[0].pos.set(240, 200); // tercio ofensivo rival
        ball.owner = players[0];
        players[0].hasBall = true;
        for (let i = 0; i < 60; i++) gestor.update(DT); // 1.0 s local

        players[0].hasBall = false;
        ball.owner = players[4];
        players[4].hasBall = true;
        players[4].pos.set(240, 460); // tercio ofensivo de rival
        for (let i = 0; i < 180; i++) gestor.update(DT); // 3.0 s rival

        const s = gestor.stats.serializar();
        assert.equal(s.equipos.local.posesionPct, 25);
        assert.equal(s.equipos.rival.posesionPct, 75);
        assert.equal(s.equipos.local.posesionPct + s.equipos.rival.posesionPct, 100);
        assert.ok(Math.abs(s.equipos.local.tiempoPosesion - 1.0) < 0.05);
        assert.ok(Math.abs(s.equipos.rival.tiempoPosesion - 3.0) < 0.05);
        assert.equal(s.equipos.local.ataques, 1);
        assert.equal(s.equipos.rival.ataques, 1);
        assert.deepEqual(s.soporteMotor, { faltas: false, corners: false });
    });

    test('pase completado entre compañeros vs pase interceptado (recuperación y pérdida)', () => {
        const { ball, players, gestor } = crearPartidoPrueba();
        const fabri = players[0];
        const mariano = players[1];
        const rival = players[4];
        for (const p of players) if (p !== fabri && p !== mariano && p !== rival) p.pos.set(40, 320);

        // 1) Pase limpio de Fabri a Mariano
        fabri.pos.set(240, 430);
        mariano.pos.set(170, 430);
        rival.pos.set(240, 160);
        fabri.facing.set(-1, 0);
        ball.owner = fabri;
        fabri.hasBall = true;
        gestor.stats.registrarControl({ jugador: fabri, motivo: 'control' });

        fabri.actionPass(ball, [mariano]);
        for (let i = 0; i < 50 && ball.owner !== mariano; i++) gestor.update(DT);
        assert.equal(ball.owner, mariano, 'Mariano recibe el pase real');
        assert.equal(gestor.stats.equipos.local.pases, 1);
        assert.equal(gestor.stats.equipos.local.pasesCompletados, 1);

        // 2) Pase de Mariano interceptado en el camino por el rival
        mariano.isHuman = true;
        fabri.isHuman = false;
        fabri.pos.set(350, 430);
        rival.pos.set(250, 430); // parado exactamente en la línea de pase
        mariano.facing.set(1, 0);
        mariano.actionPass(ball, [fabri]);
        for (let i = 0; i < 40 && ball.owner !== rival; i++) gestor.update(DT);
        assert.equal(ball.owner, rival, 'El rival intercepta el pase');

        const s = gestor.stats.serializar();
        assert.equal(s.equipos.local.pases, 2);
        assert.equal(s.equipos.local.pasesCompletados, 1);
        assert.equal(s.equipos.local.perdidas, 1);
        assert.equal(s.equipos.rival.recuperaciones, 1);
    });

    test('barrida real que quita la pelota suma barrida, barrida exitosa, recuperación y pérdida', () => {
        const { ball, players, gestor } = crearPartidoPrueba();
        const fabri = players[0];
        const rival = players[4];
        for (const p of players) {
            if (p !== fabri && p !== rival) {
                p.pos.set(420, 320);
                p.frozen = true;
            }
        }
        rival.pos.set(220, 360);
        rival.facing.set(0, 1);
        rival.frozen = false;
        ball.owner = rival;
        rival.hasBall = true;
        gestor.stats.registrarControl({ jugador: rival, motivo: 'control' });

        fabri.pos.set(220, 392);
        fabri.facing.set(0, -1);
        fabri.hasBall = false;
        fabri.barrida();

        for (let i = 0; i < 20 && ball.owner !== fabri; i++) gestor.update(DT);
        assert.equal(ball.owner, fabri, 'Fabri roba la pelota barriendo');

        const s = gestor.stats.serializar();
        assert.equal(s.equipos.local.barridas, 1);
        assert.equal(s.equipos.local.barridasExitosas, 1);
        assert.equal(s.equipos.local.recuperaciones, 1);
        assert.equal(s.equipos.rival.perdidas, 1);
    });

    test('remate al arco y atajada real del arquero rival quedan registrados', () => {
        const { ball, players, gestor } = crearPartidoPrueba();
        const fabri = players[0];
        const gkRival = players[7];
        for (const p of players) {
            if (p !== fabri && p !== gkRival) p.frozen = true;
        }
        // En el motor real la línea base del arquero rival es FIELD.TOP + 24 (~123, torso en ~96 delante de lineY=99)
        gkRival.pos.set(240, CONFIG.FIELD.TOP + 24);
        fabri.pos.set(240, 210);
        fabri.facing.set(0, -1);
        ball.owner = fabri;
        fabri.hasBall = true;
        gestor.stats.registrarControl({ jugador: fabri });
        gestor.update(DT); // alinea ball.pos a los pies de Fabri

        fabri.patear(ball, 1.0, 0);
        for (let i = 0; i < 40; i++) {
            gkRival.pos.set(240, CONFIG.FIELD.TOP + 24);
            gestor.update(DT);
        }

        const s = gestor.stats.serializar();
        assert.equal(s.equipos.local.tiros, 1);
        assert.equal(s.equipos.local.tirosAlArco, 1);
        assert.equal(s.equipos.rival.atajadas, 1);
        assert.equal(gestor.golesLocal, 0);
        assert.ok(s.eventos.some((e) => e.tipo === 'atajada' && e.team === 'rival'));
    });

    test('pase + gol registra goleador real, asistencia real y minuto', () => {
        const { ball, players, gestor } = crearPartidoPrueba();
        const fabri = players[0];
        const mariano = players[1];
        // Corremos al resto a un costado y quietos para que el pase y el remate entren limpios
        for (const p of players) {
            if (p !== fabri && p !== mariano) {
                p.pos.set(60, 320);
                p.frozen = true;
            }
        }
        mariano.isHuman = true;
        fabri.isHuman = true; // quieto con teclas vacías, pero activo para recibir el pase
        mariano.pos.set(185, 195);
        fabri.pos.set(240, 185);
        mariano.facing.set(1, -0.15);
        ball.owner = mariano;
        mariano.hasBall = true;
        gestor.framesRestantes = 30 * CONFIG.TARGET_FPS; // minuto ~60'
        gestor.stats.registrarControl({ jugador: mariano });

        // Mariano asiste a Fabri
        mariano.actionPass(ball, [fabri]);
        for (let i = 0; i < 45 && ball.owner !== fabri; i++) {
            gestor.update(DT);
        }
        assert.equal(ball.owner, fabri);

        // Fabri define al arco vacío
        fabri.facing.set(0, -1);
        fabri.patear(ball, 1.1, 0.1);
        for (let i = 0; i < 45 && gestor.estado === EstadoPartido.EN_JUEGO; i++) {
            gestor.update(DT);
        }

        assert.equal(gestor.golesLocal, 1);
        const s = gestor.stats.serializar();
        assert.equal(s.goles.length, 1);
        assert.equal(s.goles[0].nombre, 'Fabri');
        assert.equal(s.goles[0].asistidorNombre, 'Mariano');
        assert.ok(s.goles[0].minuto >= 58 && s.goles[0].minuto <= 65);
        assert.equal(s.equipos.local.asistencias, 1);
    });
});

describe('Etapa 4 — Valoración y Figura del Partido sin depender solo de goles', () => {
    test('un arquero figura en un 0-0 con múltiples atajadas gana la Figura del Partido', () => {
        const base = [
            { id: 'local_0', nombre: 'Fabri', team: 'local', isGK: false, tiros: 4, tirosAlArco: 4, pases: 3, pasesCompletados: 2 },
            { id: 'local_gk', nombre: 'Gato', team: 'local', isGK: true, atajadas: 0 },
            { id: 'rival_0', nombre: 'Boguero', team: 'rival', isGK: false, tiros: 1, tirosAlArco: 0, perdidas: 2 },
            { id: 'rival_gk', nombre: 'Ruso', team: 'rival', isGK: true, atajadas: 5, pases: 3, pasesCompletados: 3 },
        ];
        const res = calcularValoraciones(base, {
            golesLocal: 0,
            golesRival: 0,
            tirosLocal: 4,
            tirosRival: 1,
            duracionJugadaSeg: 90,
        });
        assert.ok(res.figura);
        assert.equal(res.figura.id, 'rival_gk');
        assert.equal(res.figura.nombre, 'Ruso');
        assert.ok(res.figura.rating >= 8.5);
        assert.match(res.figura.resumen, /5 atajadas/);
        assert.match(res.figura.resumen, /Valla invicta/);
    });

    test('un defensor con quites, recuperaciones y asistencia supera a un jugador sin impacto', () => {
        const base = [
            { id: 'local_0', nombre: 'Fabri', team: 'local', isGK: false, goles: 1, tiros: 2, tirosAlArco: 1, perdidas: 3 },
            {
                id: 'local_2',
                nombre: 'Reta',
                team: 'local',
                isGK: false,
                goles: 0,
                asistencias: 1,
                recuperaciones: 5,
                barridas: 3,
                barridasExitosas: 3,
                pases: 6,
                pasesCompletados: 6,
                tiempoConPelota: 12,
            },
        ];
        const res = calcularValoraciones(base, {
            golesLocal: 1,
            golesRival: 0,
            tirosLocal: 2,
            tirosRival: 2,
            duracionJugadaSeg: 90,
        });
        assert.equal(res.figura.id, 'local_2');
        assert.ok(res.figura.rating > res.jugadores.find((j) => j.id === 'local_0').rating);
    });
});

describe('Etapa 2 — Liga impacto en la tabla + Persistencia y Perfil', () => {
    test('LigaCore.resumenImpacto calcula posición antes/después, puntos, DG y próximo rival', () => {
        const ids = ['retoneta', 'el_boguero', 'macabro', 'cattarino'];
        const liga = LigaCore.crear({ ids, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });
        const tablaAntes = LigaCore.tabla(liga);
        const m = LigaCore.partidoUsuario(liga, 0);
        const soyLocal = m.l === 'retoneta';
        m.gl = soyLocal ? 3 : 0;
        m.gv = soyLocal ? 0 : 3;
        LigaCore.cerrarFecha(liga);

        const imp = LigaCore.resumenImpacto(liga, tablaAntes, 0);
        assert.equal(imp.ptsAntes, 0);
        assert.equal(imp.ptsDespues, 3);
        assert.equal(imp.deltaPts, 3);
        assert.equal(imp.dgDespues, 3);
        assert.ok(imp.posDespues >= 1 && imp.posDespues <= 4);
        assert.ok(imp.proximo && !imp.proximo.terminada && imp.proximo.rivalId);
    });

    test('sanitizarStatsPartido, calcularPerfil e HistorialLocalStore mantienen consistencia', () => {
        HistorialLocalStore.limpiar();
        const limpio = sanitizarStatsPartido({
            posesionPct: 62,
            tiros: 5,
            tirosAlArco: 9, // inconsistente -> se recorta a 5
            pases: 10,
            pasesCompletados: 8,
            recuperaciones: 4,
            atajadas: 2,
            figura: { nombre: 'Fabri', team: 'local', rating: 8.7 },
        });
        assert.equal(limpio.tirosAlArco, 5);
        assert.equal(limpio.figura.nombre, 'Fabri');

        HistorialLocalStore.registrar({ resultado: 'win', gf: 2, gc: 0, modo: 'solo', stats: limpio });
        HistorialLocalStore.registrar({ resultado: 'win', gf: 3, gc: 1, modo: 'liga', stats: limpio });
        const p = HistorialLocalStore.perfil();
        assert.equal(p.rachaActual, 2);
        assert.equal(p.estadisticas.partidosConStats, 2);
        assert.equal(p.estadisticas.posesionPromedio, 62);
        assert.equal(p.estadisticas.precisionPases, 80);
        assert.equal(p.estadisticas.recuperaciones, 8);
        HistorialLocalStore.limpiar();
    });

    test('Partido online expone resumenFinal autoritativo sin inflar el snapshot de red', () => {
        const p = new Partido('sala_stats', 'S1', 'S2', 'retoneta', 'macabro', { local: 'Ana', visitante: 'Beto' });
        for (let i = 0; i < 60 * 8; i++) p.avanzar();
        const snap = p.snapshot();
        assert.equal('stats' in snap, false, 'el snapshot de 30 Hz no incluye el objeto pesado de stats');
        const res = p.resumenFinal();
        assert.ok(res && res.equipos && res.jugadores.length === 8 && res.figura);
    });
});

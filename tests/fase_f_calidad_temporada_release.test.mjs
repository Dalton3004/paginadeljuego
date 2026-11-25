/**
 * Batería de tests automatizados — FASE F (Etapas 34 a 39):
 *   - Etapa 34: Rendimiento, cero asignaciones GC en hot-paths (FX, Hinchada, Replay) y reduceMotion real
 *   - Etapa 35: QA y regresión transversal de sistemas
 *   - Etapa 37: Auditoría matemática de Balance Final (curva IA, estrellas ±6%, atributos, fatiga y cosméticos 0% ventaja)
 *   - Etapa 38: Experiencia de Temporada Completa E2E (Pretemporada → Liga 13 fechas → Prensa → Copa → Penales → Premios → Supercopa → Palmarés → Nueva Temporada)
 *   - Etapa 39: Revisión técnica de Release (cero textos "próximamente"/TODO en UI, 52 jugadores canónicos, sincronía PWA)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EQUIPOS } from '../assets/equipos.js';
import '../assets/hinchada/fans_atlas.js';
import { Crowd } from '../assets/hinchada/fans.js';
import { Mundo as MundoFX } from '../fx/mundo.js';
import { EstadoPartido, Jugador, Pelota, GestorPartido } from '../sim/index.js';
import { PLANTELES } from '../sim/planteles.js';
import { Replay } from '../sim/replay.js';
import { SeriePenales, resolverEjecucionPenal } from '../sim/penales_core.js';
import { LigaCore } from '../liga.js';
import { CopaCore } from '../copa.js';
import { SupercopaCore } from '../supercopa.js';
import { CarreraStore } from '../career/store.js';
import { registrarStatsPartidoEnLiga } from '../career/premios.js';
import { auditarBalanceJuego, construirHojaRutaTemporada } from '../career/balance_temporada.js';
import { construirHistorialYPalmares, calcularRecordsReales } from '../career/records_palmares.js';
import { VERSION_JUEGO } from '../config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

describe('FASE F — Etapa 34: Auditoría de Rendimiento, Memoria y Móvil (reduceMotion)', () => {
    test('FX.Mundo compacta partículas y trail in-place sin reasignar arrays y respeta reduceMotion', () => {
        const mockGame = {
            prefs: { reduceMotion: false },
            ball: new Pelota(240, 320),
            players: [new Jugador(240, 460, { team: 'local', isHuman: true, mobilityId: 'local_0' })],
            gestor: { estado: EstadoPartido.EN_JUEGO, golesLocal: 0, golesRival: 0 },
        };
        mockGame.ball.vel.set(9, -8);

        const fx = new MundoFX(mockGame);
        const refParts = fx.parts;
        const refTrail = fx.trail;

        fx.dust(240, 320, 6, 1, 2);
        fx.shake(6);
        assert.ok(fx.shakeAmp > 0);

        for (let i = 0; i < 40; i++) {
            fx.update(1 / 60);
        }
        // In-place compaction: las referencias a los buffers internos jamás se reemplazan por arrays nuevos
        assert.equal(fx.parts, refParts, 'fx.parts debe compactarse in-place sin crear arrays por frame');
        assert.equal(fx.trail, refTrail, 'fx.trail debe compactarse in-place sin crear arrays por frame');

        // Al activar reduceMotion se anula el camera shake y baja calma a 0.35
        mockGame.prefs.reduceMotion = true;
        fx.shakeAmp = 0;
        fx.shake(8);
        assert.equal(fx.shakeAmp, 0, 'reduceMotion debe bloquear nuevas sacudidas de cámara');
        assert.equal(fx.calma, 0.35);
    });

    test('Crowd._state reutiliza _stOut sin generar objetos efímeros por hincha/frame', () => {
        const crowd = new Crowd({
            image: { width: 128, height: 128 },
            atlas: globalThis.FANS_ATLAS,
            stands: [{ x: 10, y: 10, w: 80, h: 40, scale: 0.4 }],
            seed: 7,
        });
        crowd.goal('north', { fraction: 1, duration: 3 });
        crowd.update(0.1);
        const fan = crowd.stands[0].fans.find((f) => f.kind !== 'empty');
        assert.ok(fan);

        const st1 = crowd._state(fan);
        const st2 = crowd._state(fan);
        assert.equal(st1, st2, 'Crowd._state debe reutilizar el mismo objeto _stOut');
    });

    test('900 frames de simulación + MatchStats + Replay se ejecutan muy por debajo del presupuesto de 60 FPS y acotan memoria', () => {
        const ball = new Pelota(240, 320);
        const players = [
            new Jugador(240, 460, { team: 'local', mobilityId: 'local_0' }),
            new Jugador(180, 500, { team: 'local', mobilityId: 'local_1' }),
            new Jugador(300, 500, { team: 'local', mobilityId: 'local_2' }),
            new Jugador(240, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }),
            new Jugador(240, 180, { team: 'rival', mobilityId: 'rival_0' }),
            new Jugador(180, 140, { team: 'rival', mobilityId: 'rival_1' }),
            new Jugador(300, 140, { team: 'rival', mobilityId: 'rival_2' }),
            new Jugador(240, 95, { team: 'rival', isGK: true, mobilityId: 'rival_gk' }),
        ];
        const gestor = new GestorPartido(ball, players, {
            equipoLocalId: 'retoneta',
            equipoRivalId: 'el_boguero',
        });
        gestor.estado = EstadoPartido.EN_JUEGO;
        const replay = new Replay({ duracionSeg: 5, hz: 30 });

        const t0 = performance.now();
        for (let f = 0; f < 900; f++) {
            gestor.update(1 / 60);
            if (f % 2 === 0) {
                replay.grabar({
                    t: f / 60,
                    pelota: { x: ball.pos.x, y: ball.pos.y, z: ball.z || 0 },
                    jugadores: players.map((p) => ({ x: p.pos.x, y: p.pos.y, team: p.team })),
                });
            }
        }
        const elapsedMs = performance.now() - t0;
        const avgFrameMs = elapsedMs / 900;

        assert.ok(
            avgFrameMs < 2.0,
            `El costo medio por frame (${avgFrameMs.toFixed(3)} ms) debe ser muy inferior a 16.67 ms`
        );
        assert.ok(
            replay.buffer.length <= replay.maxFrames,
            `El buffer circular de replay (${replay.buffer.length}) nunca debe superar maxFrames (${replay.maxFrames})`
        );
    });
});

describe('FASE F — Etapa 37: Auditoría de Balance Final', () => {
    test('auditarBalanceJuego verifica curva IA monótona, estrellas ±6%, atributos acotados y cosméticos sin ventaja', () => {
        const audit = auditarBalanceJuego({ equiposCatalogo: EQUIPOS });
        assert.equal(audit.curvaDificultadMonotona, true);
        assert.equal(audit.rangoEstrellasJusto, true);
        assert.equal(audit.atributosDentroDeCota, true);
        assert.equal(audit.duracionArcadeEquilibrada, true);
        assert.equal(audit.fatigaModerada, true);
        assert.equal(audit.cosmeticosSinVentaja, true);
        assert.equal(audit.desafiosSinGrind, true);
        assert.equal(audit.ok, true);
    });
});

describe('FASE F — Etapas 35 y 38: Temporada Completa Integrada E2E', () => {
    test('Flujo completo: Pretemporada → 13 fechas Liga → Prensa → Copa + Penales → Premios → Supercopa → Palmarés → Nueva Temporada', () => {
        CarreraStore.reiniciar();
        const ids = EQUIPOS.map((e) => e.id);
        const miClub = 'retoneta';

        // 1) PRETEMPORADA Y OBJETIVOS
        const ligaT1 = LigaCore.crear({ ids, miEquipo: miClub, dificultad: 'normal', formato: 'ida' });
        const objT1 = LigaCore.asegurarObjetivos(ligaT1);
        assert.ok(objT1.principal && objT1.principal.titulo);

        const rutaDebut = construirHojaRutaTemporada({
            liga: ligaT1,
            tabla: LigaCore.tabla(ligaT1),
            carrera: CarreraStore.leer(),
        });
        assert.equal(rutaDebut.etapaTitulo, 'PRETEMPORADA Y DEBUT');

        // 2) COPA CHAQUITO EN PARALELO (con tanda de penales en caso de empate en la Final)
        const copa = CopaCore.crear({ ids, miEquipo: miClub, formato: 'unico' });
        while (!CopaCore.terminada(copa) && !copa.eliminadoEn) {
            const info = CopaCore.partidoUsuarioActual(copa);
            if (!info || info.bye) {
                CopaCore.avanzarPasoCopa(copa);
                continue;
            }
            const rAct = info.ronda;
            if (rAct.codigo === 'final') {
                assert.equal(CopaCore.requierePenalesTrasResultado(copa, 2, 2), true);
                const serie = new SeriePenales({ empiezaUsuario: true });
                let seguridad = 0;
                while (!serie.terminada && seguridad++ < 20) {
                    if (serie.turno === 'mio') {
                        const tiro = resolverEjecucionPenal(
                            { direccion: 'izq', potencia: 0.8, efecto: 'comba', decisionArquero: 'der' },
                            () => 0.5
                        );
                        serie.registrarTiro(tiro.esGol);
                    } else {
                        const tiroRiv = resolverEjecucionPenal(
                            { direccion: 'centro', potencia: 0.7, efecto: 'raso', decisionArquero: 'centro' },
                            () => 0.2
                        );
                        serie.registrarTiro(tiroRiv.esGol);
                    }
                }
                assert.equal(serie.terminada, true);
                assert.equal(serie.ganador, 'mio');
                CopaCore.registrarPartidoUsuario(copa, 2, 2, {
                    golesMios: serie.golesMios,
                    golesOtro: serie.golesOtro,
                });
            } else {
                CopaCore.registrarPartidoUsuario(copa, 3, 0, null);
            }
        }
        assert.equal(CopaCore.terminada(copa), true);
        assert.equal(copa.campeon, miClub);
        CarreraStore.registrarTituloCompeticion({
            tipo: 'copa',
            campeonId: miClub,
            subcampeonId: copa.subcampeon || 'el_boguero',
            esUsuario: true,
            marcador: '2-2 (pen.)',
        });

        // 3) RECORRIDO COMPLETO DE LAS 13 FECHAS DE LIGA (estadísticas, noticias, rachas, rivalidades y conferencia)
        let conferenciasRespondidas = 0;
        while (!LigaCore.terminada(ligaT1)) {
            const fIdx = ligaT1.fechaActual;
            const m = LigaCore.partidoUsuario(ligaT1, fIdx);
            if (!m || m.libre) {
                LigaCore.cerrarFecha(ligaT1, null);
                LigaCore.actualizarObjetivosTrasFecha(ligaT1, { fueLibre: true });
                CarreraStore.descansarClub(miClub, 'fecha_libre');
                continue;
            }
            const soyLocal = m.l === miClub;
            const rivalId = soyLocal ? m.v : m.l;
            const gl = soyLocal ? 3 : 1;
            const gv = soyLocal ? 1 : 3;
            const ladoMio = soyLocal ? 'local' : 'rival';

            const fakeStats = {
                equipos: {
                    local: { posesionPct: 55, tiros: 7, tirosAlArco: 5, pases: 14, pasesCompletados: 11, atajadas: 2 },
                    rival: { posesionPct: 45, tiros: 4, tirosAlArco: 3, pases: 10, pasesCompletados: 7, atajadas: 2 },
                },
                goles: [
                    { team: ladoMio, nombre: PLANTELES[miClub].campo[0], minuto: 24, segundo: 10 },
                    { team: ladoMio, nombre: PLANTELES[miClub].campo[1], minuto: 61, segundo: 5 },
                    { team: ladoMio, nombre: PLANTELES[miClub].campo[0], minuto: 86, segundo: 40 },
                ],
                jugadores: [
                    {
                        id: `${ladoMio}_0`,
                        nombre: PLANTELES[miClub].campo[0],
                        team: ladoMio,
                        goles: 2,
                        asistencias: 1,
                        rating: 9.1,
                    },
                    {
                        id: `${ladoMio}_1`,
                        nombre: PLANTELES[miClub].campo[1],
                        team: ladoMio,
                        goles: 1,
                        asistencias: 1,
                        rating: 8.2,
                    },
                    {
                        id: `${ladoMio}_gk`,
                        nombre: PLANTELES[miClub].gk,
                        team: ladoMio,
                        isGK: true,
                        atajadas: 3,
                        rating: 7.8,
                    },
                ],
                figura: {
                    nombre: PLANTELES[miClub].campo[0],
                    team: ladoMio,
                    rating: 9.1,
                    motivo: 'Doblete y asistencia',
                },
            };

            m.gl = gl;
            m.gv = gv;
            registrarStatsPartidoEnLiga(ligaT1, {
                equipoLocal: m.l,
                equipoRival: m.v,
                gl,
                gv,
                statsSerializados: fakeStats,
            });
            LigaCore.cerrarFecha(ligaT1);
            LigaCore.actualizarObjetivosTrasFecha(ligaT1, { gf: 3, gc: 1 });

            const paq = CarreraStore.procesarPartido({
                modo: 'liga',
                miEquipoId: miClub,
                rivalId,
                nombreMio: 'La Retoneta',
                nombreRival: rivalId,
                ladoMio,
                golesMios: 3,
                golesOtro: 1,
                golesDetalle: fakeStats.goles,
                figura: fakeStats.figura,
                forzarConferencia: fIdx === 5,
            });
            assert.ok(paq.noticia && paq.noticia.titular);
            if (paq.conferencia && paq.conferencia.opciones.length) {
                const resp = CarreraStore.responderConferencia(paq.conferencia, paq.conferencia.opciones[0].id, {
                    miEquipoId: miClub,
                    rivalId,
                    nombreMio: 'La Retoneta',
                    nombreRival: rivalId,
                });
                assert.ok(resp && resp.noticia);
                conferenciasRespondidas++;
            }
        }

        assert.equal(LigaCore.terminada(ligaT1), true);
        assert.ok(conferenciasRespondidas >= 1, 'Debe haberse disparado y respondido al menos una conferencia');

        // 4) CIERRE DE TEMPORADA, 8 PREMIOS Y SUPERCOPA DE DOBLETE
        const tablaFinal = LigaCore.tabla(ligaT1);
        assert.equal(tablaFinal[0].id, miClub, 'Ganando las 12 fechas jugadas debe salir campeón (1°)');
        const subcampeonLiga = tablaFinal[1].id;

        const premios = LigaCore.premiosDeLiga(ligaT1);
        assert.ok(premios.campeon && premios.mejorJugador && premios.botinDeOro && premios.mejorArquero);

        CarreraStore.registrarTituloCompeticion({
            tipo: 'liga',
            campeonId: miClub,
            subcampeonId: subcampeonLiga,
            esUsuario: true,
            marcador: `${tablaFinal[0].pts} PTS`,
        });
        CarreraStore.registrarPremiosTemporada(premios);
        CarreraStore.registrarTemporadaLiga({
            ligaId: ligaT1.id,
            miEquipo: miClub,
            posicionFinal: 1,
            puntos: tablaFinal[0].pts,
            gf: tablaFinal[0].gf,
            gc: tablaFinal[0].gc,
            campeonId: miClub,
            cumplidos: ligaT1.objetivos.resumenFinal ? ligaT1.objetivos.resumenFinal.cumplidos : 1,
            total: 3,
        });

        // Como ganó Liga + Copa (doblete), Supercopa enfrenta a La Retoneta vs Subcampeón de Liga
        const palActual = CarreraStore.leer().palmares;
        const cruceSup = SupercopaCore.armarCruce({
            campeonLiga: palActual.campeonLigaVigente,
            campeonCopa: palActual.campeonCopaVigente,
            idsEquipos: ids,
        });
        assert.equal(cruceSup.habilitada, true);
        assert.equal(cruceSup.hayDoblete, true);
        assert.equal(cruceSup.equipoA, miClub);
        assert.equal(cruceSup.equipoB, subcampeonLiga);

        CarreraStore.registrarTituloCompeticion({
            tipo: 'supercopa',
            campeonId: miClub,
            subcampeonId: subcampeonLiga,
            esUsuario: true,
            marcador: '2-1',
        });

        // 5) INICIAR NUEVA TEMPORADA (T2) Y VERIFICAR QUE T1 + PALMARÉS + RÉCORDS PERMANECEN INTACTOS
        const ligaT2 = LigaCore.crear({ ids, miEquipo: miClub, dificultad: 'dificil', formato: 'ida' });
        assert.equal(ligaT2.fechaActual, 0);

        const palmares = construirHistorialYPalmares({
            carrera: CarreraStore.leer(),
            copaHistorial: [{ campeon: miClub, subcampeon: 'macabro', marcadorFinal: '2-2 (4-2p)' }],
            supercopaHistorial: [{ campeon: miClub, subcampeon: subcampeonLiga, gl: 2, gv: 1 }],
            equiposCatalogo: EQUIPOS,
        });
        assert.equal(palmares.totalTitulosOficiales, 3);
        assert.equal(palmares.temporadas.length, 1);
        assert.equal(palmares.temporadas[0].posicionFinal, 1);

        const records = calcularRecordsReales({
            carrera: CarreraStore.leer(),
            equiposCatalogo: EQUIPOS,
        });
        const recMap = Object.fromEntries(records.map((r) => [r.id, r]));
        assert.equal(recMap.mas_victorias_consecutivas.registrado, true);
        assert.equal(recMap.mayor_cantidad_titulos.registrado, true);
        assert.equal(recMap.maximo_goleador.registrado, true);
    });
});

describe('FASE F — Etapa 39: Revisión Técnica Final de Release', () => {
    test('Cero textos temporales ("próximamente", "TODO:", "FIXME:"), 52 jugadores canónicos y caché PWA sincronizada', () => {
        assert.equal(EQUIPOS.length, 13);
        let totalJugadores = 0;
        for (const eq of EQUIPOS) {
            const pl = PLANTELES[eq.id];
            assert.ok(pl, `Falta plantel canónico para ${eq.id}`);
            assert.equal(pl.campo.length, 3);
            assert.ok(pl.gk && pl.gk.length >= 2);
            totalJugadores += 4;
        }
        assert.equal(totalJugadores, 52);

        const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
        assert.ok(sw.includes(`chaquito-${VERSION_JUEGO}`), 'sw.js debe coincidir con VERSION_JUEGO');

        const archivosUI = [
            'index.html',
            'settings.js',
            'social.js',
            'liga.js',
            'copa.js',
            'supercopa.js',
            'ranking.js',
            ...readdirSync(join(ROOT, 'game'))
                .filter((f) => f.endsWith('.js'))
                .map((f) => `game/${f}`),
        ];

        for (const rel of archivosUI) {
            const txt = readFileSync(join(ROOT, rel), 'utf8');
            assert.equal(
                /próximamente/i.test(txt),
                false,
                `No deben quedar textos temporales "(próximamente)" en ${rel}`
            );
            assert.equal(
                /\b(?:TODO|FIXME):/.test(txt),
                false,
                `No deben quedar marcadores TODO:/FIXME: sin resolver en ${rel}`
            );
        }
    });
});

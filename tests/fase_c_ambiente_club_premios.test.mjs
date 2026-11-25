import test from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG } from '../sim/config.js';
import { Pelota } from '../sim/pelota.js';
import { EQUIPOS } from '../assets/equipos.js';
import {
    KITS_ALTERNATIVOS,
    obtenerKitAlternativo,
    resolverCamisetasPartido,
} from '../assets/kits_alternativos.js';
import {
    CLIMAS_CATALOGO,
    elegirClimaPartido,
    clasificarEventoEspecial,
    ESTADOS_HINCHADA,
    ControladorHinchada,
} from '../career/ambiente_core.js';
import { registrarStatsPartidoEnLiga, calcularPremiosTemporada } from '../career/premios.js';
import { construirFichaMiClub } from '../career/mi_club.js';
import { CarreraStore } from '../career/store.js';
import { LigaCore } from '../liga.js';

const IDS_13 = EQUIPOS.map((e) => e.id);

// ============================================================
// ETAPA 14 — Hinchada Dinámica y Tiro al Palo
// ============================================================
test('Etapa 14: Pelota._bounceWalls detecta tiro al palo sin alterar la física', () => {
    const b = new Pelota(CONFIG.GOAL_NORTH.x, CONFIG.FIELD.TOP + 2);
    b.vel.set(0, -8.5);
    b.update(1 / 60);
    assert.ok(b._hitWoodwork, 'debe marcar impacto cercano al poste/travesaño');
    assert.equal(b._hitWoodwork.arco, 'north');
    assert.equal(b._hitWoodwork.tipo, 'palo');
});

test('Etapa 14: ControladorHinchada recorre todos los estados reales de partido', () => {
    assert.equal(ESTADOS_HINCHADA.length, 12);

    // Inicio en partido normal -> expectativa
    const ctrl = new ControladorHinchada({ esClasico: false, esFinal: false, intensidadBase: 0.14 });
    assert.equal(ctrl.estado, 'expectativa');

    // Inicio en clásico y final
    const ctrlClasico = new ControladorHinchada({ esClasico: true, esFinal: false, intensidadBase: 0.45 });
    assert.equal(ctrlClasico.estado, 'clasico');
    const ctrlFinal = new ControladorHinchada({ esClasico: false, esFinal: true, intensidadBase: 0.55 });
    assert.equal(ctrlFinal.estado, 'final');

    // Ataque local peligroso
    const ball = { pos: { x: 240, y: 180 }, vel: { x: 0, y: -5 }, owner: { team: 'local' }, _hitWoodwork: null };
    let res = ctrl.actualizar(0.1, {
        estadoPartido: 'EN_JUEGO',
        framesRestantes: 3600,
        fps: 60,
        golesLocal: 0,
        golesRival: 0,
        ball,
        statsEventos: [],
    });
    assert.equal(res.estado, 'ataque');
    assert.ok(res.intensidad >= 0.5);

    // Tiro al palo -> reacción de tribuna + exclamación
    ball._hitWoodwork = { arco: 'north', tipo: 'palo', x: 196, y: 52 };
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'EN_JUEGO',
        framesRestantes: 3500,
        fps: 60,
        golesLocal: 0,
        golesRival: 0,
        ball,
        statsEventos: [],
    });
    assert.equal(res.estado, 'tiro_palo');
    assert.equal(ball._hitWoodwork, null, 'consume la marca del palo');
    assert.ok(res.acciones.some((a) => a.sfx === 'gasp'));

    // Atajada real desde MatchStats
    const eventos = [{ tipo: 'atajada', team: 'local', nombre: 'Gato Morales' }];
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'EN_JUEGO',
        framesRestantes: 3400,
        fps: 60,
        golesLocal: 0,
        golesRival: 0,
        ball,
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'atajada');
    assert.ok(res.banner && res.banner.texto.includes('GATO MORALES'));

    // Gol visitante -> gol_rival y caída de volumen/intensidad
    eventos.push({ tipo: 'gol', team: 'rival', nombre: 'Nueve Rival' });
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'CELEBRANDO_GOL',
        framesRestantes: 3000,
        fps: 60,
        golesLocal: 0,
        golesRival: 1,
        ball,
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'gol_rival');
    assert.ok(res.volumenMultiplicador < 1);

    // Empate y luego dar vuelta el marcador -> remontada épica
    eventos.push({ tipo: 'gol', team: 'local', nombre: 'Diez Local' });
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'CELEBRANDO_GOL',
        framesRestantes: 2400,
        fps: 60,
        golesLocal: 1,
        golesRival: 1,
        ball,
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'gol');

    eventos.push({ tipo: 'gol', team: 'local', nombre: 'Capitán Local' });
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'CELEBRANDO_GOL',
        framesRestantes: 1800,
        fps: 60,
        golesLocal: 2,
        golesRival: 1,
        ball,
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'remontada');
    assert.ok(res.intensidad >= 0.9);

    // Últimos 15 segundos de partido cerrado -> ultimo_minuto
    res = ctrl.actualizar(3.5, {
        estadoPartido: 'EN_JUEGO',
        framesRestantes: 12 * 60,
        fps: 60,
        golesLocal: 2,
        golesRival: 1,
        ball: { pos: { x: 240, y: 320 }, vel: { x: 0, y: 0 }, owner: null },
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'ultimo_minuto');

    // Cierre con victoria y con derrota
    res = ctrl.actualizar(0.1, {
        estadoPartido: 'FINALIZADO',
        framesRestantes: 0,
        fps: 60,
        golesLocal: 2,
        golesRival: 1,
        ball: null,
        statsEventos: eventos,
    });
    assert.equal(res.estado, 'victoria');

    const ctrlDerrota = new ControladorHinchada();
    const resDer = ctrlDerrota.actualizar(0.1, {
        estadoPartido: 'FINALIZADO',
        framesRestantes: 0,
        fps: 60,
        golesLocal: 0,
        golesRival: 2,
        ball: null,
        statsEventos: [],
    });
    assert.equal(resDer.estado, 'derrota');
});

// ============================================================
// ETAPA 15 — Clima de Estadio y Camisetas Alternativas
// ============================================================
test('Etapa 15: elegirClimaPartido soporta las 5 variantes y respeta reduceMotion', () => {
    for (const key of ['dia', 'noche', 'lluvia', 'lluvia_intensa', 'niebla']) {
        assert.ok(CLIMAS_CATALOGO[key], `falta clima ${key}`);
    }
    assert.equal(elegirClimaPartido({ preferencia: 'lluvia_intensa' }).id, 'lluvia_intensa');
    assert.equal(
        elegirClimaPartido({ preferencia: 'niebla', reduceMotion: true }).id,
        'dia',
        'con reduceMotion desactiva niebla móvil hacia día limpio'
    );
    const climaFinal = elegirClimaPartido({ preferencia: 'auto', esFinal: true, azar: () => 0.3 });
    assert.equal(climaFinal.id, 'noche');
});

test('Etapa 15: KITS_ALTERNATIVOS cubre los 13 clubes y resuelve choque de camisetas', () => {
    for (const id of IDS_13) {
        assert.ok(KITS_ALTERNATIVOS[id], `falta camiseta alternativa para ${id}`);
        const alt = obtenerKitAlternativo(id);
        assert.equal(alt.colores.length, 2);
        assert.ok(alt.tint.startsWith('rgba('));
    }

    // Trotenham (#f0f3f7 / #131d47) vs Botajogo (#141414 / #f2f2f2) comparten blanco y oscuro -> choque automático
    const trote = EQUIPOS.find((e) => e.id === 'trotenham');
    const bota = EQUIPOS.find((e) => e.id === 'botajogo');
    const resChoque = resolverCamisetasPartido(trote, bota, { localUsaAlt: false });
    assert.equal(resChoque.localAlt, false);
    assert.equal(resChoque.rivalAlt, true, 'el visitante cambia automáticamente a camiseta suplente');
    assert.ok(resChoque.rivalInfo && resChoque.rivalInfo.tint);

    // Elección manual de camiseta alternativa por el jugador
    const retoneta = EQUIPOS.find((e) => e.id === 'retoneta');
    const boguero = EQUIPOS.find((e) => e.id === 'el_boguero');
    const resManual = resolverCamisetasPartido(retoneta, boguero, { localUsaAlt: true });
    assert.equal(resManual.localAlt, true);
    assert.equal(resManual.localInfo.nombre, 'Blanca Dorada');
});

// ============================================================
// ETAPA 16 — Estadio y Finales Especiales
// ============================================================
test('Etapa 16: clasificarEventoEspecial distingue partidos normales de grandes citas', () => {
    // Partido común -> nunca se disfraza de final
    const normal = clasificarEventoEspecial({
        enLinea: false,
        rivalidadInfo: { esClasico: false, nivel: 20 },
    });
    assert.equal(normal.tipo, 'normal');
    assert.equal(normal.esEspecial, false);
    assert.equal(normal.mostrarTrofeo, false);

    // Supercopa -> gala con trofeo
    const sup = clasificarEventoEspecial({ modoSupercopa: { claveEdicion: 'x' } });
    assert.equal(sup.tipo, 'supercopa');
    assert.equal(sup.esEspecial, true);
    assert.equal(sup.esFinal, true);
    assert.equal(sup.mostrarTrofeo, true);

    // Final de Copa vs Octavos de Copa
    const octavos = clasificarEventoEspecial({ modoCopa: { rondaNombre: 'OCTAVOS', esFinal: false } });
    assert.equal(octavos.esEspecial, false);
    const finalCopa = clasificarEventoEspecial({ modoCopa: { rondaNombre: 'GRAN FINAL', esFinal: true } });
    assert.equal(finalCopa.tipo, 'final_copa');
    assert.equal(finalCopa.esFinal, true);
    assert.equal(finalCopa.mostrarTrofeo, true);

    // Clásico de alta rivalidad (>= 75)
    const clasico = clasificarEventoEspecial({
        rivalidadInfo: { esClasico: true, nivel: 82, etiqueta: 'CLÁSICO HISTÓRICO', textoNivel: 'RIVALIDAD FEROZ (82/100)' },
    });
    assert.equal(clasico.tipo, 'clasico_alta_rivalidad');
    assert.equal(clasico.esEspecial, true);
    assert.equal(clasico.esFinal, false);

    // Partido decisivo de Liga en la última fecha peleando la punta
    const liga = LigaCore.crear({ ids: IDS_13, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });
    while (liga.fechaActual < liga.fixture.length - 1) {
        const m = LigaCore.partidoUsuario(liga, liga.fechaActual);
        if (m && !m.libre) {
            const soyL = m.l === 'retoneta';
            m.gl = soyL ? 3 : 0;
            m.gv = soyL ? 0 : 3;
        }
        LigaCore.cerrarFecha(liga);
    }
    const decisivo = clasificarEventoEspecial({
        modoLiga: { fecha: liga.fechaActual },
        ligaActual: liga,
        LigaCoreRef: LigaCore,
        rivalId: 'el_boguero',
    });
    assert.equal(decisivo.tipo, 'partido_decisivo_liga');
    assert.equal(decisivo.esEspecial, true);
    assert.equal(decisivo.esFinal, true);
});

// ============================================================
// ETAPA 17 Y 18 — Sección MI CLUB y Premios de Temporada
// ============================================================
test('Etapas 17 y 18: Premios de Temporada verificables y ficha integral de MI CLUB', () => {
    CarreraStore.reiniciar();
    CarreraStore.fijarClubActual('retoneta');

    const liga = LigaCore.crear({ ids: IDS_13, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });

    // Jugamos/registramos toda la temporada haciendo brillar a nuestro delantero y arquero
    while (!LigaCore.terminada(liga)) {
        const m = LigaCore.partidoUsuario(liga, liga.fechaActual);
        if (m && !m.libre) {
            const rival = m.l === 'retoneta' ? m.v : m.l;
            const soyL = m.l === 'retoneta';
            m.gl = soyL ? 4 : 0;
            m.gv = soyL ? 0 : 4;
            registrarStatsPartidoEnLiga(liga, {
                equipoLocal: 'retoneta',
                equipoRival: rival,
                gl: 4,
                gv: 0,
                statsSerializados: {
                    jugadores: [
                        { id: 'local_0', team: 'local', isGK: false, goles: 3, asistencias: 0 },
                        { id: 'local_1', team: 'local', isGK: false, goles: 1, asistencias: 3 },
                        { id: 'local_2', team: 'local', isGK: false, goles: 0, asistencias: 1 },
                        { id: 'local_gk', team: 'local', isGK: true, goles: 0, asistencias: 0, atajadas: 5 },
                    ],
                },
            });
            CarreraStore.procesarPartido({
                modo: 'liga',
                miEquipoId: 'retoneta',
                rivalId: rival,
                nombreMio: 'Retoneta',
                nombreRival: 'Rival',
                ladoMio: 'local',
                golesMios: 4,
                golesOtro: 0,
                golesDetalle: [
                    { team: 'rival', minuto: 10 }, // simula también una remontada en otro partido aparte abajo
                ],
                azarConferencia: () => 1,
            });
        }
        LigaCore.cerrarFecha(liga);
    }

    // Registramos además una remontada real 3-2 tras empezar perdiendo 0-2
    CarreraStore.procesarPartido({
        modo: 'copa',
        miEquipoId: 'retoneta',
        rivalId: 'el_boguero',
        nombreMio: 'Retoneta',
        nombreRival: 'El Boguero',
        ladoMio: 'local',
        golesMios: 3,
        golesOtro: 2,
        esFinal: true,
        esEliminatoria: true,
        tituloGanado: true,
        golesDetalle: [
            { team: 'rival', minuto: 12 },
            { team: 'rival', minuto: 25 },
            { team: 'local', minuto: 48 },
            { team: 'local', minuto: 70 },
            { team: 'local', minuto: 88 },
        ],
        azarConferencia: () => 1,
    });
    CarreraStore.registrarTituloCompeticion({
        tipo: 'liga',
        campeonId: 'retoneta',
        subcampeonId: 'el_boguero',
        esUsuario: true,
        marcador: '36 PTS',
    });
    CarreraStore.registrarTituloCompeticion({
        tipo: 'copa',
        campeonId: 'retoneta',
        subcampeonId: 'el_boguero',
        esUsuario: true,
        marcador: '3-2',
    });

    const tabla = LigaCore.tabla(liga);
    const premios = calcularPremiosTemporada(liga, tabla);
    assert.ok(premios, 'debe calcular todos los premios de la temporada');
    assert.equal(premios.campeon.equipoId, 'retoneta');
    assert.equal(premios.botinDeOro.equipoId, 'retoneta');
    assert.ok(premios.botinDeOro.goles >= 30, 'acumula goles reales del artillero');
    assert.equal(premios.mejorAsistente.equipoId, 'retoneta');
    assert.ok(premios.mejorAsistente.asistencias >= 30, 'acumula asistencias reales del armador');
    assert.equal(premios.mejorArquero.equipoId, 'retoneta');
    assert.ok(premios.mejorArquero.vallasInvictas >= 10);
    assert.ok(premios.equipoRevelacion && premios.equipoRevelacion.equipoId);
    assert.ok(premios.partidoDelAno && premios.partidoDelAno.totalGoles >= 4);
    assert.equal(premios.mejorRacha.equipoId, 'retoneta');
    assert.equal(premios.mejorJugador.equipoId, 'retoneta');

    CarreraStore.registrarPremiosTemporada(premios);

    // Verificación de MI CLUB (Etapa 17)
    const ficha = construirFichaMiClub('retoneta', {
        equiposCatalogo: EQUIPOS,
        carrera: CarreraStore.leer(),
        ligaActual: liga,
    });
    assert.equal(ficha.equipo.id, 'retoneta');
    assert.equal(ficha.plantel.campo.length, 3);
    assert.ok(ficha.kitAlternativo.nombre);
    assert.equal(ficha.vitrina.ligas, 1);
    assert.equal(ficha.vitrina.copas, 1);
    assert.ok(ficha.estadisticas.pj >= 12);
    assert.ok(ficha.estadisticas.golesHistoricos >= 48);
    assert.ok(ficha.records.mayorGoleada && ficha.records.mayorGoleada.gf === 4);
    assert.ok(ficha.records.mayorRemontada && ficha.records.mayorRemontada.gf === 3);
    assert.ok(ficha.premiosDestacados.length >= 4);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { EQUIPOS } from '../assets/equipos.js';
import {
    DESAFIOS_CATALOGO,
    crearEstadoActivoDesafio,
    actualizarDesafioEnVivo,
    evaluarResultadoDesafio,
    DesafiosStore,
} from '../career/desafios.js';
import {
    PRESETS_ARCADE,
    normalizarReglasArcade,
    resumirReglasArcade,
    ControladorArcade,
    ArcadeStore,
} from '../career/arcade.js';
import {
    CELEBRACIONES_CATALOGO,
    evaluarCelebracionesDesbloqueadas,
    resolverCelebracionActiva,
    calcularPoseCelebracion,
} from '../career/celebraciones.js';
import {
    ATRIBUTOS_ORDEN,
    LIMITES_MODIFICADORES,
    atributosJugador,
    rasgosJugador,
    plantelConAtributos,
    modificadoresDesdeAtributos,
    factorClutch,
} from '../career/atributos.js';
import {
    crearEstadoFormaEquipo,
    registrarPartidoEnForma,
    aplicarRecuperacionPlantel,
    describirFormaEquipo,
} from '../career/forma.js';
import {
    construirCapitulosHistoria,
    evaluarCapituloHistoria,
    HistoriaStore,
} from '../career/historia.js';
import { ControladorComentarios } from '../career/comentarios.js';
import { construirDatosPrePartido } from '../career/prepartido.js';
import { CarreraStore } from '../career/store.js';

// ============================================================
// ETAPA 19 — Modo Desafíos
// ============================================================
test('Etapa 19: Desafíos define objetivos, condiciones, puntuación, medallas y aísla Liga', () => {
    DesafiosStore.reiniciar();
    CarreraStore.reiniciar();

    assert.ok(DESAFIOS_CATALOGO.length >= 5);
    for (const d of DESAFIOS_CATALOGO) {
        assert.ok(d.objetivo && d.tiempo > 0 && d.condicionVictoria && d.condicionDerrota);
    }

    // Muro: recibir un gol dispara derrota inmediata
    const actMuro = crearEstadoActivoDesafio('muro');
    const tick = actualizarDesafioEnVivo(actMuro, { golesLocal: 1, golesRival: 1 });
    assert.equal(tick.terminarAhora, true);
    assert.equal(actMuro.abortadoPorDerrota, true);

    // Supervivencia: convertir un gol propio extiende el reloj (+10s)
    const actSup = crearEstadoActivoDesafio('supervivencia');
    const tickSup = actualizarDesafioEnVivo(actSup, { golesLocal: 1, golesRival: 0 });
    assert.equal(tickSup.terminarAhora, false);
    assert.equal(tickSup.segundosExtra, 10);

    // Remontada superada con medalla de Oro
    const evalRem = evaluarResultadoDesafio('remontada', {
        golesLocal: 4,
        golesRival: 2,
        segundosSobrantes: 12,
        atajadas: 2,
        tirosAlArco: 5,
    });
    assert.equal(evalRem.exito, true);
    assert.equal(evalRem.resultado, 'SUPERADO');
    assert.equal(evalRem.medalla, 'ORO');
    assert.ok(evalRem.puntuacion >= 1450);

    DesafiosStore.registrarIntento(evalRem);
    assert.equal(DesafiosStore.totalCompletados(), 1);
    assert.equal(DesafiosStore.progresoDe('remontada').completado, true);

    // Verificar aislamiento respecto a CarreraStore
    assert.equal(CarreraStore.procesarPartido({ modo: 'desafio', miEquipoId: 'retoneta', golesMios: 4, golesOtro: 2 }), null);
});

// ============================================================
// ETAPA 20 — Modo Chaquito Arcade
// ============================================================
test('Etapa 20: Chaquito Arcade aplica reglas especiales, eventos temporales y aísla estadísticas oficiales', () => {
    assert.ok(PRESETS_ARCADE.length >= 3);
    const reglas = normalizarReglasArcade({
        duracionSeg: 45,
        velocidadJuego: 'relampago',
        pelotaRapida: true,
        golDoble: true,
        golesEspeciales: 'larga_distancia',
        eventosTemporales: true,
        modoFuria: true,
    });
    assert.match(resumirReglasArcade(reglas), /45s/);
    assert.match(resumirReglasArcade(reglas), /GOL X2/);

    const ctrl = new ControladorArcade(reglas);
    const mult = ctrl.multiplicadoresActivos();
    assert.ok(mult.dtFactor > 1.2);
    assert.ok(mult.pelotaPotencia > 1.15);
    assert.equal(mult.furiaActiva, true);

    // Bombazo desde campo propio (Y=420 para local) con golDoble -> 1*2 + 1 = 3 goles totales (2 extra)
    const evGol = ctrl.evaluarGol({ equipoAnotador: 'local', posPateadorY: 420, mitadCanchaY: 320 });
    assert.equal(evGol.valorTotal, 3);
    assert.equal(evGol.golesExtra, 2);

    // Avance de reloj dispara evento temporal
    const out = ctrl.actualizar(13, { enJuego: true });
    assert.ok(out.nuevoEvento);
    assert.ok(ctrl.eventoActivo);

    // Gol de oro termina el partido de inmediato
    const ctrlOro = new ControladorArcade({ golesEspeciales: 'gol_de_oro' });
    assert.equal(ctrlOro.evaluarGol({ equipoAnotador: 'local' }).finalizarInmediato, true);

    const rec = ArcadeStore.registrarPartidoArcade({ gano: true, golesMios: 5 });
    assert.ok(rec.partidos >= 1 && rec.victorias >= 1);
    assert.equal(CarreraStore.procesarPartido({ modo: 'arcade', miEquipoId: 'retoneta', golesMios: 5, golesOtro: 1 }), null);
});

// ============================================================
// ETAPA 21 — Celebraciones Desbloqueables
// ============================================================
test('Etapa 21: Celebraciones se desbloquean por reputación, desafíos, rachas, temporadas y títulos', () => {
    assert.equal(CELEBRACIONES_CATALOGO.length, 6);

    const inicial = evaluarCelebracionesDesbloqueadas({
        carrera: { reputacion: { general: 45 }, rachas: {}, palmares: {}, historialTemporadas: [] },
        desafiosCompletados: 0,
        historiaCompletada: false,
    });
    assert.equal(inicial.find((c) => c.id === 'normal').desbloqueada, true);
    assert.equal(inicial.find((c) => c.id === 'acrobatica').desbloqueada, false);
    assert.equal(inicial.find((c) => c.id === 'especial').desbloqueada, false);

    const avanzada = evaluarCelebracionesDesbloqueadas({
        carrera: {
            reputacion: { general: 68 },
            rachas: { mejorRachaVictorias: 4 },
            palmares: { ligas: 1, copas: 0, supercopas: 0 },
            historialTemporadas: [{ ligaId: 'l1' }],
        },
        desafiosCompletados: 2,
        historiaCompletada: true,
    });
    for (const c of avanzada) {
        assert.equal(c.desbloqueada, true, `debe desbloquearse ${c.id}`);
    }

    const act = resolverCelebracionActiva({
        preferida: 'acrobatica',
        desbloqueadasIds: ['normal', 'acrobatica'],
    });
    assert.equal(act.id, 'acrobatica');

    const pose = calcularPoseCelebracion({ tipo: 'acrobatica', elapsed: 0.35, esAutor: true, reduceMotion: false });
    assert.ok(pose.offsetY < 0, 'el autor debe despegarse visualmente en el salto acrobático');
    const poseReducida = calcularPoseCelebracion({ tipo: 'acrobatica', elapsed: 0.35, esAutor: true, reduceMotion: true });
    assert.equal(poseReducida.rotacion, 0, 'respeta reduceMotion');
});

// ============================================================
// ETAPA 22 — Características de Jugadores (Atributos y Rasgos)
// ============================================================
test('Etapa 22: Atributos y rasgos existen para los 13 clubes y mantienen modificadores acotados', () => {
    assert.equal(ATRIBUTOS_ORDEN.length, 7);
    for (const eq of EQUIPOS) {
        const plantel = plantelConAtributos(eq.id, { catalogo: EQUIPOS });
        assert.equal(plantel.length, 4);
        for (const j of plantel) {
            for (const k of ATRIBUTOS_ORDEN) {
                assert.ok(j.atributos[k] >= 40 && j.atributos[k] <= 95);
            }
            const mods = modificadoresDesdeAtributos(j.atributos, j.rasgos, { etiqueta: 'excelente' });
            assert.ok(mods.velocidad >= LIMITES_MODIFICADORES.velocidad[0] && mods.velocidad <= LIMITES_MODIFICADORES.velocidad[1]);
            assert.ok(mods.tiro >= LIMITES_MODIFICADORES.tiro[0] && mods.tiro <= LIMITES_MODIFICADORES.tiro[1]);
            assert.ok(mods.pase >= LIMITES_MODIFICADORES.pase[0] && mods.pase <= LIMITES_MODIFICADORES.pase[1]);
        }
    }
    const fabriRasgos = rasgosJugador('retoneta', 0, atributosJugador('retoneta', 0, { catalogo: EQUIPOS }));
    assert.ok(fabriRasgos.includes('CLUTCH'));
    assert.equal(factorClutch(true, 12), 1.05);
    assert.equal(factorClutch(true, 45), 1);
});

// ============================================================
// ETAPA 23 — Forma y Cansancio
// ============================================================
test('Etapa 23: Forma y cansancio transiciona entre normal, cansado y excelente con recuperación', () => {
    let st = crearEstadoFormaEquipo();
    assert.equal(describirFormaEquipo(st).etiqueta, 'normal');

    // Varios partidos intensos bajo lluvia acumulan fatiga -> cansado
    for (let i = 0; i < 4; i++) {
        st = registrarPartidoEnForma(st, {
            resultado: 'win',
            golesFavor: 2,
            golesContra: 0,
            clima: 'lluvia_intensa',
            intensidadExtra: true,
        });
    }
    assert.equal(st.etiqueta, 'cansado');

    // Fecha libre o descanso táctico recupera piernas -> excelente
    st = aplicarRecuperacionPlantel(st, { motivo: 'fecha_libre' });
    st = aplicarRecuperacionPlantel(st, { motivo: 'descanso' });
    assert.equal(st.etiqueta, 'excelente');
});

// ============================================================
// ETAPA 24 — Modo Historia
// ============================================================
test('Etapa 24: Modo Historia construye 6 capítulos con personajes reales y progresa hasta coronar', () => {
    HistoriaStore.iniciarNuevaCampana('retoneta');
    const caps = construirCapitulosHistoria('retoneta');
    assert.equal(caps.length, 6);
    assert.match(caps[0].relato, /Fabri/);
    assert.notEqual(caps[1].rivalId, 'retoneta');

    for (const cap of caps) {
        const ev = evaluarCapituloHistoria(cap, { golesLocal: 3, golesRival: 0 });
        assert.equal(ev.superado, true);
        assert.equal(ev.estrellaExtra, true);
        HistoriaStore.registrarResultadoCapitulo(cap, ev, { marcador: '3-0' });
    }
    const finalSt = HistoriaStore.leer();
    assert.equal(finalSt.campanaCompletada, true);
    assert.equal(finalSt.capituloActual, 7);
});

// ============================================================
// ETAPA 25 — Radio / Comentarios Textuales
// ============================================================
test('Etapa 25: ControladorComentarios dispara frases reales con anti-saturación y audioKey', () => {
    const audioClips = [];
    const radio = new ControladorComentarios({
        nombreLocal: 'LA RETONETA',
        nombreRival: 'EL BOGUERO',
        cooldownNormal: 5,
        onAudioHook: (item) => audioClips.push(item.audioKey),
    });

    // Tiro al travesaño
    radio.actualizar(0.016, { enJuego: true, woodwork: { arco: 'north', tipo: 'travesano' } });
    assert.ok(radio.actual && /TRAVESAÑO|PALO/.test(radio.actual.texto));
    assert.equal(audioClips.length, 1);

    // Anti-saturación: una barrida común inmediatamente después no pisa ni satura
    const textoAntes = radio.actual.texto;
    radio.actualizar(0.1, {
        enJuego: true,
        statsEventos: [{ tipo: 'barrida', team: 'local', nombre: 'Reta' }],
    });
    assert.equal(radio.actual.texto, textoAntes);

    // Un gol real tiene prioridad máxima y reemplaza de inmediato con nombre real
    radio.actualizar(0.1, {
        enJuego: true,
        segundosRestantes: 8,
        golesLocal: 2,
        golesRival: 1,
        statsEventos: [
            { tipo: 'barrida', team: 'local', nombre: 'Reta' },
            { tipo: 'gol', team: 'local', nombre: 'Fabri', minuto: 88 },
        ],
    });
    assert.ok(radio.actual && /FABRI|LA RETONETA/.test(radio.actual.texto));
    assert.ok(radio.actual.audioKey.startsWith('vox_'));
});

// ============================================================
// ETAPA 26 — Presentación Pre-Partido
// ============================================================
test('Etapa 26: construirDatosPrePartido distingue presentación breve vs completa con tabla, racha e historial', () => {
    const eqL = EQUIPOS.find((e) => e.id === 'retoneta');
    const eqR = EQUIPOS.find((e) => e.id === 'cattarino');
    const eqClas = EQUIPOS.find((e) => e.id === 'el_boguero');

    const breve = construirDatosPrePartido({
        equipoLocal: eqL,
        equipoRival: eqR,
        rivalidadInfo: { nivel: 20, esClasico: false, etiqueta: 'CRUCE CORDIAL', pj: 0 },
    });
    assert.equal(breve.tipoPresentacion, 'breve');
    assert.equal(breve.esCompleta, false);

    const completa = construirDatosPrePartido({
        equipoLocal: eqL,
        equipoRival: eqClas,
        modoLiga: { fecha: 11 },
        tablaLiga: [
            { id: 'retoneta', pts: 28 },
            { id: 'el_boguero', pts: 27 },
        ],
        eventoEspecial: { esEspecial: true, esFinal: false, subtitulo: 'DUELO POR LA PUNTA' },
        rivalidadInfo: {
            nivel: 84,
            esClasico: true,
            etiqueta: 'EL SUPERCLÁSICO CHAQUITO',
            textoNivel: 'RIVALIDAD 84/100',
            pj: 4,
            ganados: 2,
            empatados: 1,
            perdidos: 1,
        },
        rachasUsuario: { victoriasConsecutivas: 3 },
        climaCfg: { icono: '🌙', nombre: 'NOCHE DE LUCES' },
        historialPartidos: [{ equipoLocal: 'retoneta', equipoRival: 'el_boguero', gf: 3, gc: 2 }],
    });
    assert.equal(completa.tipoPresentacion, 'completa');
    assert.equal(completa.esCompleta, true);
    assert.equal(completa.local.posicionTabla, 1);
    assert.equal(completa.rival.posicionTabla, 2);
    assert.match(completa.historialCaraACara, /3-2/);
    assert.match(completa.climaTexto, /NOCHE DE LUCES/);
});

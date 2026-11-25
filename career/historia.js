/**
 * ETAPA 24 — MODO HISTORIA ("CAMINO A LA GLORIA CHAQUITO").
 *
 * Campaña por capítulos cortos basada en los equipos y personajes reales del juego
 * (`sim/planteles.js` + `assets/equipos.js`), sin cinemáticas pesadas.
 *
 * Capítulos:
 *   1. debut           — El Debut en el Potrero
 *   2. primer_clasico  — El Primer Clásico
 *   3. crisis          — Tormenta en el Vestuario
 *   4. revancha        — Noche de Revancha
 *   5. clasificacion   — A Todo o Nada (Clasificación)
 *   6. final           — La Gran Final de Chaquito
 *
 * Cada capítulo activa sistemas reales del universo Chaquito:
 *   - partido real (con clima, marcador inicial y dificultad propios)
 *   - objetivo deportivo verificable
 *   - noticia en Diario Chaquito
 *   - conferencia post-partido
 *   - incremento real de rivalidad
 *   - recompensa (reputación + título/celebración al coronar)
 */

import { PLANTELES } from '../sim/planteles.js';
import { CLASICOS_FUNDACIONALES } from './rivalidades.js';

function rivalClasicoDe(clubId) {
    for (const [a, b] of CLASICOS_FUNDACIONALES) {
        if (a === clubId) return b;
        if (b === clubId) return a;
    }
    return clubId === 'el_boguero' ? 'retoneta' : 'el_boguero';
}

function elegirRivalDistinto(preferido, prohibidos = []) {
    const fallbackOrden = [
        'cattarino',
        'el_boguero',
        'macabro',
        'barranquineros',
        'la_tikineta',
        'monarca',
        'trotenham',
        'retoneta',
    ];
    if (preferido && !prohibidos.includes(preferido)) return preferido;
    return fallbackOrden.find((id) => !prohibidos.includes(id)) || 'cattarino';
}

export function construirCapitulosHistoria(clubProtagonistaId = 'retoneta') {
    const clubId = String(clubProtagonistaId || 'retoneta');
    const plantel = PLANTELES[clubId] || PLANTELES.retoneta;
    const capitan = (plantel.campo && plantel.campo[0]) || 'Capitán';
    const cerebro = (plantel.campo && plantel.campo[1]) || 'Volante';
    const arquero = plantel.gk || 'Arquero';

    const rDebut = elegirRivalDistinto('cattarino', [clubId]);
    const rClasico = rivalClasicoDe(clubId);
    const rCrisis = elegirRivalDistinto('macabro', [clubId, rClasico]);
    const rRevancha = elegirRivalDistinto('barranquineros', [clubId, rDebut, rCrisis]);
    const rClasif = elegirRivalDistinto('la_tikineta', [clubId, rClasico, rRevancha]);
    const rFinal = elegirRivalDistinto('monarca', [clubId, rClasif]);

    return [
        {
            orden: 1,
            id: 'debut',
            etapa: 'DEBUT',
            titulo: 'CAPÍTULO 1 · EL DEBUT EN EL POTRERO',
            relato: `${capitan} se pone la cinta por primera vez. La hinchada llenó las gradas de madera para ver de qué está hecho el equipo.`,
            rivalId: rDebut,
            clima: 'dia',
            dificultad: 'facil',
            tiempoSeg: 65,
            golesLocalInicial: 0,
            golesRivalInicial: 0,
            esFinal: false,
            objetivo: 'Ganar el partido debut.',
            objetivoExtra: `Convertir 2 o más goles con el plantel de ${capitan}.`,
            recompensa: { popularidad: 6, hinchada: 7, respeto: 4, descripcion: '+Reputación barrial' },
            deltaRivalidad: 6,
            forzarConferencia: true,
        },
        {
            orden: 2,
            id: 'primer_clasico',
            etapa: 'PRIMER CLÁSICO',
            titulo: 'CAPÍTULO 2 · EL PRIMER CLÁSICO',
            relato: `El barrio no habla de otra cosa. ${cerebro} pidió la pelota en la semana: hoy se juega el orgullo contra el rival de toda la vida.`,
            rivalId: rClasico,
            clima: 'noche',
            dificultad: 'normal',
            tiempoSeg: 75,
            golesLocalInicial: 0,
            golesRivalInicial: 0,
            esFinal: false,
            objetivo: 'Ganar el clásico del barrio.',
            objetivoExtra: 'Ganar sin recibir más de 1 gol.',
            recompensa: { popularidad: 8, hinchada: 10, respeto: 7, descripcion: '+Orgullo de Clásico' },
            deltaRivalidad: 14,
            forzarConferencia: true,
        },
        {
            orden: 3,
            id: 'crisis',
            etapa: 'CRISIS',
            titulo: 'CAPÍTULO 3 · TORMENTA EN EL VESTUARIO',
            relato: `Semana pesada de rumores y lluvia torrencial. Arrancás 0-1 abajo: ${arquero} grita desde el fondo que nadie baje los brazos.`,
            rivalId: rCrisis,
            clima: 'lluvia_intensa',
            dificultad: 'normal',
            tiempoSeg: 65,
            golesLocalInicial: 0,
            golesRivalInicial: 1,
            esFinal: false,
            objetivo: 'Dar vuelta el 0-1 bajo la tormenta y ganar.',
            objetivoExtra: 'Terminar con al menos 2 goles de ventaja.',
            recompensa: { popularidad: 5, hinchada: 9, respeto: 9, descripcion: '+Carácter en la Crisis' },
            deltaRivalidad: 9,
            forzarConferencia: true,
        },
        {
            orden: 4,
            id: 'revancha',
            etapa: 'REVANCHA',
            titulo: 'CAPÍTULO 4 · NOCHE DE REVANCHA',
            relato: `En la rueda anterior festejaron en nuestra cara. Bajo la niebla de Chaquito, llegó la hora de ajustar cuentas en la cancha.`,
            rivalId: rRevancha,
            clima: 'niebla',
            dificultad: 'normal',
            tiempoSeg: 70,
            golesLocalInicial: 0,
            golesRivalInicial: 0,
            esFinal: false,
            objetivo: 'Vencer en el duelo de revancha.',
            objetivoExtra: 'Mantener la valla invicta (0 goles en contra).',
            recompensa: { popularidad: 7, hinchada: 8, respeto: 8, descripcion: '+Respeto recuperado' },
            deltaRivalidad: 12,
            forzarConferencia: true,
        },
        {
            orden: 5,
            id: 'clasificacion',
            etapa: 'CLASIFICACIÓN',
            titulo: 'CAPÍTULO 5 · BOLETO A LA FINAL',
            relato: `No sirve el empate: si se iguala en los 90', hay penales. ${capitan} y ${cerebro} van por el pase a la noche más grande.`,
            rivalId: rClasif,
            clima: 'noche',
            dificultad: 'dificil',
            tiempoSeg: 75,
            golesLocalInicial: 0,
            golesRivalInicial: 0,
            definirPorPenalesSiEmpata: true,
            esFinal: false,
            objetivo: 'Clasificar a la Gran Final (en los 90\' o por penales).',
            objetivoExtra: 'Clasificar ganando en tiempo reglamentario.',
            recompensa: { popularidad: 9, hinchada: 9, respeto: 10, descripcion: '+Finalista Oficial' },
            deltaRivalidad: 10,
            forzarConferencia: true,
        },
        {
            orden: 6,
            id: 'final',
            etapa: 'GRAN FINAL',
            titulo: 'CAPÍTULO 6 · LA GRAN FINAL DE CHAQUITO',
            relato: `Estadio repleto, luces de gala y el trofeo en el borde del campo. Noventa segundos para quedar en la historia eterna del club.`,
            rivalId: rFinal,
            clima: 'noche',
            dificultad: 'dificil',
            tiempoSeg: 85,
            golesLocalInicial: 0,
            golesRivalInicial: 0,
            definirPorPenalesSiEmpata: true,
            esFinal: true,
            objetivo: 'Consagrarte Campeón del Modo Historia.',
            objetivoExtra: 'Ganar la Final por 2+ goles de diferencia.',
            recompensa: {
                popularidad: 14,
                hinchada: 15,
                respeto: 14,
                celebracionDesbloqueada: 'especial',
                descripcion: '👑 Celebración "Corona Dorada" + Gloria Chaquito',
            },
            deltaRivalidad: 15,
            forzarConferencia: true,
        },
    ];
}

export function evaluarCapituloHistoria(
    capitulo,
    { golesLocal = 0, golesRival = 0, penales = null } = {}
) {
    if (!capitulo) return { superado: false, estrellaExtra: false, resumen: '' };
    const ganoPenales = !!(penales && (penales.ganador === 'mio' || penales.golesMios > penales.golesOtro));
    const ganoTiempo = golesLocal > golesRival;
    const superado = ganoTiempo || (!!capitulo.definirPorPenalesSiEmpata && golesLocal === golesRival && ganoPenales);

    let estrellaExtra = false;
    if (superado) {
        if (capitulo.id === 'debut') estrellaExtra = golesLocal >= 2;
        else if (capitulo.id === 'primer_clasico') estrellaExtra = golesRival <= 1;
        else if (capitulo.id === 'crisis') estrellaExtra = golesLocal - golesRival >= 2;
        else if (capitulo.id === 'revancha') estrellaExtra = golesRival === 0;
        else if (capitulo.id === 'clasificacion') estrellaExtra = ganoTiempo;
        else if (capitulo.id === 'final') estrellaExtra = golesLocal - golesRival >= 2;
    }

    return {
        capituloId: capitulo.id,
        orden: capitulo.orden,
        superado,
        estrellaExtra,
        resumen: superado
            ? `Capítulo superado (${golesLocal}-${golesRival}${penales ? ` · ${penales.golesMios}-${penales.golesOtro} pen.` : ''}).`
            : `No alcanzaste el objetivo del capítulo (${golesLocal}-${golesRival}). Podés reintentarlo cuando quieras.`,
    };
}

export const HistoriaStore = (() => {
    const KEY = 'chaquito_historia_v1';

    function crearInicial(clubId = 'retoneta') {
        return {
            v: 1,
            clubId: String(clubId || 'retoneta'),
            capituloActual: 1, // 1..6 (7 = campaña completada)
            completados: {}, // { [id]: { superado, estrellaExtra, marcador, fecha } }
            campanaCompletada: false,
        };
    }

    let mem = crearInicial();

    function normalizar(raw) {
        const base = crearInicial(raw && raw.clubId);
        if (!raw || typeof raw !== 'object') return base;
        return {
            v: 1,
            clubId: String(raw.clubId || 'retoneta'),
            capituloActual: Math.max(1, Math.min(7, parseInt(raw.capituloActual, 10) || 1)),
            completados: raw.completados && typeof raw.completados === 'object' ? { ...raw.completados } : {},
            campanaCompletada: !!raw.campanaCompletada,
        };
    }

    function leer() {
        try {
            if (typeof localStorage === 'undefined') return normalizar(mem);
            const raw = localStorage.getItem(KEY);
            return raw ? normalizar(JSON.parse(raw)) : crearInicial();
        } catch (_e) {
            return normalizar(mem);
        }
    }

    function escribir(st) {
        const limpio = normalizar(st);
        mem = limpio;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(limpio));
            return true;
        } catch (_e) {
            return false;
        }
    }

    function iniciarNuevaCampana(clubId = 'retoneta') {
        const nuevo = crearInicial(clubId);
        escribir(nuevo);
        return nuevo;
    }

    function registrarResultadoCapitulo(capitulo, evalCap, { marcador = '' } = {}) {
        const st = leer();
        if (!capitulo || !evalCap) return st;
        if (evalCap.superado) {
            const prev = st.completados[capitulo.id] || {};
            st.completados[capitulo.id] = {
                superado: true,
                estrellaExtra: !!(prev.estrellaExtra || evalCap.estrellaExtra),
                marcador,
                fecha: Date.now(),
            };
            if (st.capituloActual <= capitulo.orden) {
                st.capituloActual = capitulo.orden + 1;
            }
            if (capitulo.id === 'final' || st.capituloActual > 6) {
                st.campanaCompletada = true;
            }
        }
        escribir(st);
        return st;
    }

    return {
        leer,
        escribir,
        iniciarNuevaCampana,
        registrarResultadoCapitulo,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.HistoriaStore = HistoriaStore;
}

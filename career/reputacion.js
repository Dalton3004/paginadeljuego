/**
 * ETAPA 7 — Sistema de Reputación de Club / Jugador.
 *
 * Variables: popularidad, respeto, hinchada (relación con la tribuna),
 * rivalidadMaxima y reputacionGeneral (0..100).
 * Estricto diseño NO pay-to-win: desbloquea títulos cosméticos/honoríficos,
 * tono de noticias, ambiente y pequeñas situaciones narrativas.
 */

export const TITULOS_REPUTACION = [
    { id: 'potrero', nombre: 'Orgullo del Potrero', check: (r) => r.general >= 55 },
    { id: 'animador', nombre: 'Animador de Chaquito', check: (r) => r.general >= 65 },
    { id: 'idolo_hinchada', nombre: 'Ídolo de la Tribuna', check: (r) => r.hinchada >= 80 },
    { id: 'respetado', nombre: 'Caballero del Fútbol 8', check: (r) => r.respeto >= 80 },
    { id: 'taquillero', nombre: 'Imán de Taquilla', check: (r) => r.popularidad >= 82 },
    { id: 'grande', nombre: 'Gigante de Chaquito', check: (r) => r.general >= 78 },
    { id: 'leyenda', nombre: 'Leyenda Inmortal', check: (r) => r.general >= 90 },
];

function clamp100(v) {
    return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

export function nivelReputacionTexto(general) {
    if (general >= 90) return 'LEYENDA CHAQUITO';
    if (general >= 78) return 'GRANDE DE LA LIGA';
    if (general >= 64) return 'CLUB RESPETADO';
    if (general >= 48) return 'ANIMADOR BARRIAL';
    if (general >= 32) return 'EN CONSTRUCCIÓN';
    return 'CUESTIONADO';
}

function recalcularGeneral(rep) {
    const general = clamp100(rep.popularidad * 0.35 + rep.respeto * 0.35 + rep.hinchada * 0.3);
    const desbloqueados = TITULOS_REPUTACION.filter((t) => t.check({ ...rep, general })).map((t) => t.id);
    return {
        ...rep,
        general,
        rango: nivelReputacionTexto(general),
        titulosDesbloqueados: desbloqueados,
    };
}

export function crearEstadoReputacion() {
    return recalcularGeneral({
        popularidad: 50,
        respeto: 50,
        hinchada: 52,
        rivalidadMaxima: 0,
        titulosDesbloqueados: [],
    });
}

export function normalizarEstadoReputacion(raw) {
    if (!raw || typeof raw !== 'object') return crearEstadoReputacion();
    return recalcularGeneral({
        popularidad: clamp100(raw.popularidad ?? 50),
        respeto: clamp100(raw.respeto ?? 50),
        hinchada: clamp100(raw.hinchada ?? 52),
        rivalidadMaxima: clamp100(raw.rivalidadMaxima ?? 0),
        titulosDesbloqueados: Array.isArray(raw.titulosDesbloqueados) ? raw.titulosDesbloqueados : [],
    });
}

/**
 * Aplica deltas de reputación por un partido real terminado.
 */
export function actualizarReputacionPorPartido(
    estadoRaw,
    {
        resultado = 'draw',
        goleadaFavor = false,
        goleadaContra = false,
        remontada = false,
        esClasico = false,
        esFinal = false,
        tituloGanado = false,
        rachaVictorias = 0,
        rachaDerrotas = 0,
        nivelRivalidad = 0,
    } = {}
) {
    const prev = normalizarEstadoReputacion(estadoRaw);
    let dPop = 0;
    let dResp = 0;
    let dHin = 0;

    if (resultado === 'win') {
        dPop += 2;
        dResp += 2;
        dHin += 3;
        if (goleadaFavor) {
            dPop += 2;
            dHin += 2;
            dResp += 1;
        }
        if (remontada) {
            dPop += 3;
            dHin += 4;
            dResp += 2;
        }
        if (esClasico) {
            dHin += 4;
            dPop += 2;
            dResp += 2;
        }
        if (esFinal) {
            dPop += 3;
            dResp += 3;
            dHin += 3;
        }
        if (rachaVictorias >= 3) {
            dPop += 2;
            dResp += 1;
        }
    } else if (resultado === 'draw') {
        if (esClasico) dResp += 1;
    } else {
        dHin -= 2;
        dPop -= 1;
        if (goleadaContra) {
            dHin -= 3;
            dResp -= 2;
        }
        if (esClasico) dHin -= 2;
        if (rachaDerrotas >= 3) {
            dHin -= 2;
            dResp -= 1;
        }
    }

    if (tituloGanado) {
        dPop += 7;
        dResp += 7;
        dHin += 8;
    }

    const nuevo = recalcularGeneral({
        popularidad: clamp100(prev.popularidad + dPop),
        respeto: clamp100(prev.respeto + dResp),
        hinchada: clamp100(prev.hinchada + dHin),
        rivalidadMaxima: Math.max(prev.rivalidadMaxima, clamp100(nivelRivalidad)),
    });

    const nuevosTitulos = nuevo.titulosDesbloqueados.filter((id) => !prev.titulosDesbloqueados.includes(id));

    return {
        estado: nuevo,
        deltas: {
            popularidad: nuevo.popularidad - prev.popularidad,
            respeto: nuevo.respeto - prev.respeto,
            hinchada: nuevo.hinchada - prev.hinchada,
            general: nuevo.general - prev.general,
        },
        nuevosTitulos: TITULOS_REPUTACION.filter((t) => nuevosTitulos.includes(t.id)),
    };
}

/**
 * Aplica ajustes ligeros por declaraciones en conferencia o cumplimiento de objetivos.
 */
export function aplicarDeltaReputacion(estadoRaw, { popularidad = 0, respeto = 0, hinchada = 0 } = {}) {
    const prev = normalizarEstadoReputacion(estadoRaw);
    const nuevo = recalcularGeneral({
        ...prev,
        popularidad: clamp100(prev.popularidad + popularidad),
        respeto: clamp100(prev.respeto + respeto),
        hinchada: clamp100(prev.hinchada + hinchada),
    });
    return {
        estado: nuevo,
        deltas: {
            popularidad: nuevo.popularidad - prev.popularidad,
            respeto: nuevo.respeto - prev.respeto,
            hinchada: nuevo.hinchada - prev.hinchada,
            general: nuevo.general - prev.general,
        },
    };
}

/**
 * Planteles e identidad de jugadores por equipo (4 vs 4: 3 de campo + 1 arquero).
 * Respeta las skins personalizadas de assets/skins.js (p. ej. Fabri, Mariano y Reta en La Retoneta)
 * y provee nombres consistentes para estadísticas, goleadores, valoraciones y figura del partido.
 */
export const PLANTELES = {
    retoneta: {
        campo: ['Fabri', 'Mariano', 'Reta'],
        gk: 'Gato',
    },
    el_boguero: {
        campo: ['Boguero', 'Tano', 'Lucho'],
        gk: 'Ruso',
    },
    macabro: {
        campo: ['Sombra', 'Cuervo', 'Dante'],
        gk: 'Muro',
    },
    cattarino: {
        campo: ['Catta', 'Nico', 'Pipo'],
        gk: 'Mono',
    },
    barrio_fino: {
        campo: ['Fino', 'Tomi', 'Joaco'],
        gk: 'Chiqui',
    },
    choborra: {
        campo: ['Chobo', 'Beto', 'Pelado'],
        gk: 'Flaco',
    },
    monarca: {
        campo: ['Rey', 'Conde', 'Duque'],
        gk: 'Bastian',
    },
    norwhisky: {
        campo: ['Whisky', 'Colo', 'Santi'],
        gk: 'Polaco',
    },
    agustintos: {
        campo: ['Agus', 'Nacho', 'Fede'],
        gk: 'Oso',
    },
    trotenham: {
        campo: ['Harry', 'Sonny', 'Mati'],
        gk: 'Loco',
    },
    botajogo: {
        campo: ['Jair', 'Tuco', 'Nene'],
        gk: 'Dida',
    },
    la_tikineta: {
        campo: ['Tiki', 'Mago', 'Enzo'],
        gk: 'Pulpo',
    },
    barranquineros: {
        campo: ['Barranca', 'Chicho', 'Zurdo'],
        gk: 'Laucha',
    },
};

const PLANTEL_GENERICO = {
    local: { campo: ['Capitán', 'Volante', 'Punta'], gk: 'Arquero' },
    rival: { campo: ['Delantero', 'Medio', 'Cierre'], gk: 'Arquero' },
};

export function plantelDeEquipo(equipoId, lado = 'local') {
    const id = String(equipoId || '').trim();
    if (id && PLANTELES[id]) return PLANTELES[id];
    return lado === 'rival' ? PLANTEL_GENERICO.rival : PLANTEL_GENERICO.local;
}

export function slotDeMobilityId(mobilityId, isGK = false) {
    if (isGK) return 'gk';
    const m = /_(\d+)$/.exec(String(mobilityId || ''));
    if (!m) return 0;
    const idx = Number(m[1]);
    return Number.isFinite(idx) ? Math.max(0, Math.min(2, idx)) : 0;
}

export function nombreJugador(equipoId, mobilityId, { isGK = false, team = 'local' } = {}) {
    const plantel = plantelDeEquipo(equipoId, team);
    const slot = slotDeMobilityId(mobilityId, isGK || String(mobilityId || '').endsWith('_gk'));
    if (slot === 'gk') return plantel.gk;
    return plantel.campo[slot] || plantel.campo[0];
}

/**
 * Asigna identidad estable (`playerId`, `slot`, `nombre`, `equipoId`) a una lista de Jugador.
 * No altera física, velocidades ni IA.
 */
export function asignarNombresPlantel(players, { localId = '', rivalId = '' } = {}) {
    if (!Array.isArray(players)) return players;
    let idxLocal = 0;
    let idxRival = 0;
    for (const p of players) {
        if (!p) continue;
        const team = p.team === 'rival' ? 'rival' : 'local';
        const eqId = team === 'rival' ? rivalId : localId;
        let mov = p.mobilityId;
        if (!mov || mov === 'local' || mov === 'rival') {
            if (p.isGK) mov = team + '_gk';
            else {
                const n = team === 'rival' ? idxRival++ : idxLocal++;
                mov = `${team}_${n}`;
            }
        } else if (!p.isGK) {
            if (team === 'rival') idxRival++;
            else idxLocal++;
        }
        p.playerId = mov;
        p.equipoId = eqId || p.equipoId || '';
        if (!p.nombre || p._nombreAuto) {
            p.nombre = nombreJugador(eqId, mov, { isGK: !!p.isGK, team });
            p._nombreAuto = true;
        }
    }
    return players;
}

if (typeof globalThis !== 'undefined') {
    globalThis.PLANTELES = PLANTELES;
    globalThis.plantelDeEquipo = plantelDeEquipo;
    globalThis.nombreJugador = nombreJugador;
    globalThis.asignarNombresPlantel = asignarNombresPlantel;
}

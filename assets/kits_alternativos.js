/**
 * ETAPA 15 — Soporte de Camisetas Alternativas para los 13 clubes de Liga Chaquito F8.
 *
 * Permite:
 *   1) Elección manual de camiseta titular o suplente por parte del jugador.
 *   2) Resolución automática de choque de colores cuando local y visitante tienen paletas parecidas.
 *   3) Tinte pixel-art limpio que conserva sombras y bordes negros del sprite original.
 */

export const KITS_ALTERNATIVOS = {
    retoneta: {
        nombre: 'Blanca Dorada',
        colores: ['#f4f7fb', '#ffcc00'],
        tint: 'rgba(255, 232, 130, 0.38)',
    },
    el_boguero: {
        nombre: 'Crema Visitante',
        colores: ['#f5efe0', '#8f161d'],
        tint: 'rgba(245, 238, 210, 0.42)',
    },
    macabro: {
        nombre: 'Violeta Nocturna',
        colores: ['#5928a3', '#f2d21b'],
        tint: 'rgba(130, 72, 235, 0.38)',
    },
    cattarino: {
        nombre: 'Coral del Puerto',
        colores: ['#ff6b5e', '#10243f'],
        tint: 'rgba(255, 110, 95, 0.38)',
    },
    barrio_fino: {
        nombre: 'Azul Noche',
        colores: ['#102a5c', '#5fd8d0'],
        tint: 'rgba(22, 62, 145, 0.44)',
    },
    choborra: {
        nombre: 'Amarilla Potrero',
        colores: ['#ffd43b', '#19376d'],
        tint: 'rgba(255, 216, 60, 0.40)',
    },
    monarca: {
        nombre: 'Dorada Real',
        colores: ['#e5b822', '#1a1204'],
        tint: 'rgba(245, 196, 45, 0.42)',
    },
    norwhisky: {
        nombre: 'Blanca Escocesa',
        colores: ['#f2f6fa', '#146b28'],
        tint: 'rgba(235, 248, 255, 0.40)',
    },
    agustintos: {
        nombre: 'Celeste Albiceleste',
        colores: ['#6ec6ff', '#1b263b'],
        tint: 'rgba(110, 205, 255, 0.42)',
    },
    trotenham: {
        nombre: 'Azul Marino',
        colores: ['#12264f', '#a3ff47'],
        tint: 'rgba(24, 58, 138, 0.46)',
    },
    botajogo: {
        nombre: 'Verde Verano',
        colores: ['#1db954', '#ffd43b'],
        tint: 'rgba(32, 195, 92, 0.42)',
    },
    la_tikineta: {
        nombre: 'Turquesa Eléctrica',
        colores: ['#2de2e6', '#2a0f4d'],
        tint: 'rgba(45, 226, 230, 0.38)',
    },
    barranquineros: {
        nombre: 'Roja Barranca',
        colores: ['#e03131', '#ffe066'],
        tint: 'rgba(230, 52, 52, 0.40)',
    },
};

function distanciaPaleta(colA = [], colB = []) {
    const rgb = (h) => {
        const s = String(h || '#888888');
        if (s.length < 7) return [128, 128, 128];
        return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) || 0);
    };
    const d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
    const [a0, a1] = [colA[0] || '#444444', colA[1] || colA[0] || '#444444'];
    const [b0, b1] = [colB[0] || '#888888', colB[1] || colB[0] || '#888888'];
    return Math.min(d(a0, b0) + d(a1, b1), d(a0, b1) + d(a1, b0));
}

export function obtenerKitAlternativo(equipoId) {
    return (
        KITS_ALTERNATIVOS[equipoId] || {
            nombre: 'Alternativa Oscura',
            colores: ['#1c2e4a', '#ffcc00'],
            tint: 'rgba(18, 40, 92, 0.42)',
        }
    );
}

/**
 * Decide si local y/o visitante usan camiseta alternativa según preferencia del jugador
 * y detección automática de similitud cromática entre los dos equipos.
 */
export function resolverCamisetasPartido(eqLocal, eqRival, { localUsaAlt = false } = {}) {
    if (!eqLocal || !eqRival) {
        return { localAlt: !!localUsaAlt, rivalAlt: false, localInfo: null, rivalInfo: null };
    }
    const altL = obtenerKitAlternativo(eqLocal.id);
    const altR = obtenerKitAlternativo(eqRival.id);
    const paletaLocalActiva = localUsaAlt ? altL.colores : eqLocal.colores;

    const mismoClub = eqLocal.id === eqRival.id;
    const chocan =
        (mismoClub && !localUsaAlt) ||
        distanciaPaleta(paletaLocalActiva, eqRival.colores) < 90;

    return {
        localAlt: !!localUsaAlt,
        rivalAlt: chocan,
        localInfo: localUsaAlt ? altL : null,
        rivalInfo: chocan ? altR : null,
    };
}

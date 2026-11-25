/**
 * ETAPA 29 — EQUIPO FAVORITO Y PERFIL.
 *
 * Selección explícita y persistente de Equipo Favorito del jugador.
 * REGLA ESTRICTA: NUNCA se asume ni deduce automáticamente del último partido jugado.
 * Mientras el usuario no lo elija explícitamente, vale `''` ("Sin elegir").
 */

export const CLUBES_FAVORITOS_IDS = [
    'el_boguero',
    'macabro',
    'cattarino',
    'barrio_fino',
    'choborra',
    'retoneta',
    'monarca',
    'norwhisky',
    'agustintos',
    'trotenham',
    'botajogo',
    'la_tikineta',
    'barranquineros',
];

export function esEquipoFavoritoValido(id) {
    if (id === '' || id === null || id === undefined) return true;
    return CLUBES_FAVORITOS_IDS.includes(String(id).trim());
}

export function sanitizarEquipoFavorito(id) {
    const limpio = String(id == null ? '' : id).trim();
    return CLUBES_FAVORITOS_IDS.includes(limpio) ? limpio : '';
}

export function describirEquipoFavorito(equipoId, catalogo = []) {
    const id = sanitizarEquipoFavorito(equipoId);
    if (!id) {
        return {
            elegido: false,
            id: '',
            nombre: 'Sin elegir',
            corto: 'SIN CLUB',
            siglas: '—',
            colores: ['#3a4a66', '#1b263b'],
        };
    }
    const lista = Array.isArray(catalogo) && catalogo.length
        ? catalogo
        : typeof globalThis !== 'undefined' && Array.isArray(globalThis.EQUIPOS)
        ? globalThis.EQUIPOS
        : [];
    const eq = lista.find((x) => x && x.id === id);
    if (!eq) {
        return {
            elegido: true,
            id,
            nombre: id.replace(/_/g, ' ').toUpperCase(),
            corto: id.slice(0, 10).toUpperCase(),
            siglas: id.slice(0, 3).toUpperCase(),
            colores: ['#2457c9', '#111111'],
        };
    }
    return {
        elegido: true,
        id: eq.id,
        nombre: eq.nombre,
        corto: eq.corto || eq.nombre,
        siglas: eq.siglas || 'FC',
        colores: eq.colores || ['#2457c9', '#111111'],
        logo: eq.logo || null,
    };
}

export const EquipoFavoritoStore = (() => {
    const KEY = 'chaquito_equipo_favorito_v1';
    let mem = '';

    function obtener() {
        try {
            if (typeof localStorage === 'undefined') return sanitizarEquipoFavorito(mem);
            const raw = localStorage.getItem(KEY);
            return sanitizarEquipoFavorito(raw);
        } catch (_e) {
            return sanitizarEquipoFavorito(mem);
        }
    }

    function fijar(equipoId, { sincronizarRemoto = true } = {}) {
        const id = sanitizarEquipoFavorito(equipoId);
        mem = id;
        try {
            if (typeof localStorage !== 'undefined') {
                if (id) localStorage.setItem(KEY, id);
                else localStorage.removeItem(KEY);
            }
        } catch (_e) {
            /* entorno sin storage */
        }

        if (
            sincronizarRemoto &&
            typeof globalThis !== 'undefined' &&
            globalThis.AuthStore &&
            typeof globalThis.AuthStore.guardarEquipoFavoritoRemoto === 'function'
        ) {
            globalThis.AuthStore.guardarEquipoFavoritoRemoto(id).catch(() => {});
        }
        return id;
    }

    function reiniciar() {
        return fijar('', { sincronizarRemoto: false });
    }

    return {
        obtener,
        fijar,
        reiniciar,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.EquipoFavoritoStore = EquipoFavoritoStore;
}

/**
 * ETAPA 33 — PERSISTENCIA Y MIGRACIONES SEGURAS (JSON + PostgreSQL + Cliente).
 *
 * Garantiza compatibilidad hacia atrás para cuentas antiguas:
 *   - Nunca borra ni invalida cuentas, hashes scrypt, sesiones, amigos, ranking ni partidos previos.
 *   - Rellena defaults limpios (`equipoFavorito: ""`, `datosCarrera: null`, `equipoLocal: ""`, `equipoRival: ""`).
 *   - Sanitiza y acota los respaldos de progreso de carrera (`datosCarrera`) antes de persistirlos.
 */

import { sanitizarEquipoFavorito, esEquipoFavoritoValido } from './favorito_perfil.js';

const MAX_CARRERA_BYTES = 140_000;

export function migrarRegistroCuenta(cuenta) {
    if (!cuenta || typeof cuenta !== 'object') return null;
    return {
        ...cuenta,
        equipoFavorito: sanitizarEquipoFavorito(cuenta.equipoFavorito),
        datosCarrera:
            cuenta.datosCarrera && typeof cuenta.datosCarrera === 'object'
                ? cuenta.datosCarrera
                : null,
    };
}

export function migrarRegistroJugador(jugador, cuenta = null) {
    if (!jugador || typeof jugador !== 'object') return null;
    const fav = sanitizarEquipoFavorito(
        jugador.equipoFavorito || (cuenta && cuenta.equipoFavorito) || ''
    );
    return {
        ...jugador,
        pj: Number(jugador.pj) || 0,
        pg: Number(jugador.pg) || 0,
        pp: Number(jugador.pp) || 0,
        pe: Number(jugador.pe) || 0,
        pts: Number(jugador.pts) || 0,
        gf: Number(jugador.gf) || 0,
        gc: Number(jugador.gc) || 0,
        ultimo: Number(jugador.ultimo) || 0,
        equipoFavorito: fav,
    };
}

export function migrarRegistroPartido(partido) {
    if (!partido || typeof partido !== 'object') return null;
    return {
        ...partido,
        modo: partido.modo || 'solo',
        equipoLocal: String(partido.equipoLocal || '').slice(0, 32),
        equipoRival: String(partido.equipoRival || '').slice(0, 32),
    };
}

/**
 * Sanitiza un paquete `datosCarrera` enviado por el cliente para persistencia en servidor
 * (JSON o columna JSONB `datos_carrera` en PostgreSQL).
 */
export function sanitizarDatosCarreraServidor(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const src =
        raw.datosCarrera && typeof raw.datosCarrera === 'object' && !Array.isArray(raw.datosCarrera)
            ? raw.datosCarrera
            : raw;
    const permitido = {
        v: 1,
        actualizadoEn: Date.now(),
        equipoFavorito: sanitizarEquipoFavorito(src.equipoFavorito),
        carrera: src.carrera && typeof src.carrera === 'object' ? src.carrera : null,
        desafios: src.desafios && typeof src.desafios === 'object' ? src.desafios : null,
        historia: src.historia && typeof src.historia === 'object' ? src.historia : null,
        copaHistorial: Array.isArray(src.copaHistorial) ? src.copaHistorial.slice(0, 25) : [],
        supercopaHistorial: Array.isArray(src.supercopaHistorial) ? src.supercopaHistorial.slice(0, 25) : [],
    };
    try {
        const serial = JSON.stringify(permitido);
        if (serial.length > MAX_CARRERA_BYTES) return null;
        return JSON.parse(serial);
    } catch (_e) {
        return null;
    }
}

export { sanitizarEquipoFavorito, esEquipoFavoritoValido };

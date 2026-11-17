/**
 * Liga Chaquito F8 — Simulación OFFLINE reutilizada por el servidor.
 *
 * Importa los mismos módulos ES de sim/ que usa el cliente (sin vm).
 * cualquier cambio en sim/ rige en el modo EN LÍNEA.
 */

import {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido,
} from './sim/index.js';

/** Lista legada (documentación / tools). */
export const ARCHIVOS_SIM = [
    'sim/config.js',
    'sim/vector.js',
    'sim/pelota.js',
    'sim/jugador.js',
    'sim/jugador_ia.js',
    'sim/gestor.js',
];

/**
 * Devuelve el mismo shape que antes producía cargarSimulacion() vía vm.
 * Se mantiene por compatibilidad con tests y partido_online.js.
 */
export function cargarSimulacion() {
    return {
        CONFIG,
        DIFICULTADES,
        EstadoPartido,
        Vector2D,
        Pelota,
        Jugador,
        GestorPartido,
        TACTICAS,
        TACTICA_ORDEN,
        factorEstrellas,
        perfilConEstrellas,
    };
}

export {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido,
};

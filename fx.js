/**
 * Capa de animaciones y game-feel (FX v2).
 * Partida en fx/helpers, fx/estado_jugador, fx/mundo.
 */
import { sampleCurve } from './fx/helpers.js';
import { EstadoJugador } from './fx/estado_jugador.js';
import { Mundo } from './fx/mundo.js';

export const FX = { Mundo, EstadoJugador, sampleCurve, version: 2 };

if (typeof globalThis !== 'undefined') {
    globalThis.FX = FX;
}

/**
 * Puente browser: importa la simulación ES y la expone en window
 * para game.js y el resto de scripts clásicos.
 */
import {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido, MOVILIDAD_JUGADORES,
} from './index.js';

const g = typeof window !== 'undefined' ? window : globalThis;
Object.assign(g, {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido, MOVILIDAD_JUGADORES,
});

// Señal para scripts que esperan a la simulación
g.__SIM_ES_LISTA__ = true;

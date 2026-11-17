/**
 * Simulación offline (módulos ES) — misma lógica que el cliente.
 */
export {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
} from './config.js';
export { Vector2D } from './vector.js';
export { Pelota } from './pelota.js';
export { Jugador } from './jugador.js';
import './jugador_ia.js';
export { GestorPartido } from './gestor.js';
export { MOVILIDAD_JUGADORES } from './movilidad.js';

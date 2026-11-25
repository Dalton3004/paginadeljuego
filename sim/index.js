/**
 * Simulación offline (módulos ES) — misma lógica que el cliente y el servidor.
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
export { PLANTELES, plantelDeEquipo, nombreJugador, asignarNombresPlantel } from './planteles.js';
export { CONFIG_VALORACION, valorarJugador, calcularValoraciones, construirResumenJugador } from './valoracion.js';
export { MatchStats, esTiroAlArcoProyectado } from './estadisticas.js';
export { Replay, CamaraReplay } from './replay.js';
export {
    DIRECCIONES_PENAL,
    EFECTOS_PENAL,
    resolverEjecucionPenal,
    decisionPenalIA,
    SeriePenales,
} from './penales_core.js';

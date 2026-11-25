/**
 * Puente browser: importa la simulación ES y la expone en window
 * para game.js y los mixins del cliente.
 */
import {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido, MOVILIDAD_JUGADORES,
    PLANTELES, plantelDeEquipo, nombreJugador, asignarNombresPlantel,
    CONFIG_VALORACION, valorarJugador, calcularValoraciones,
    MatchStats, esTiroAlArcoProyectado,
    Replay, CamaraReplay,
    DIRECCIONES_PENAL, EFECTOS_PENAL, resolverEjecucionPenal, decisionPenalIA, SeriePenales,
} from './index.js';

const g = typeof window !== 'undefined' ? window : globalThis;
Object.assign(g, {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido, MOVILIDAD_JUGADORES,
    PLANTELES, plantelDeEquipo, nombreJugador, asignarNombresPlantel,
    CONFIG_VALORACION, valorarJugador, calcularValoraciones,
    MatchStats, esTiroAlArcoProyectado,
    Replay, CamaraReplay,
    DIRECCIONES_PENAL, EFECTOS_PENAL, resolverEjecucionPenal, decisionPenalIA, SeriePenales,
});

// Señal para scripts que esperan a la simulación
g.__SIM_ES_LISTA__ = true;

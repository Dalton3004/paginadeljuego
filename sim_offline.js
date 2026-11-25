/**
 * Entrada de simulación para Node.js (servidor online y suite de tests).
 * Reexporta los módulos ES de sim/ sin duplicar código.
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
} from './sim/index.js';

export function cargarSimulacion() {
    return {
        CONFIG,
        DIFICULTADES,
        EstadoPartido,
        Vector2D,
        Pelota,
        Jugador,
        GestorPartido,
        MOVILIDAD_JUGADORES,
        TACTICAS,
        TACTICA_ORDEN,
        factorEstrellas,
        perfilConEstrellas,
        PLANTELES,
        plantelDeEquipo,
        nombreJugador,
        asignarNombresPlantel,
        CONFIG_VALORACION,
        valorarJugador,
        calcularValoraciones,
        MatchStats,
        esTiroAlArcoProyectado,
        Replay,
        CamaraReplay,
        DIRECCIONES_PENAL,
        EFECTOS_PENAL,
        resolverEjecucionPenal,
        decisionPenalIA,
        SeriePenales,
    };
}

export {
    CONFIG, DIFICULTADES, EstadoPartido, TACTICAS, TACTICA_ORDEN,
    factorEstrellas, perfilConEstrellas,
    Vector2D, Pelota, Jugador, GestorPartido, MOVILIDAD_JUGADORES,
    PLANTELES, plantelDeEquipo, nombreJugador, asignarNombresPlantel,
    CONFIG_VALORACION, valorarJugador, calcularValoraciones,
    MatchStats, esTiroAlArcoProyectado,
    Replay, CamaraReplay,
    DIRECCIONES_PENAL, EFECTOS_PENAL, resolverEjecucionPenal, decisionPenalIA, SeriePenales,
};

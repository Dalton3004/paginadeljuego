// Jugadores personalizados (skins): en un equipo, uno o más de sus 3 jugadores de campo pueden
// usar un diseño propio en vez de la camiseta común. Los demás y el arquero no cambian.
//
//   slot 0 = jugador que manejás (local_0 / rival_0)
//   slot 1 = segundo jugador de campo
//   slot 2 = tercer jugador de campo
//
// Para sumar un jugador nuevo: agregá una línea acá (ver GUIA_JUGADORES_PERSONALIZADOS.md).
// El kit tiene que existir en assets/sprites/atlas.js (SPRITE_ATLAS.kits). Si no existe,
// render_world.js cae solo a la camiseta del equipo y el juego no se rompe.
//
//   '<kit del equipo>': [ { slot: <0|1|2>, kit: '<kit del jugador>' }, ... ]
export const SKINS_ESPECIALES = {
    team_retoneta: [
        { slot: 0, kit: 'player_fabri' },    // Fabri  (el que manejás)
        { slot: 1, kit: 'player_mariano' },  // Mariano
        { slot: 2, kit: 'player_reta' }      // Reta
    ]
};

/** Kit que debe dibujar un jugador de campo: su skin personalizada si le toca, si no la del equipo. */
export function kitDeJugador(kitEquipo, mobilityId) {
    const lista = SKINS_ESPECIALES[kitEquipo];
    if (!lista) return kitEquipo;
    const m = /_(\d)$/.exec(String(mobilityId || ''));
    if (!m) return kitEquipo;
    const esp = lista.find(e => e.slot === Number(m[1]));
    return esp ? esp.kit : kitEquipo;
}

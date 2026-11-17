/**
 * Perfil del jugador (F6 6.5): estadísticas, rachas y logros calculados sobre su historial.
 * Lógica pura: recibe los partidos que devuelve persistencia.historial() (más nuevo primero,
 * { resultado: "win"|"draw"|"loss", gf, gc, modo, cuando }) y no toca disco ni red.
 */
export const LOGROS = {
    primer_partido: { nombre: "Debut", desc: "Jugá tu primer partido", ok: (s) => s.partidas >= 1 },
    primera_victoria: { nombre: "Primera victoria", desc: "Ganá un partido", ok: (s) => s.ganadas >= 1 },
    racha_3: { nombre: "En racha", desc: "Ganá 3 seguidos", ok: (s) => s.mejorRacha >= 3 },
    goleador: { nombre: "Goleador", desc: "Marcá 5 goles en total", ok: (s) => s.golesFavor >= 5 },
    veterano: { nombre: "Veterano", desc: "Jugá 10 partidos", ok: (s) => s.partidas >= 10 },
    muralla: { nombre: "Muralla", desc: "Ganá sin recibir goles", ok: (s) => s.vallasInvictas >= 1 },
};

export function calcularPerfil(partidosNuevoAViejo = []) {
    const h = [...partidosNuevoAViejo].reverse(); // cronológico: viejo → nuevo
    const s = {
        partidas: h.length, ganadas: 0, empatadas: 0, perdidas: 0,
        golesFavor: 0, golesContra: 0, mejorRacha: 0, vallasInvictas: 0,
    };
    let corrida = 0;
    for (const m of h) {
        s.golesFavor += m.gf || 0;
        s.golesContra += m.gc || 0;
        if (m.resultado === "win") {
            s.ganadas++;
            corrida++;
            s.mejorRacha = Math.max(s.mejorRacha, corrida);
            if (!m.gc) s.vallasInvictas++;
        } else {
            corrida = 0;
            if (m.resultado === "loss") s.perdidas++;
            else s.empatadas++;
        }
    }
    // Racha actual: positiva = victorias seguidas, negativa = derrotas seguidas, un empate la corta.
    let racha = 0;
    for (let i = h.length - 1; i >= 0; i--) {
        const r = h[i].resultado;
        if (r !== "win" && r !== "loss") break;
        const v = r === "win" ? 1 : -1;
        if (racha === 0 || Math.sign(racha) === v) racha += v;
        else break;
    }
    return {
        ...s,
        efectividad: s.partidas ? Math.round((s.ganadas / s.partidas) * 100) : 0,
        rachaActual: racha,
        logros: Object.entries(LOGROS).map(([id, l]) => ({
            id, nombre: l.nombre, desc: l.desc, desbloqueado: l.ok(s),
        })),
        ventana: h.length,
    };
}

/**
 * ETAPA 4 — Sistema de Valoración de Jugadores y Figura del Partido (MVP).
 *
 * Calcula un rating numérico (4.0 a 10.0) simple, explicable y configurable
 * a partir de estadísticas reales del partido. Diseñado para que un gran arquero,
 * un defensor recuperador o un armador puedan ser Figura del Partido tanto como
 * un goleador.
 */

export const CONFIG_VALORACION = {
    base: 6.0,
    min: 4.0,
    max: 10.0,
    pesos: {
        gol: 1.2,
        asistencia: 0.85,
        tiroAlArco: 0.22,
        tiroFuera: 0.06,
        paseCompletado: 0.14,
        bonusPrecisionPases: 0.28, // >= 3 pases y >= 75 % completados
        recuperacion: 0.34,
        barridaExitosa: 0.42,
        atajada: 0.68,
        vallaInvictaGK: 0.95,
        vallaInvictaCampo: 0.35,
        participacionMax: 0.45, // por tiempo con pelota + intervenciones
        perdida: -0.14,
        maxCastigoPerdidas: -0.7,
        golRecibidoGK: -0.28,
        maxCastigoGolesGK: -1.1,
        victoria: 0.25,
        derrota: -0.15,
    },
};

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function redondear1(v) {
    return Math.round(v * 10) / 10;
}

/**
 * Construye un resumen legible con las mejores contribuciones reales del jugador.
 */
export function construirResumenJugador(j, { vallaInvicta = false } = {}) {
    const partes = [];
    if (j.goles > 0) partes.push(j.goles === 1 ? '1 gol' : `${j.goles} goles`);
    if (j.asistencias > 0) partes.push(j.asistencias === 1 ? '1 asistencia' : `${j.asistencias} asistencias`);
    if (j.isGK && j.atajadas > 0) partes.push(j.atajadas === 1 ? '1 atajada' : `${j.atajadas} atajadas`);
    if (j.isGK && vallaInvicta) partes.push('Valla invicta');
    if (j.recuperaciones > 0) {
        partes.push(j.recuperaciones === 1 ? '1 recuperación' : `${j.recuperaciones} recuperaciones`);
    }
    if (j.barridasExitosas > 0) {
        partes.push(j.barridasExitosas === 1 ? '1 quite en barrida' : `${j.barridasExitosas} quites en barrida`);
    }
    if (j.pasesCompletados >= 2) {
        partes.push(`${j.pasesCompletados}/${j.pases} pases`);
    }
    if (!j.isGK && partes.length < 2 && j.tirosAlArco > 0) {
        partes.push(j.tirosAlArco === 1 ? '1 tiro al arco' : `${j.tirosAlArco} tiros al arco`);
    }
    if (!j.isGK && vallaInvicta && partes.length < 3 && (j.recuperaciones > 0 || j.barridasExitosas > 0)) {
        partes.push('Sólido atrás');
    }
    if (partes.length === 0) {
        if (j.pasesCompletados === 1) partes.push('1 pase completado');
        else if (j.tiros > 0) partes.push(`${j.tiros} ${j.tiros === 1 ? 'remate' : 'remates'}`);
        else if (j.tiempoConPelota >= 2) partes.push(`${Math.round(j.tiempoConPelota)}s en conducción`);
        else partes.push('Partido correcto');
    }
    return partes.slice(0, 3).join(' · ');
}

/**
 * Calcula la valoración individual de un jugador.
 */
export function valorarJugador(j, contexto = {}, cfg = CONFIG_VALORACION) {
    const P = cfg.pesos;
    const team = j.team === 'rival' ? 'rival' : 'local';
    const golesFavor = team === 'local' ? (contexto.golesLocal || 0) : (contexto.golesRival || 0);
    const golesContra = team === 'local' ? (contexto.golesRival || 0) : (contexto.golesLocal || 0);
    const tirosRival = team === 'local' ? (contexto.tirosRival || 0) : (contexto.tirosLocal || 0);

    const goles = j.goles || 0;
    const asistencias = j.asistencias || 0;
    const tiros = j.tiros || 0;
    const tirosAlArco = j.tirosAlArco || 0;
    const tirosFuera = Math.max(0, tiros - tirosAlArco);
    const pases = j.pases || 0;
    const pasesCompletados = j.pasesCompletados || 0;
    const recuperaciones = j.recuperaciones || 0;
    const barridas = j.barridas || 0;
    const barridasExitosas = j.barridasExitosas || 0;
    const atajadas = j.atajadas || 0;
    const perdidas = j.perdidas || 0;
    const tiempoConPelota = j.tiempoConPelota || 0;

    let puntaje = cfg.base;
    const desglose = { base: cfg.base };

    if (goles > 0) {
        const v = goles * P.gol;
        puntaje += v;
        desglose.goles = redondear1(v);
    }
    if (asistencias > 0) {
        const v = asistencias * P.asistencia;
        puntaje += v;
        desglose.asistencias = redondear1(v);
    }
    if (tirosAlArco > 0 || tirosFuera > 0) {
        const v = tirosAlArco * P.tiroAlArco + tirosFuera * P.tiroFuera;
        puntaje += v;
        desglose.tiros = redondear1(v);
    }
    if (pasesCompletados > 0) {
        let v = pasesCompletados * P.paseCompletado;
        if (pases >= 3 && pasesCompletados / pases >= 0.75) v += P.bonusPrecisionPases;
        puntaje += v;
        desglose.pases = redondear1(v);
    }
    if (recuperaciones > 0 || barridasExitosas > 0) {
        const v = recuperaciones * P.recuperacion + barridasExitosas * P.barridaExitosa;
        puntaje += v;
        desglose.defensa = redondear1(v);
    }
    if (j.isGK && atajadas > 0) {
        const v = atajadas * P.atajada;
        puntaje += v;
        desglose.atajadas = redondear1(v);
    }

    // Valla invicta (exige que haya habido juego real o peligro rival para premiar al arquero)
    const huboActividad = (contexto.duracionJugadaSeg || 0) >= 15 || tirosRival > 0 || atajadas > 0;
    const vallaInvicta = golesContra === 0 && huboActividad;
    if (vallaInvicta) {
        const v = j.isGK ? P.vallaInvictaGK : P.vallaInvictaCampo;
        puntaje += v;
        desglose.vallaInvicta = redondear1(v);
    } else if (j.isGK && golesContra > 0) {
        const v = Math.max(P.maxCastigoGolesGK, golesContra * P.golRecibidoGK);
        puntaje += v;
        desglose.golesRecibidos = redondear1(v);
    }

    // Participación activa (conducción + intervenciones totales)
    const intervenciones =
        goles + asistencias + tiros + pasesCompletados + recuperaciones + barridasExitosas + atajadas;
    const part = Math.min(P.participacionMax, tiempoConPelota * 0.025 + intervenciones * 0.035);
    if (part > 0.04) {
        puntaje += part;
        desglose.participacion = redondear1(part);
    }

    if (perdidas > 0) {
        const v = Math.max(P.maxCastigoPerdidas, perdidas * P.perdida);
        puntaje += v;
        desglose.perdidas = redondear1(v);
    }

    if (golesFavor > golesContra) {
        puntaje += P.victoria;
        desglose.resultado = P.victoria;
    } else if (golesFavor < golesContra) {
        puntaje += P.derrota;
        desglose.resultado = P.derrota;
    }

    const rating = redondear1(clamp(puntaje, cfg.min, cfg.max));
    // Puntaje crudo sin redondear para desempatar con justicia
    const impactoDesempate =
        puntaje * 100 +
        atajadas * 8 +
        recuperaciones * 5 +
        barridasExitosas * 5 +
        asistencias * 7 +
        goles * 9 +
        pasesCompletados * 2 -
        perdidas * 2;

    return {
        id: j.id,
        nombre: j.nombre || j.id,
        team,
        equipoId: j.equipoId || '',
        isGK: !!j.isGK,
        rating,
        goles,
        asistencias,
        tiros,
        tirosAlArco,
        pases,
        pasesCompletados,
        recuperaciones,
        barridas,
        barridasExitosas,
        atajadas,
        perdidas,
        tiempoConPelota: redondear1(tiempoConPelota),
        participaciones: intervenciones,
        resumen: construirResumenJugador(j, { vallaInvicta }),
        desglose,
        _impacto: impactoDesempate,
    };
}

/**
 * Evalúa todos los jugadores del partido y elige la Figura del Partido (MVP).
 */
export function calcularValoraciones(jugadoresStats = [], contexto = {}, cfg = CONFIG_VALORACION) {
    const lista = jugadoresStats.map((j) => valorarJugador(j, contexto, cfg));
    let figura = null;
    for (const item of lista) {
        if (!figura || item.rating > figura.rating || (item.rating === figura.rating && item._impacto > figura._impacto)) {
            figura = item;
        }
    }
    const limpios = lista.map(({ _impacto, ...resto }) => ({
        ...resto,
        esFigura: !!(figura && figura.id === resto.id),
    }));
    const figuraOut = figura ? limpios.find((x) => x.id === figura.id) || null : null;
    return {
        jugadores: limpios,
        figura: figuraOut,
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.CONFIG_VALORACION = CONFIG_VALORACION;
    globalThis.valorarJugador = valorarJugador;
    globalThis.calcularValoraciones = calcularValoraciones;
}

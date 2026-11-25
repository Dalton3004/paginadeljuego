/**
 * ETAPA 18 — Sistema de Premios de Temporada y Ceremonia Final.
 *
 * Calcula a partir de estadísticas reales e historial verificable del fixture:
 *   1. CAMPEÓN
 *   2. BOTÍN DE ORO (máximo goleador)
 *   3. MEJOR ARQUERO (vallas invictas / menor promedio recibido / atajadas)
 *   4. MEJOR ASISTENTE (líder de pases gol)
 *   5. EQUIPO REVELACIÓN (mayor superación respecto a sus estrellas base)
 *   6. PARTIDO DEL AÑO (encuentro más vibrante y goleado del fixture)
 *   7. MEJOR RACHA (mayor seguidilla de victorias / invicto en el torneo)
 *   8. MEJOR JUGADOR (Balón Chaquito al mayor impacto integral de la temporada)
 */

import { plantelDeEquipo } from '../sim/planteles.js';

function asegurarMapaJugadores(liga) {
    if (!liga.estadisticasJugadores || typeof liga.estadisticasJugadores !== 'object') {
        liga.estadisticasJugadores = {};
    }
    return liga.estadisticasJugadores;
}

function obtenerOIniciarJugador(mapa, equipoId, slotKey, nombre, isGK = false) {
    const k = `${equipoId}::${slotKey}`;
    if (!mapa[k]) {
        mapa[k] = {
            key: k,
            equipoId,
            slot: slotKey,
            nombre,
            isGK: !!isGK,
            pj: 0,
            goles: 0,
            asistencias: 0,
            atajadas: 0,
            vallasInvictas: 0,
            golesRecibidos: 0,
        };
    }
    return mapa[k];
}

/**
 * Registra en la Liga las estadísticas individuales de un partido jugado (usando `MatchStats`)
 * o simulado entre clubes de IA (repartiendo goles/asistencias/atajadas entre su plantel real).
 */
export function registrarStatsPartidoEnLiga(
    liga,
    {
        equipoLocal,
        equipoRival,
        gl = 0,
        gv = 0,
        statsSerializados = null,
        azar = Math.random,
    } = {}
) {
    if (!liga || !equipoLocal || !equipoRival) return;
    const mapa = asegurarMapaJugadores(liga);

    const procesarEquipo = (eqId, lado, golesFavor, golesContra) => {
        const pl = plantelDeEquipo(eqId, lado);
        const c0 = obtenerOIniciarJugador(mapa, eqId, '0', pl.campo[0], false);
        const c1 = obtenerOIniciarJugador(mapa, eqId, '1', pl.campo[1], false);
        const c2 = obtenerOIniciarJugador(mapa, eqId, '2', pl.campo[2], false);
        const gk = obtenerOIniciarJugador(mapa, eqId, 'gk', pl.gk, true);
        const listaCampo = [c0, c1, c2];

        c0.pj += 1;
        c1.pj += 1;
        c2.pj += 1;
        gk.pj += 1;
        gk.golesRecibidos += Math.max(0, golesContra);
        if (golesContra === 0) gk.vallasInvictas += 1;

        // Si viene el resumen real de MatchStats del motor, usamos sus cifras exactas
        if (statsSerializados && Array.isArray(statsSerializados.jugadores)) {
            const reales = statsSerializados.jugadores.filter((j) => j.team === lado);
            if (reales.length > 0) {
                for (const jr of reales) {
                    if (jr.isGK) {
                        gk.atajadas += jr.atajadas || 0;
                        gk.asistencias += jr.asistencias || 0;
                        gk.goles += jr.goles || 0;
                    } else {
                        const m = /_(\d+)$/.exec(String(jr.id || ''));
                        const idx = m ? Math.min(2, Math.max(0, Number(m[1]))) : 0;
                        const dest = listaCampo[idx] || c0;
                        dest.goles += jr.goles || 0;
                        dest.asistencias += jr.asistencias || 0;
                    }
                }
                return;
            }
        }

        // Partido simulado de IA: distribución verosímil sobre el plantel real del equipo
        for (let g = 0; g < golesFavor; g++) {
            const rG = azar();
            const autorIdx = rG < 0.48 ? 0 : rG < 0.80 ? 1 : 2;
            listaCampo[autorIdx].goles += 1;

            if (azar() < 0.68) {
                const posiblesAsist = [0, 1, 2].filter((idx) => idx !== autorIdx);
                // El volante creativo (slot 1) tiene mayor peso asistidor
                const asistIdx = posiblesAsist.includes(1) && azar() < 0.62 ? 1 : posiblesAsist[0];
                listaCampo[asistIdx].asistencias += 1;
            }
        }
        gk.atajadas += Math.max(0, Math.round(1 + azar() * 3 + (golesContra === 0 ? 1 : 0)));
    };

    procesarEquipo(equipoLocal, 'local', gl, gv);
    procesarEquipo(equipoRival, 'rival', gv, gl);
}

function partidosDeFecha(fecha) {
    if (!fecha) return [];
    return Array.isArray(fecha) ? fecha : fecha.partidos || [];
}

function partidoJugado(m) {
    return !!m && !m.libre && m.gl != null && m.gv != null;
}

/**
 * Reconstruye estadísticas base desde el fixture si una liga guardada antigua no tenía `estadisticasJugadores`.
 */
function asegurarCoberturaFixture(liga, tablaFinal) {
    const mapa = asegurarMapaJugadores(liga);
    const totalPJTabla = tablaFinal.reduce((acc, r) => acc + (r.pj || 0), 0);
    const totalGKRegistrados = Object.values(mapa)
        .filter((j) => j.isGK)
        .reduce((acc, j) => acc + (j.pj || 0), 0);

    if (totalGKRegistrados >= totalPJTabla && totalPJTabla > 0) return mapa;

    // Semilla determinista suave sobre partidos no contabilizados solo cuando falta cobertura previa
    if (Object.keys(mapa).length === 0) {
        let seed = 17;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return (seed - 1) / 2147483646;
        };
        for (const f of liga.fixture || []) {
            for (const m of partidosDeFecha(f)) {
                if (!partidoJugado(m)) continue;
                registrarStatsPartidoEnLiga(liga, {
                    equipoLocal: m.l,
                    equipoRival: m.v,
                    gl: m.gl,
                    gv: m.gv,
                    azar: rnd,
                });
            }
        }
    }
    return mapa;
}

function calcularMejorRachaTorneo(liga) {
    const corridasVic = {};
    const corridasInv = {};
    let mejorVic = { equipoId: liga.miEquipo, cantidad: 0, tipo: 'victorias' };
    let mejorInv = { equipoId: liga.miEquipo, cantidad: 0, tipo: 'invicto' };

    for (const id of liga.equipos || []) {
        corridasVic[id] = 0;
        corridasInv[id] = 0;
    }

    for (const f of liga.fixture || []) {
        for (const m of partidosDeFecha(f)) {
            if (!partidoJugado(m)) continue;
            const actualizar = (eq, gf, gc) => {
                if (gf > gc) {
                    corridasVic[eq] = (corridasVic[eq] || 0) + 1;
                    corridasInv[eq] = (corridasInv[eq] || 0) + 1;
                } else if (gf === gc) {
                    corridasVic[eq] = 0;
                    corridasInv[eq] = (corridasInv[eq] || 0) + 1;
                } else {
                    corridasVic[eq] = 0;
                    corridasInv[eq] = 0;
                }
                if (corridasVic[eq] > mejorVic.cantidad) {
                    mejorVic = { equipoId: eq, cantidad: corridasVic[eq], tipo: 'victorias' };
                }
                if (corridasInv[eq] > mejorInv.cantidad) {
                    mejorInv = { equipoId: eq, cantidad: corridasInv[eq], tipo: 'invicto' };
                }
            };
            actualizar(m.l, m.gl, m.gv);
            actualizar(m.v, m.gv, m.gl);
        }
    }

    if (mejorVic.cantidad >= 2) {
        return {
            equipoId: mejorVic.equipoId,
            cantidad: mejorVic.cantidad,
            tipo: 'victorias',
            detalle: `${mejorVic.cantidad} victorias consecutivas`,
        };
    }
    return {
        equipoId: mejorInv.equipoId,
        cantidad: Math.max(1, mejorInv.cantidad),
        tipo: 'invicto',
        detalle: `${Math.max(1, mejorInv.cantidad)} partidos invicto`,
    };
}

function elegirPartidoDelAno(liga) {
    let mejor = null;
    let mejorPuntaje = -1;

    (liga.fixture || []).forEach((f, idxFecha) => {
        for (const m of partidosDeFecha(f)) {
            if (!partidoJugado(m)) continue;
            const totalGoles = m.gl + m.gv;
            const dif = Math.abs(m.gl - m.gv);
            const participaUsuario = m.l === liga.miEquipo || m.v === liga.miEquipo;
            // Prioriza partidos con muchos goles y marcador emocionante (p.ej. 4-3, 3-3, 3-2)
            let score = totalGoles * 3.2;
            if (totalGoles >= 4 && dif === 1) score += 4.5;
            else if (totalGoles >= 4 && dif === 0) score += 3.5;
            if (participaUsuario) score += 0.6;

            if (score > mejorPuntaje) {
                mejorPuntaje = score;
                mejor = {
                    fecha: idxFecha + 1,
                    localId: m.l,
                    rivalId: m.v,
                    gl: m.gl,
                    gv: m.gv,
                    totalGoles,
                    etiqueta:
                        dif === 0 && totalGoles >= 4
                            ? 'Partidazo vibrante de ida y vuelta'
                            : dif === 1 && totalGoles >= 3
                            ? 'Duelo electrizante definido al límite'
                            : 'Festival de goles de la temporada',
                };
            }
        }
    });

    return (
        mejor || {
            fecha: 1,
            localId: liga.equipos[0],
            rivalId: liga.equipos[1] || liga.equipos[0],
            gl: 1,
            gv: 0,
            totalGoles: 1,
            etiqueta: 'Duelo inaugural',
        }
    );
}

/**
 * Calcula los 8 premios oficiales al cierre de una Liga Chaquito F8.
 */
export function calcularPremiosTemporada(liga, tablaFinal) {
    if (!liga || !Array.isArray(tablaFinal) || tablaFinal.length === 0) return null;

    const mapa = asegurarCoberturaFixture(liga, tablaFinal);
    const jugadores = Object.values(mapa);
    const campo = jugadores.filter((j) => !j.isGK);
    const arqueros = jugadores.filter((j) => j.isGK);

    const posPorEquipo = {};
    tablaFinal.forEach((fila, idx) => {
        posPorEquipo[fila.id] = idx + 1;
    });

    // 1) CAMPEÓN
    const filaCamp = tablaFinal[0];
    const campeon = {
        equipoId: filaCamp.id,
        puntos: filaCamp.pts,
        pj: filaCamp.pj,
        gf: filaCamp.gf,
        gc: filaCamp.gc,
        dg: filaCamp.dg,
    };

    // 2) BOTÍN DE ORO
    const ordenGoleadores = campo
        .slice()
        .sort(
            (a, b) =>
                b.goles - a.goles ||
                b.asistencias - a.asistencias ||
                (posPorEquipo[a.equipoId] || 99) - (posPorEquipo[b.equipoId] || 99)
        );
    const topGol = ordenGoleadores[0] || { nombre: 'Goleador', equipoId: campeon.equipoId, goles: 0, pj: 0 };
    const botinDeOro = {
        nombre: topGol.nombre,
        equipoId: topGol.equipoId,
        goles: topGol.goles,
        asistencias: topGol.asistencias,
        pj: topGol.pj,
    };

    // 3) MEJOR ARQUERO
    const ordenArqueros = arqueros
        .slice()
        .sort((a, b) => {
            const scoreA = a.vallasInvictas * 4 + a.atajadas * 0.45 - a.golesRecibidos * 0.8;
            const scoreB = b.vallasInvictas * 4 + b.atajadas * 0.45 - b.golesRecibidos * 0.8;
            return (
                scoreB - scoreA ||
                b.vallasInvictas - a.vallasInvictas ||
                a.golesRecibidos - b.golesRecibidos
            );
        });
    const topGK = ordenArqueros[0] || {
        nombre: 'Arquero',
        equipoId: campeon.equipoId,
        vallasInvictas: 0,
        golesRecibidos: 0,
        atajadas: 0,
        pj: 0,
    };
    const mejorArquero = {
        nombre: topGK.nombre,
        equipoId: topGK.equipoId,
        vallasInvictas: topGK.vallasInvictas,
        golesRecibidos: topGK.golesRecibidos,
        atajadas: topGK.atajadas,
        pj: topGK.pj,
    };

    // 4) MEJOR ASISTENTE
    const ordenAsist = campo
        .slice()
        .sort(
            (a, b) =>
                b.asistencias - a.asistencias ||
                b.goles - a.goles ||
                (posPorEquipo[a.equipoId] || 99) - (posPorEquipo[b.equipoId] || 99)
        );
    const topAsist = ordenAsist[0] || { nombre: 'Armador', equipoId: campeon.equipoId, asistencias: 0, goles: 0, pj: 0 };
    const mejorAsistente = {
        nombre: topAsist.nombre,
        equipoId: topAsist.equipoId,
        asistencias: topAsist.asistencias,
        goles: topAsist.goles,
        pj: topAsist.pj,
    };

    // 5) EQUIPO REVELACIÓN (compara puesto esperado según estrellas vs puesto real obtenido)
    const esperadoOrden = (liga.equipos || [])
        .slice()
        .sort((a, b) => ((liga.estrellas && liga.estrellas[b]) || 3) - ((liga.estrellas && liga.estrellas[a]) || 3));
    const posEsperada = {};
    esperadoOrden.forEach((id, i) => {
        posEsperada[id] = i + 1;
    });

    let revelacionFila = tablaFinal[Math.min(1, tablaFinal.length - 1)];
    let mejorSalto = -999;
    for (const fila of tablaFinal) {
        const est = (liga.estrellas && liga.estrellas[fila.id]) || 3;
        const salto = (posEsperada[fila.id] || 6) - (posPorEquipo[fila.id] || 6) + (est <= 3 ? 2.5 : est === 4 ? 1 : -1.5);
        if (salto > mejorSalto) {
            mejorSalto = salto;
            revelacionFila = fila;
        }
    }
    const equipoRevelacion = {
        equipoId: revelacionFila.id,
        posicionFinal: posPorEquipo[revelacionFila.id] || 1,
        puntos: revelacionFila.pts,
        estrellas: (liga.estrellas && liga.estrellas[revelacionFila.id]) || 3,
    };

    // 6) PARTIDO DEL AÑO
    const partidoDelAno = elegirPartidoDelAno(liga);

    // 7) MEJOR RACHA
    const mejorRacha = calcularMejorRachaTorneo(liga);

    // 8) MEJOR JUGADOR (BALÓN CHAQUITO)
    let mvp = null;
    let mvpScore = -999;
    for (const j of jugadores) {
        const posClub = posPorEquipo[j.equipoId] || 10;
        const bonoTabla = Math.max(0, (tablaFinal.length - posClub) * 0.55) + (posClub === 1 ? 2.8 : 0);
        const impacto = j.isGK
            ? j.vallasInvictas * 2.6 + j.atajadas * 0.35 - j.golesRecibidos * 0.35 + bonoTabla
            : j.goles * 2.4 + j.asistencias * 1.7 + bonoTabla;
        if (impacto > mvpScore) {
            mvpScore = impacto;
            mvp = j;
        }
    }
    const mejorJugador = mvp
        ? {
              nombre: mvp.nombre,
              equipoId: mvp.equipoId,
              isGK: mvp.isGK,
              goles: mvp.goles,
              asistencias: mvp.asistencias,
              vallasInvictas: mvp.vallasInvictas,
              atajadas: mvp.atajadas,
              resumen: mvp.isGK
                  ? `${mvp.vallasInvictas} vallas invictas y ${mvp.atajadas} atajadas`
                  : `${mvp.goles} goles y ${mvp.asistencias} asistencias`,
          }
        : {
              nombre: botinDeOro.nombre,
              equipoId: botinDeOro.equipoId,
              isGK: false,
              goles: botinDeOro.goles,
              asistencias: botinDeOro.asistencias,
              vallasInvictas: 0,
              atajadas: 0,
              resumen: `${botinDeOro.goles} goles en el torneo`,
          };

    return {
        ligaId: liga.id,
        miEquipo: liga.miEquipo,
        fecha: Date.now(),
        campeon,
        botinDeOro,
        mejorArquero,
        mejorAsistente,
        equipoRevelacion,
        partidoDelAno,
        mejorRacha,
        mejorJugador,
    };
}

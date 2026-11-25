/**
 * ETAPAS 30 Y 31 — HISTORIAL PERMANENTE, PALMARÉS VISUAL Y RÉCORDS REALES.
 *
 * REGLA ESTRICTA:
 * - Jamás inventa cifras ni usa datos falsos de relleno.
 * - El historial de temporadas, copas, supercopas y premios es permanente:
 *   comenzar una nueva temporada NUNCA borra campañas anteriores.
 */

export function construirHistorialYPalmares({
    carrera = null,
    copaHistorial = [],
    supercopaHistorial = [],
    historiaEstado = null,
    equiposCatalogo = [],
} = {}) {
    const st = carrera || {};
    const pal = st.palmares || { ligas: 0, copas: 0, supercopas: 0, historialTitulos: [] };
    const temporadasRaw = Array.isArray(st.historialTemporadas) ? st.historialTemporadas : [];
    const premiosRaw = Array.isArray(st.premiosHistorial) ? st.premiosHistorial : [];

    const nombreClub = (id) => {
        const eq = (equiposCatalogo || []).find((e) => e && e.id === id);
        return eq ? eq.nombre : id ? String(id).replace(/_/g, ' ').toUpperCase() : '—';
    };

    // Enriquecer cada temporada guardada con su registro de premios si coincide ligaId
    const temporadas = temporadasRaw.map((t, idx) => {
        const pr = premiosRaw.find((p) => p && t && p.ligaId && p.ligaId === t.ligaId) || null;
        return {
            numero: temporadasRaw.length - idx,
            ligaId: t.ligaId || `temp_${idx}`,
            miEquipoId: t.miEquipo || '',
            miEquipoNombre: nombreClub(t.miEquipo),
            posicionFinal: Number(t.posicionFinal) || 0,
            puntos: t.puntos != null ? Number(t.puntos) : pr && pr.campeon && pr.campeon.equipoId === t.miEquipo ? pr.campeon.puntos : null,
            gf: t.gf != null ? Number(t.gf) : null,
            gc: t.gc != null ? Number(t.gc) : null,
            campeonId: t.campeonId || (pr && pr.campeon && pr.campeon.equipoId) || '',
            campeonNombre: nombreClub(t.campeonId || (pr && pr.campeon && pr.campeon.equipoId)),
            salioCampeon: Number(t.posicionFinal) === 1 || (t.miEquipo && t.campeonId === t.miEquipo),
            mejorJugador: t.mejorJugador || (pr && pr.mejorJugador && pr.mejorJugador.nombre) || null,
            botinDeOro: t.botinDeOro || (pr && pr.botinDeOro && `${pr.botinDeOro.nombre} (${pr.botinDeOro.goles})`) || null,
            objetivosCumplidos: `${t.cumplidos || 0}/${t.total || 0}`,
            fecha: t.fecha || 0,
        };
    });

    const mejoresJugadores = [];
    for (const pr of premiosRaw) {
        if (!pr) continue;
        if (pr.mejorJugador && pr.mejorJugador.nombre) {
            mejoresJugadores.push({
                distincion: '⭐ Mejor Jugador de Temporada',
                nombre: pr.mejorJugador.nombre,
                club: nombreClub(pr.mejorJugador.equipoId),
                detalle: pr.mejorJugador.resumen || '',
            });
        }
        if (pr.botinDeOro && pr.botinDeOro.nombre) {
            mejoresJugadores.push({
                distincion: '👟 Botín de Oro',
                nombre: pr.botinDeOro.nombre,
                club: nombreClub(pr.botinDeOro.equipoId),
                detalle: `${pr.botinDeOro.goles} goles`,
            });
        }
        if (pr.mejorArquero && pr.mejorArquero.nombre) {
            mejoresJugadores.push({
                distincion: '🧤 Mejor Arquero',
                nombre: pr.mejorArquero.nombre,
                club: nombreClub(pr.mejorArquero.equipoId),
                detalle: `${pr.mejorArquero.vallasInvictas} vallas invictas`,
            });
        }
    }

    const ligasGanadas = Math.max(
        Number(pal.ligas) || 0,
        temporadas.filter((t) => t.salioCampeon).length
    );
    const copasGanadas = Number(pal.copas) || 0;
    const supercopasGanadas = Number(pal.supercopas) || 0;
    const historiaGanada = historiaEstado && historiaEstado.campanaCompletada ? 1 : 0;

    return {
        vitrinaVisual: [
            { id: 'liga', icono: '🏆', titulo: 'LIGAS CHAQUITO', cantidad: ligasGanadas },
            { id: 'copa', icono: '🥇', titulo: 'COPAS CHAQUITO', cantidad: copasGanadas },
            { id: 'supercopa', icono: '⭐', titulo: 'SUPERCOPAS', cantidad: supercopasGanadas },
            { id: 'historia', icono: '👑', titulo: 'CAMPAÑA HISTORIA', cantidad: historiaGanada },
        ],
        totalTitulosOficiales: ligasGanadas + copasGanadas + supercopasGanadas,
        temporadas,
        copas: (copaHistorial || []).slice(0, 20).map((c) => ({
            campeonId: c.campeon,
            campeonNombre: nombreClub(c.campeon),
            subcampeonNombre: nombreClub(c.subcampeon),
            marcadorFinal: c.marcadorFinal || '',
            formato: c.formato || 'unico',
            fecha: c.fecha || 0,
        })),
        supercopas: (supercopaHistorial || []).slice(0, 20).map((s) => ({
            campeonId: s.campeon,
            campeonNombre: nombreClub(s.campeon),
            subcampeonNombre: nombreClub(s.subcampeon),
            marcador: `${s.gl}-${s.gv}${s.penales ? ` (${s.penales.pa}-${s.penales.pb}p)` : ''}`,
            fecha: s.fecha || 0,
        })),
        mejoresJugadores: mejoresJugadores.slice(0, 18),
        historialTitulos: (pal.historialTitulos || []).slice(0, 30),
    };
}

/**
 * ETAPA 31 — Calcula los 8 récords históricos usando ÚNICAMENTE datos reales registrados.
 */
export function calcularRecordsReales({
    carrera = null,
    historialPartidos = [],
    equiposCatalogo = [],
} = {}) {
    const st = carrera || {};
    const nombreClub = (id) => {
        const eq = (equiposCatalogo || []).find((e) => e && e.id === id);
        return eq ? eq.corto || eq.nombre : id ? String(id).replace(/_/g, ' ').toUpperCase() : 'Rival';
    };

    // 1) Mayor goleada (entre estadisticasClub, recordsGlobales e historialPartidos)
    let mejorGoleada = null;
    for (const [clubId, cs] of Object.entries(st.estadisticasClub || {})) {
        if (cs && cs.mayorGoleada && cs.mayorGoleada.diff >= 1) {
            const g = cs.mayorGoleada;
            if (!mejorGoleada || g.diff > mejorGoleada.diff || (g.diff === mejorGoleada.diff && g.gf > mejorGoleada.gf)) {
                mejorGoleada = { gf: g.gf, gc: g.gc, diff: g.diff, clubId, rivalId: g.rivalId || '' };
            }
        }
    }
    for (const m of historialPartidos || []) {
        if (!m || m.resultado !== 'win') continue;
        const diff = (Number(m.gf) || 0) - (Number(m.gc) || 0);
        if (diff >= 1 && (!mejorGoleada || diff > mejorGoleada.diff || (diff === mejorGoleada.diff && m.gf > mejorGoleada.gf))) {
            mejorGoleada = { gf: m.gf, gc: m.gc, diff, clubId: m.equipoLocal || '', rivalId: m.equipoRival || '' };
        }
    }

    // 2) Mayor remontada
    let mejorRemontada = null;
    for (const [clubId, cs] of Object.entries(st.estadisticasClub || {})) {
        if (cs && cs.mayorRemontada) {
            const r = cs.mayorRemontada;
            if (!mejorRemontada || (r.desventaja || 1) >= (mejorRemontada.desventaja || 1)) {
                mejorRemontada = {
                    gf: r.gf,
                    gc: r.gc,
                    desventaja: r.desventaja || 1,
                    clubId,
                    rivalId: r.rivalId || '',
                };
            }
        }
    }

    // 3) Máximo goleador histórico (desde goleadores acumulados reales + premios Botín de Oro)
    const mapaGoleadores = new Map();
    const tablaGolPersistida = (st.recordsGlobales && st.recordsGlobales.goleadores) || {};
    for (const [clave, info] of Object.entries(tablaGolPersistida)) {
        if (info && info.goles > 0) {
            mapaGoleadores.set(clave, {
                nombre: info.nombre || clave,
                equipoId: info.equipoId || '',
                goles: Number(info.goles) || 0,
            });
        }
    }
    if (mapaGoleadores.size === 0) {
        for (const pr of st.premiosHistorial || []) {
            if (pr && pr.botinDeOro && pr.botinDeOro.goles > 0) {
                const k = `${pr.botinDeOro.equipoId}:${pr.botinDeOro.nombre}`;
                const prev = mapaGoleadores.get(k) || {
                    nombre: pr.botinDeOro.nombre,
                    equipoId: pr.botinDeOro.equipoId,
                    goles: 0,
                };
                prev.goles += Number(pr.botinDeOro.goles) || 0;
                mapaGoleadores.set(k, prev);
            }
        }
    }
    let maxGoleador = null;
    for (const item of mapaGoleadores.values()) {
        if (!maxGoleador || item.goles > maxGoleador.goles) maxGoleador = item;
    }

    // 4) Más victorias consecutivas y 7) Mejor racha invicta
    const rachas = st.rachas || {};
    const masVictorias = Math.max(
        Number(rachas.mejorVictorias) || 0,
        Number(rachas.mejorRachaVictorias) || 0,
        Number(rachas.victoriasConsecutivas) || 0
    );
    const mejorInvicto = Math.max(
        Number(rachas.mejorInvicto) || 0,
        Number(rachas.partidosInvicto) || 0
    );

    // 5) Mayor cantidad de títulos
    const pal = st.palmares || {};
    const totalTitulos = (Number(pal.ligas) || 0) + (Number(pal.copas) || 0) + (Number(pal.supercopas) || 0);

    // 6) Gol más tardío registrado en un partido real
    const golTardio = (st.recordsGlobales && st.recordsGlobales.golMasTardio) || null;

    // 8) Partido con más goles totales (gf + gc)
    let partidoMasGoles = (st.recordsGlobales && st.recordsGlobales.partidoConMasGoles) || null;
    for (const m of historialPartidos || []) {
        if (!m) continue;
        const tot = (Number(m.gf) || 0) + (Number(m.gc) || 0);
        if (tot > 0 && (!partidoMasGoles || tot > partidoMasGoles.total)) {
            partidoMasGoles = {
                total: tot,
                gf: Number(m.gf) || 0,
                gc: Number(m.gc) || 0,
                clubId: m.equipoLocal || '',
                rivalId: m.equipoRival || '',
            };
        }
    }

    return [
        {
            id: 'mayor_goleada',
            icono: '💥',
            titulo: 'Mayor goleada',
            registrado: !!mejorGoleada,
            valorTexto: mejorGoleada
                ? `${mejorGoleada.gf}-${mejorGoleada.gc} (+${mejorGoleada.diff}) · ${nombreClub(mejorGoleada.clubId)} vs ${nombreClub(mejorGoleada.rivalId)}`
                : 'Sin registrar aún',
        },
        {
            id: 'mayor_remontada',
            icono: '🔥',
            titulo: 'Mayor remontada',
            registrado: !!mejorRemontada,
            valorTexto: mejorRemontada
                ? `${mejorRemontada.gf}-${mejorRemontada.gc} (levantó -${mejorRemontada.desventaja}) vs ${nombreClub(mejorRemontada.rivalId)}`
                : 'Sin registrar aún',
        },
        {
            id: 'maximo_goleador',
            icono: '👟',
            titulo: 'Máximo goleador',
            registrado: !!(maxGoleador && maxGoleador.goles > 0),
            valorTexto:
                maxGoleador && maxGoleador.goles > 0
                    ? `${maxGoleador.nombre} (${nombreClub(maxGoleador.equipoId)}) · ${maxGoleador.goles} goles`
                    : 'Sin registrar aún',
        },
        {
            id: 'mas_victorias_consecutivas',
            icono: '⚡',
            titulo: 'Más victorias consecutivas',
            registrado: masVictorias > 0,
            valorTexto: masVictorias > 0 ? `${masVictorias} victorias seguidas` : 'Sin registrar aún',
        },
        {
            id: 'mayor_cantidad_titulos',
            icono: '🏆',
            titulo: 'Mayor cantidad de títulos',
            registrado: totalTitulos > 0,
            valorTexto:
                totalTitulos > 0
                    ? `${totalTitulos} (${pal.ligas || 0} Liga · ${pal.copas || 0} Copa · ${pal.supercopas || 0} Supercopa)`
                    : '0 títulos oficiales aún',
        },
        {
            id: 'gol_mas_tardio',
            icono: '⏱',
            titulo: 'Gol más tardío',
            registrado: !!golTardio,
            valorTexto: golTardio
                ? `${golTardio.minuto}' · ${golTardio.nombre} vs ${nombreClub(golTardio.rivalId)}`
                : 'Sin registrar aún',
        },
        {
            id: 'mejor_racha_invicta',
            icono: '🛡',
            titulo: 'Mejor racha invicta',
            registrado: mejorInvicto > 0,
            valorTexto: mejorInvicto > 0 ? `${mejorInvicto} partidos sin perder` : 'Sin registrar aún',
        },
        {
            id: 'partido_con_mas_goles',
            icono: '🥅',
            titulo: 'Partido con más goles',
            registrado: !!(partidoMasGoles && partidoMasGoles.total > 0),
            valorTexto:
                partidoMasGoles && partidoMasGoles.total > 0
                    ? `${partidoMasGoles.total} goles (${partidoMasGoles.gf}-${partidoMasGoles.gc} vs ${nombreClub(partidoMasGoles.rivalId)})`
                    : 'Sin registrar aún',
        },
    ];
}

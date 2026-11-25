/**
 * ETAPA 17 — Lógica agregadora de la sección `MI CLUB`.
 *
 * Centraliza a partir de datos reales persistidos:
 *   equipo · plantel · perfil · estadísticas históricas · temporadas ·
 *   palmarés · trofeos · récords · rivalidades · reputación · objetivos · premios.
 */

import { plantelDeEquipo } from '../sim/planteles.js';
import { obtenerKitAlternativo } from '../assets/kits_alternativos.js';
import { rivalidadesDeEquipo } from './rivalidades.js';
import { TITULOS_REPUTACION } from './reputacion.js';
import { plantelConAtributos } from './atributos.js';
import { describirFormaEquipo } from './forma.js';
import { evaluarCelebracionesDesbloqueadas } from './celebraciones.js';

export function construirFichaMiClub(
    equipoId,
    {
        equiposCatalogo = [],
        carrera = null,
        ligaActual = null,
        copaHistorial = [],
        supercopaHistorial = [],
        historialPartidos = [],
        desafiosCompletados = 0,
        historiaCompletada = false,
    } = {}
) {
    const eq =
        (equiposCatalogo || []).find((e) => e.id === equipoId) ||
        (equiposCatalogo && equiposCatalogo[0]) || {
            id: equipoId || 'retoneta',
            nombre: String(equipoId || 'LA RETONETA').toUpperCase(),
            corto: String(equipoId || 'RETONETA').toUpperCase(),
            siglas: 'FC',
            colores: ['#111111', '#2457c9'],
            estrellas: 4,
        };

    const id = eq.id;
    const plantel = plantelDeEquipo(id, 'local');
    const kitAlt = obtenerKitAlternativo(id);
    const stCarrera = carrera || {};
    const pal = stCarrera.palmares || { ligas: 0, copas: 0, supercopas: 0, historialTitulos: [] };
    const clubStatsMap = stCarrera.estadisticasClub || {};
    const rawClub = clubStatsMap[id] || {
        pj: 0,
        g: 0,
        e: 0,
        p: 0,
        gf: 0,
        gc: 0,
        finalesJugadas: 0,
        finalesGanadas: 0,
        vallasInvictas: 0,
        mayorGoleada: null,
        mayorRemontada: null,
    };

    // Respaldo con HistorialLocalStore para partidos previos si existen
    const histDelClub = (historialPartidos || []).filter((m) => m && m.equipoLocal === id);
    let pj = rawClub.pj || 0;
    let ganados = rawClub.g || 0;
    let empatados = rawClub.e || 0;
    let perdidos = rawClub.p || 0;
    let golesHistoricos = rawClub.gf || 0;
    let golesRecibidos = rawClub.gc || 0;
    let vallasInvictas = rawClub.vallasInvictas || 0;

    if (histDelClub.length > pj) {
        pj = histDelClub.length;
        ganados = histDelClub.filter((m) => m.resultado === 'win').length;
        empatados = histDelClub.filter((m) => m.resultado === 'draw').length;
        perdidos = histDelClub.filter((m) => m.resultado === 'loss').length;
        golesHistoricos = histDelClub.reduce((a, m) => a + (m.gf || 0), 0);
        golesRecibidos = histDelClub.reduce((a, m) => a + (m.gc || 0), 0);
        vallasInvictas = histDelClub.filter((m) => (m.gc || 0) === 0).length;
    }

    // Títulos específicos conquistados por este club en el historial
    const titulosHist = Array.isArray(pal.historialTitulos) ? pal.historialTitulos : [];
    const ligasClub = titulosHist.filter((t) => t.tipo === 'liga' && t.campeonId === id).length;
    const copasClub = Math.max(
        titulosHist.filter((t) => t.tipo === 'copa' && t.campeonId === id).length,
        (copaHistorial || []).filter((c) => c && c.campeon === id).length
    );
    const supercopasClub = Math.max(
        titulosHist.filter((t) => t.tipo === 'supercopa' && t.campeonId === id).length,
        (supercopaHistorial || []).filter((s) => s && s.campeon === id).length
    );
    const finalesSub =
        titulosHist.filter((t) => (t.tipo === 'copa' || t.tipo === 'supercopa') && t.subcampeonId === id).length;
    const finalesTotales = Math.max(rawClub.finalesJugadas || 0, copasClub + supercopasClub + finalesSub);

    const temporadas = (stCarrera.historialTemporadas || []).filter((t) => t && t.miEquipo === id);
    const premiosClub = [];
    for (const pr of stCarrera.premiosHistorial || []) {
        if (!pr) continue;
        if (pr.campeon && pr.campeon.equipoId === id) {
            premiosClub.push({ premio: '🏆 Campeón de Liga', ganador: eq.nombre, detalle: `${pr.campeon.puntos} pts` });
        }
        if (pr.mejorJugador && pr.mejorJugador.equipoId === id) {
            premiosClub.push({ premio: '⭐ Mejor Jugador', ganador: pr.mejorJugador.nombre, detalle: pr.mejorJugador.resumen });
        }
        if (pr.botinDeOro && pr.botinDeOro.equipoId === id) {
            premiosClub.push({ premio: '👟 Botín de Oro', ganador: pr.botinDeOro.nombre, detalle: `${pr.botinDeOro.goles} goles` });
        }
        if (pr.mejorArquero && pr.mejorArquero.equipoId === id) {
            premiosClub.push({ premio: '🧤 Mejor Arquero', ganador: pr.mejorArquero.nombre, detalle: `${pr.mejorArquero.vallasInvictas} vallas invictas` });
        }
        if (pr.mejorAsistente && pr.mejorAsistente.equipoId === id) {
            premiosClub.push({ premio: '🎯 Mejor Asistente', ganador: pr.mejorAsistente.nombre, detalle: `${pr.mejorAsistente.asistencias} asistencias` });
        }
        if (pr.equipoRevelacion && pr.equipoRevelacion.equipoId === id) {
            premiosClub.push({ premio: '🚀 Equipo Revelación', ganador: eq.nombre, detalle: `${pr.equipoRevelacion.posicionFinal}° puesto` });
        }
    }

    const rep = stCarrera.reputacion || { popularidad: 50, respeto: 50, hinchada: 52, general: 51, rango: 'ANIMADOR BARRIAL', titulosDesbloqueados: [] };
    const rachas = stCarrera.rachas || { mejorVictorias: 0, mejorInvicto: 0, mejorMarcando: 0, mejorVallasInvictas: 0 };
    const rivalidades = rivalidadesDeEquipo(stCarrera.rivalidades, id);
    const objetivosActivos = ligaActual && ligaActual.miEquipo === id ? ligaActual.objetivos || null : null;
    const plantelDetallado = plantelConAtributos(id, { catalogo: equiposCatalogo });
    const forma = describirFormaEquipo(stCarrera.formaClubes && stCarrera.formaClubes[id]);
    const celebraciones = evaluarCelebracionesDesbloqueadas({
        carrera: stCarrera,
        desafiosCompletados,
        historiaCompletada,
    });

    return {
        equipo: eq,
        plantel,
        plantelDetallado,
        forma,
        celebraciones,
        celebracionEquipada: stCarrera.celebracionEquipada || 'normal',
        kitAlternativo: kitAlt,
        vitrina: {
            ligas: ligasClub,
            copas: copasClub,
            supercopas: supercopasClub,
            totalTrofeos: ligasClub + copasClub + supercopasClub,
            finales: finalesTotales,
            premiosIndividuales: premiosClub.length,
        },
        estadisticas: {
            pj,
            ganados,
            empatados,
            perdidos,
            efectividad: pj > 0 ? Math.round((ganados / pj) * 100) : 0,
            golesHistoricos,
            golesRecibidos,
            vallasInvictas,
        },
        records: {
            mayorGoleada: rawClub.mayorGoleada || null,
            mayorRemontada: rawClub.mayorRemontada || null,
            mejorRachaVictorias: rachas.mejorVictorias || 0,
            mejorRachaInvicto: rachas.mejorInvicto || 0,
            mejorRachaGoles: rachas.mejorMarcando || 0,
        },
        reputacion: {
            ...rep,
            titulosDetalle: TITULOS_REPUTACION.map((t) => ({
                ...t,
                desbloqueado: (rep.titulosDesbloqueados || []).includes(t.id),
            })),
        },
        objetivosActivos,
        rivalidades,
        temporadas,
        premiosDestacados: premiosClub.slice(0, 12),
        partidosRecientes: histDelClub.slice(0, 10),
    };
}

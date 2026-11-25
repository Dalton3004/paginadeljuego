/**
 * ETAPA 26 — PRESENTACIÓN PRE-PARTIDO RICA.
 *
 * Construye los datos reales para la placa previa de Liga, Copa, Clásicos, Finales,
 * Supercopa, Historia, Desafíos y Amistosos:
 *   - escudos y nombres
 *   - posición en tabla (si aplica)
 *   - racha y estado físico (Etapa 23)
 *   - rivalidad y etiqueta de clásico
 *   - últimos enfrentamientos (historial real)
 *   - clima de estadio
 *   - competición e importancia del partido
 *
 * REGLA DE RITMO:
 * - Partidos comunes -> modo 'breve' (~2.5s, limpio y directo).
 * - Finales, Supercopa, Clásicos o fechas decisivas -> modo 'completa' (~4.2s, placa televisiva completa).
 */

import { describirFormaEquipo } from './forma.js';

export function construirDatosPrePartido({
    enLinea = false,
    equipoLocal = null,
    equipoRival = null,
    modoLiga = null,
    tablaLiga = null,
    modoCopa = null,
    modoSupercopa = null,
    modoDesafio = null,
    modoArcade = null,
    modoHistoria = null,
    eventoEspecial = null,
    rivalidadInfo = null,
    rachasUsuario = null,
    formaLocal = null,
    climaCfg = null,
    historialPartidos = [],
} = {}) {
    const idL = (equipoLocal && equipoLocal.id) || '';
    const idR = (equipoRival && equipoRival.id) || '';
    const nomL = (equipoLocal && (equipoLocal.corto || equipoLocal.nombre)) || 'LOCAL';
    const nomR = (equipoRival && (equipoRival.corto || equipoRival.nombre)) || 'RIVAL';

    // 1) Competición e importancia
    let competicion = enLinea ? 'PARTIDO EN LÍNEA 1 VS 1' : 'AMISTOSO CHAQUITO';
    let subtitulo = '';
    let importancia = 'PARTIDO COMÚN';
    let esFinal = false;
    let esCompleta = false;

    if (!enLinea) {
        if (modoHistoria) {
            competicion = `📖 HISTORIA · CAP. ${modoHistoria.orden || 1}`;
            subtitulo = modoHistoria.titulo || '';
            importancia = modoHistoria.esFinal ? 'GRAN FINAL DE CAMPAÑA' : 'CAPÍTULO OFICIAL';
            esFinal = !!modoHistoria.esFinal;
            esCompleta = true;
        } else if (modoDesafio) {
            competicion = `🎯 DESAFÍO · ${modoDesafio.nombre || ''}`;
            subtitulo = modoDesafio.objetivo || '';
            importancia = 'PRUEBA ESPECIAL';
            esCompleta = false;
        } else if (modoArcade) {
            competicion = '🕹 CHAQUITO ARCADE';
            subtitulo = modoArcade.etiquetaReglas || 'REGLAS ESPECIALES';
            importancia = 'FIESTA ARCADE (NO OFICIAL)';
            esCompleta = false;
        } else if (modoSupercopa) {
            competicion = '⭐ SUPERCOPA CHAQUITO ⭐';
            subtitulo = 'CAMPEÓN DE LIGA VS CAMPEÓN DE COPA';
            importancia = 'FINAL ÚNICA POR TÍTULO OFICIAL';
            esFinal = true;
            esCompleta = true;
        } else if (modoCopa) {
            competicion = '🏆 COPA CHAQUITO';
            subtitulo = modoCopa.rondaNombre || 'ELIMINACIÓN DIRECTA';
            esFinal = !!modoCopa.esFinal;
            importancia = esFinal ? 'GRAN FINAL DE COPA' : 'ELIMINACIÓN DIRECTA';
            esCompleta = esFinal || !!(rivalidadInfo && rivalidadInfo.esClasico);
        } else if (modoLiga) {
            competicion = 'LIGA CHAQUITO F8';
            subtitulo = `FECHA ${(modoLiga.fecha || 0) + 1}`;
            const esp = eventoEspecial && eventoEspecial.esEspecial;
            importancia = esp ? eventoEspecial.subtitulo || 'DUELO DECISIVO DE CAMPEONATO' : 'FECHA REGULAR';
            esCompleta = !!(esp || (rivalidadInfo && rivalidadInfo.esClasico));
        } else if (rivalidadInfo && rivalidadInfo.esClasico) {
            competicion = `🔥 ${rivalidadInfo.etiqueta || 'CLÁSICO CHAQUITO'}`;
            importancia = 'ORGULLO DEL BARRIO EN JUEGO';
            esCompleta = true;
        }
    }

    if (eventoEspecial && eventoEspecial.esFinal) {
        esFinal = true;
        esCompleta = true;
    }

    // 2) Posición en tabla (si hay Liga activa con tabla)
    let posLocal = null;
    let posRival = null;
    let ptsLocal = null;
    let ptsRival = null;
    if (Array.isArray(tablaLiga) && tablaLiga.length > 0 && modoLiga) {
        const idxL = tablaLiga.findIndex((f) => f && f.id === idL);
        const idxR = tablaLiga.findIndex((f) => f && f.id === idR);
        if (idxL >= 0) {
            posLocal = idxL + 1;
            ptsLocal = tablaLiga[idxL].pts;
        }
        if (idxR >= 0) {
            posRival = idxR + 1;
            ptsRival = tablaLiga[idxR].pts;
        }
    }

    // 3) Racha del usuario y forma física
    const rVict = rachasUsuario ? Number(rachasUsuario.victoriasConsecutivas) || 0 : 0;
    const rInv = rachasUsuario ? Number(rachasUsuario.partidosInvicto) || 0 : 0;
    const rDerr = rachasUsuario ? Number(rachasUsuario.derrotasConsecutivas) || 0 : 0;
    let rachaTexto = 'RACHA NEUTRA';
    if (rVict >= 2) rachaTexto = `🔥 ${rVict} VICTORIAS SEGUIDAS`;
    else if (rInv >= 3) rachaTexto = `🛡 ${rInv} PARTIDOS INVICTO`;
    else if (rVict === 1) rachaTexto = '✓ VIENE DE GANAR';
    else if (rDerr >= 2) rachaTexto = `⚠ ${rDerr} CAÍDAS SEGUIDAS`;

    const descForma = formaLocal ? describirFormaEquipo(formaLocal) : null;

    // 4) Rivalidad y últimos enfrentamientos reales
    const riv = rivalidadInfo || {
        nivel: 0,
        esClasico: false,
        etiqueta: 'CRUCE SIN ANTECEDENTES',
        pj: 0,
        ganados: 0,
        empatados: 0,
        perdidos: 0,
        ultimoResultado: '',
    };

    const crucesRecientes = Array.isArray(historialPartidos)
        ? historialPartidos
              .filter(
                  (h) =>
                      h &&
                      ((h.equipoLocal === idL && h.equipoRival === idR) ||
                          (h.equipoLocal === idR && h.equipoRival === idL))
              )
              .slice(0, 3)
              .map((h) => {
                  const mioLocal = h.equipoLocal === idL;
                  const gl = mioLocal ? h.gf : h.gc;
                  const gr = mioLocal ? h.gc : h.gf;
                  return `${gl}-${gr}`;
              })
        : [];

    let historialCaraACara = 'SIN CRUCES PREVIOS REGISTRADOS';
    if (riv.pj > 0) {
        const ultTxt = crucesRecientes.length > 0 ? ` · ÚLT: ${crucesRecientes.join(', ')}` : '';
        historialCaraACara = `HISTORIAL: ${riv.ganados}G ${riv.empatados}E ${riv.perdidos}P (${riv.pj} PJ)${ultTxt}`;
    }

    // 5) Clima
    const climaTexto = climaCfg
        ? `${climaCfg.icono || '☀'} ${climaCfg.nombre || 'DÍA SOLEADO'}`
        : '☀ DÍA SOLEADO';

    const duracionRecomendada = enLinea ? 2.5 : esFinal ? 4.2 : esCompleta ? 3.6 : 2.3;

    return {
        tipoPresentacion: esCompleta ? 'completa' : 'breve',
        esCompleta,
        esFinal,
        duracionRecomendada,
        competicion,
        subtitulo,
        importancia,
        local: {
            id: idL,
            nombre: nomL,
            posicionTabla: posLocal,
            puntosTabla: ptsLocal,
            rachaTexto,
            forma: descForma,
        },
        rival: {
            id: idR,
            nombre: nomR,
            posicionTabla: posRival,
            puntosTabla: ptsRival,
        },
        rivalidad: {
            nivel: riv.nivel || 0,
            esClasico: !!riv.esClasico,
            etiqueta: riv.etiqueta || 'AMISTOSO',
            textoNivel: riv.textoNivel || `RIVALIDAD ${riv.nivel || 0}/100`,
        },
        historialCaraACara,
        crucesRecientes,
        climaTexto,
    };
}

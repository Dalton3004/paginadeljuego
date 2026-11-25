/**
 * Almacén y coordinador persistente del universo Carrera Chaquito (Fase B):
 * une Rachas (Etapa 12), Rivalidades (Etapa 13), Reputación (Etapa 7),
 * Noticias (Etapa 5), Conferencias (Etapa 6) y Palmarés/Supercopa (Etapas 8, 9 y 11).
 */

import { crearEstadoRachas, normalizarEstadoRachas, actualizarRachas } from './rachas.js';
import {
    crearEstadoRivalidades,
    normalizarEstadoRivalidades,
    consultarRivalidad,
    registrarEnfrentamientoRivalidad,
    ajustarRivalidadPorDeclaracion,
} from './rivalidades.js';
import {
    crearEstadoReputacion,
    normalizarEstadoReputacion,
    actualizarReputacionPorPartido,
    aplicarDeltaReputacion,
} from './reputacion.js';
import {
    analizarNarrativaPartido,
    generarNoticiaPartido,
    generarNoticiaConferencia,
} from './noticias.js';
import { evaluarActivacionConferencia, crearConferenciaPostPartido } from './conferencias.js';
import {
    normalizarEstadoForma,
    registrarPartidoEnForma,
    aplicarRecuperacionPlantel,
    describirFormaEquipo,
} from './forma.js';
import { CELEBRACIONES_IDS } from './celebraciones.js';

const KEY_CARRERA = 'chaquito_carrera_v1';
const MAX_NOTICIAS = 45;
const MAX_HISTORIAL_TEMPORADAS = 30;

function crearEstadoInicial() {
    return {
        v: 1,
        clubActualId: 'retoneta',
        reputacion: crearEstadoReputacion(),
        rachas: crearEstadoRachas(),
        rivalidades: crearEstadoRivalidades(),
        estadisticasClub: {},
        formaClubes: {},
        celebracionEquipada: 'normal',
        celebracionesDesbloqueadas: ['normal'],
        noticias: [],
        noticiasSinLeer: 0,
        partidosDesdeConferencia: 99,
        contadorConferencias: 0,
        palmares: {
            ligas: 0,
            copas: 0,
            supercopas: 0,
            campeonLigaVigente: null, // { equipoId, subcampeonId, fecha }
            campeonCopaVigente: null, // { equipoId, finalistaId, fecha }
            historialTitulos: [], // [{ tipo, campeonId, subcampeonId, marcador, fecha }]
        },
        historialTemporadas: [],
        premiosHistorial: [],
        recordsGlobales: {
            goleadores: {},
            golMasTardio: null,
            partidoConMasGoles: null,
        },
    };
}

function normalizarEstado(raw) {
    const base = crearEstadoInicial();
    if (!raw || typeof raw !== 'object') return base;
    const p = raw.palmares && typeof raw.palmares === 'object' ? raw.palmares : {};
    const rg = raw.recordsGlobales && typeof raw.recordsGlobales === 'object' ? raw.recordsGlobales : {};
    const formaClubes = {};
    if (raw.formaClubes && typeof raw.formaClubes === 'object') {
        for (const [cid, fst] of Object.entries(raw.formaClubes)) {
            formaClubes[cid] = normalizarEstadoForma(fst);
        }
    }
    const celebEq = CELEBRACIONES_IDS.includes(raw.celebracionEquipada) ? raw.celebracionEquipada : 'normal';
    const celebDesb = Array.isArray(raw.celebracionesDesbloqueadas)
        ? Array.from(new Set(['normal', ...raw.celebracionesDesbloqueadas.filter((x) => CELEBRACIONES_IDS.includes(x))]))
        : ['normal'];
    return {
        v: 1,
        clubActualId: String(raw.clubActualId || 'retoneta'),
        reputacion: normalizarEstadoReputacion(raw.reputacion),
        rachas: normalizarEstadoRachas(raw.rachas),
        rivalidades: normalizarEstadoRivalidades(raw.rivalidades),
        estadisticasClub:
            raw.estadisticasClub && typeof raw.estadisticasClub === 'object'
                ? { ...raw.estadisticasClub }
                : {},
        formaClubes,
        celebracionEquipada: celebEq,
        celebracionesDesbloqueadas: celebDesb,
        noticias: Array.isArray(raw.noticias) ? raw.noticias.slice(0, MAX_NOTICIAS) : [],
        noticiasSinLeer: Math.max(0, parseInt(raw.noticiasSinLeer, 10) || 0),
        partidosDesdeConferencia: Math.max(0, parseInt(raw.partidosDesdeConferencia ?? 99, 10) || 0),
        contadorConferencias: Math.max(0, parseInt(raw.contadorConferencias, 10) || 0),
        palmares: {
            ligas: Math.max(0, parseInt(p.ligas, 10) || 0),
            copas: Math.max(0, parseInt(p.copas, 10) || 0),
            supercopas: Math.max(0, parseInt(p.supercopas, 10) || 0),
            campeonLigaVigente: p.campeonLigaVigente || null,
            campeonCopaVigente: p.campeonCopaVigente || null,
            historialTitulos: Array.isArray(p.historialTitulos) ? p.historialTitulos.slice(0, 40) : [],
        },
        historialTemporadas: Array.isArray(raw.historialTemporadas)
            ? raw.historialTemporadas.slice(0, MAX_HISTORIAL_TEMPORADAS)
            : [],
        premiosHistorial: Array.isArray(raw.premiosHistorial) ? raw.premiosHistorial.slice(0, 30) : [],
        recordsGlobales: {
            goleadores: rg.goleadores && typeof rg.goleadores === 'object' ? { ...rg.goleadores } : {},
            golMasTardio: rg.golMasTardio || null,
            partidoConMasGoles: rg.partidoConMasGoles || null,
        },
    };
}

export const CarreraStore = (() => {
    let mem = crearEstadoInicial();

    function leer() {
        try {
            if (typeof localStorage === 'undefined') return normalizarEstado(mem);
            const raw = localStorage.getItem(KEY_CARRERA);
            if (!raw) return crearEstadoInicial();
            return normalizarEstado(JSON.parse(raw));
        } catch (_e) {
            return normalizarEstado(mem);
        }
    }

    function escribir(estado) {
        const limpio = normalizarEstado(estado);
        mem = limpio;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(KEY_CARRERA, JSON.stringify(limpio));
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    function reiniciar() {
        const limpio = crearEstadoInicial();
        escribir(limpio);
        return limpio;
    }

    function agregarNoticia(noticia) {
        if (!noticia || !noticia.titular) return null;
        const st = leer();
        st.noticias.unshift(noticia);
        st.noticias = st.noticias.slice(0, MAX_NOTICIAS);
        st.noticiasSinLeer = Math.min(99, (st.noticiasSinLeer || 0) + 1);
        escribir(st);
        return noticia;
    }

    function marcarNoticiasLeidas() {
        const st = leer();
        if (st.noticiasSinLeer > 0) {
            st.noticiasSinLeer = 0;
            escribir(st);
        }
    }

    function rivalidadEntre(eqA, eqB) {
        return consultarRivalidad(leer().rivalidades, eqA, eqB);
    }

    function fijarClubActual(equipoId) {
        if (!equipoId) return null;
        const st = leer();
        st.clubActualId = String(equipoId);
        escribir(st);
        return st.clubActualId;
    }

    function registrarPremiosTemporada(premios) {
        if (!premios || !premios.campeon) return null;
        const st = leer();
        st.premiosHistorial = st.premiosHistorial.filter((p) => !premios.ligaId || p.ligaId !== premios.ligaId);
        st.premiosHistorial.unshift({
            ...premios,
            fecha: Date.now(),
        });
        st.premiosHistorial = st.premiosHistorial.slice(0, 30);
        escribir(st);
        return premios;
    }

    /**
     * Registra un campeón oficial de Liga, Copa o Supercopa y deja listos los clasificados a Supercopa.
     */
    function registrarTituloCompeticion({
        tipo, // 'liga' | 'copa' | 'supercopa'
        campeonId,
        subcampeonId = '',
        esUsuario = false,
        marcador = '',
    } = {}) {
        const st = leer();
        const ahora = Date.now();
        if (tipo === 'liga') {
            if (esUsuario) st.palmares.ligas += 1;
            st.palmares.campeonLigaVigente = {
                equipoId: campeonId,
                subcampeonId: subcampeonId || '',
                esUsuario: !!esUsuario,
                fecha: ahora,
            };
        } else if (tipo === 'copa') {
            if (esUsuario) st.palmares.copas += 1;
            st.palmares.campeonCopaVigente = {
                equipoId: campeonId,
                finalistaId: subcampeonId || '',
                esUsuario: !!esUsuario,
                fecha: ahora,
            };
        } else if (tipo === 'supercopa') {
            if (esUsuario) st.palmares.supercopas += 1;
        }

        st.palmares.historialTitulos.unshift({
            tipo,
            campeonId,
            subcampeonId,
            esUsuario: !!esUsuario,
            marcador,
            fecha: ahora,
        });
        st.palmares.historialTitulos = st.palmares.historialTitulos.slice(0, 40);
        escribir(st);
        return st.palmares;
    }

    function registrarTemporadaLiga(resumenTemporada) {
        const st = leer();
        if (resumenTemporada && resumenTemporada.recompensaReputacion) {
            const r = aplicarDeltaReputacion(st.reputacion, resumenTemporada.recompensaReputacion);
            st.reputacion = r.estado;
        }
        st.historialTemporadas.unshift({
            ...resumenTemporada,
            fecha: Date.now(),
        });
        st.historialTemporadas = st.historialTemporadas.slice(0, MAX_HISTORIAL_TEMPORADAS);
        escribir(st);
        return st;
    }

    /**
     * Procesa todas las consecuencias de un partido real terminado y devuelve el paquete
     * listo para mostrar en Post-Partido (noticia, racha, rivalidad, reputación y conferencia).
     */
    function procesarPartido({
        modo = 'solo',
        miEquipoId = '',
        rivalId = '',
        nombreMio = 'Tu Equipo',
        nombreRival = 'Rival',
        ladoMio = 'local',
        golesMios = 0,
        golesOtro = 0,
        penales = null, // { golesMios, golesOtro } o null
        golesDetalle = [],
        figura = null,
        impactoLiga = null,
        infoCopa = null,
        infoSupercopa = null,
        esFinal = false,
        esEliminatoria = false,
        partidoImportante = false,
        victoriaSobreLider = false,
        tituloGanado = false,
        contextoTorneo = '',
        clima = 'dia',
        forzarConferencia = false,
        azarConferencia = Math.random,
    } = {}) {
        // Etapas 19 y 20: Arcade y Desafíos no contaminan estadísticas oficiales de Carrera
        if (modo === 'arcade' || modo === 'desafio') return null;

        const st = leer();

        const nar = analizarNarrativaPartido({
            ladoMio,
            golesMios,
            golesOtro,
            golesDetalle,
            penales,
        });
        const resultado = nar.resultadoEfectivo;

        // 0) Estadísticas históricas por club (Etapa 17 — MI CLUB) + Forma/Cansancio (Etapa 23)
        if (miEquipoId && modo !== 'online') {
            const prevClub = st.estadisticasClub[miEquipoId] || {
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
            prevClub.pj += 1;
            prevClub.gf += Math.max(0, golesMios);
            prevClub.gc += Math.max(0, golesOtro);
            if (golesOtro === 0) prevClub.vallasInvictas += 1;
            if (resultado === 'win') prevClub.g += 1;
            else if (resultado === 'loss') prevClub.p += 1;
            else prevClub.e += 1;

            if (esFinal) {
                prevClub.finalesJugadas += 1;
                if (resultado === 'win') prevClub.finalesGanadas += 1;
            }
            const diff = golesMios - golesOtro;
            if (diff >= 2 && (!prevClub.mayorGoleada || diff > prevClub.mayorGoleada.diff || (diff === prevClub.mayorGoleada.diff && golesMios > prevClub.mayorGoleada.gf))) {
                prevClub.mayorGoleada = { gf: golesMios, gc: golesOtro, rivalId, diff };
            }
            if (nar.remontada && (!prevClub.mayorRemontada || nar.maxDesventaja >= (prevClub.mayorRemontada.desventaja || 1))) {
                prevClub.mayorRemontada = {
                    gf: golesMios,
                    gc: golesOtro,
                    rivalId,
                    desventaja: nar.maxDesventaja || 1,
                };
            }
            st.estadisticasClub[miEquipoId] = prevClub;

            st.formaClubes[miEquipoId] = registrarPartidoEnForma(st.formaClubes[miEquipoId], {
                resultado,
                golesFavor: golesMios,
                golesContra: golesOtro,
                clima,
                intensidadExtra: !!(esFinal || esEliminatoria),
            });
        }

        // 0.b) Récords globales verificables (Etapa 31 — partido con más goles, gol más tardío, goleadores)
        const totalGolesPartido = Math.max(0, golesMios) + Math.max(0, golesOtro);
        const prevMasGoles = st.recordsGlobales.partidoConMasGoles;
        if (totalGolesPartido > 0 && (!prevMasGoles || totalGolesPartido > prevMasGoles.total)) {
            st.recordsGlobales.partidoConMasGoles = {
                total: totalGolesPartido,
                gf: golesMios,
                gc: golesOtro,
                clubId: miEquipoId || '',
                rivalId: rivalId || '',
                modo,
            };
        }
        if (Array.isArray(golesDetalle)) {
            for (const g of golesDetalle) {
                if (!g || g.enContra) continue;
                if (g.team === ladoMio && g.nombre) {
                    const claveG = `${miEquipoId || 'club'}:${g.nombre}`;
                    const prevG = st.recordsGlobales.goleadores[claveG] || {
                        nombre: g.nombre,
                        equipoId: miEquipoId || '',
                        goles: 0,
                    };
                    prevG.goles += 1;
                    st.recordsGlobales.goleadores[claveG] = prevG;

                    const minG = Number(g.minuto) || 0;
                    const segG = Number(g.segundo) || 0;
                    const prevTardio = st.recordsGlobales.golMasTardio;
                    if (
                        minG > 0 &&
                        (!prevTardio ||
                            minG > prevTardio.minuto ||
                            (minG === prevTardio.minuto && segG > (prevTardio.segundo || 0)))
                    ) {
                        st.recordsGlobales.golMasTardio = {
                            minuto: minG,
                            segundo: segG,
                            nombre: g.nombre,
                            equipoId: miEquipoId || '',
                            rivalId: rivalId || '',
                        };
                    }
                }
            }
        }

        // 1) Rachas (Etapa 12)
        const rachaOut = actualizarRachas(st.rachas, {
            resultado,
            gf: golesMios,
            gc: golesOtro,
        });
        st.rachas = rachaOut.estado;

        // 2) Rivalidades (Etapa 13) — solo entre clubes offline o cuando hay IDs válidos distintos
        let rivOut = {
            cambio: 0,
            nuevoClasico: false,
            info: consultarRivalidad(st.rivalidades, miEquipoId, rivalId),
        };
        if (modo !== 'online' && miEquipoId && rivalId && miEquipoId !== rivalId) {
            const ganadorPen = penales
                ? penales.golesMios > penales.golesOtro
                    ? 'local'
                    : 'rival'
                : null;
            rivOut = registrarEnfrentamientoRivalidad(st.rivalidades, {
                eqLocal: miEquipoId,
                eqRival: rivalId,
                golesLocal: golesMios,
                golesRival: golesOtro,
                ganadorPenales: ganadorPen,
                remontada: nar.remontada,
                esFinal,
                esEliminatoria,
                partidoImportante,
            });
            st.rivalidades = rivOut.estado;
        }

        // 3) Reputación (Etapa 7)
        const repOut = actualizarReputacionPorPartido(st.reputacion, {
            resultado,
            goleadaFavor: nar.goleadaFavor,
            goleadaContra: nar.goleadaContra,
            remontada: nar.remontada,
            esClasico: rivOut.info.esClasico,
            esFinal,
            tituloGanado,
            rachaVictorias: st.rachas.victoriasConsecutivas,
            rachaDerrotas: st.rachas.derrotasConsecutivas,
            nivelRivalidad: rivOut.info.nivel,
        });
        st.reputacion = repOut.estado;

        // 4) Noticias Chaquito (Etapa 5)
        const recientesIds = st.noticias.slice(0, 8).map((n) => n.plantillaId);
        const noticia = generarNoticiaPartido(
            {
                modo,
                miEquipoId,
                rivalId,
                nombreMio,
                nombreRival,
                golesMios,
                golesOtro,
                penales,
                golesDetalle,
                ladoMio,
                figura,
                rachaInfo: rachaOut,
                rivalidadInfo: rivOut.info,
                impactoLiga,
                infoCopa,
                infoSupercopa,
                contextoTorneo,
            },
            recientesIds
        );
        st.noticias.unshift(noticia);
        st.noticias = st.noticias.slice(0, MAX_NOTICIAS);
        st.noticiasSinLeer = Math.min(99, (st.noticiasSinLeer || 0) + 1);

        // 5) Conferencia Post-Partido (Etapa 6)
        const evalConf = forzarConferencia
            ? { activar: true, motivo: esFinal ? 'final' : 'historia' }
            : evaluarActivacionConferencia({
                  modo,
                  tituloGanado,
                  esFinal,
                  esClasico: rivOut.info.esClasico,
                  remontada: nar.remontada,
                  victoriaSobreLider,
                  goleadaFavor: nar.goleadaFavor,
                  goleadaContra: nar.goleadaContra,
                  golTardioDecisivo: nar.golTardioDecisivo,
                  rachaVictorias: st.rachas.victoriasConsecutivas,
                  rachaDerrotas: st.rachas.derrotasConsecutivas,
                  partidosDesdeUltima: st.partidosDesdeConferencia,
                  azar: azarConferencia,
              });

        let conferencia = null;
        if (evalConf.activar) {
            const marcadorTxt = penales
                ? `${golesMios}-${golesOtro} (${penales.golesMios}-${penales.golesOtro} pen.)`
                : `${golesMios}-${golesOtro}`;
            const heroe =
                (nar.golTardioMio && nar.golTardioMio.nombre) ||
                (figura && figura.nombre) ||
                nombreMio;
            conferencia = crearConferenciaPostPartido({
                motivo: evalConf.motivo,
                resultado,
                nombreMio,
                nombreRival,
                marcador: marcadorTxt,
                heroe,
                rachaVictorias: st.rachas.victoriasConsecutivas,
                indicePeriodista: st.contadorConferencias,
            });
            st.partidosDesdeConferencia = 0;
            st.contadorConferencias += 1;
        } else {
            st.partidosDesdeConferencia += 1;
        }

        escribir(st);

        return {
            resultado,
            narrativa: nar,
            formaClub: miEquipoId ? describirFormaEquipo(st.formaClubes[miEquipoId]) : null,
            rachas: rachaOut,
            rivalidad: {
                ...rivOut.info,
                cambio: rivOut.cambio,
                nuevoClasico: !!rivOut.nuevoClasico,
            },
            reputacion: {
                estado: repOut.estado,
                deltas: repOut.deltas,
                nuevosTitulos: repOut.nuevosTitulos,
            },
            noticia,
            conferencia,
        };
    }

    /**
     * Aplica la respuesta elegida en una Conferencia Post-Partido (reputación, rivalidad y noticia).
     */
    function responderConferencia(conferencia, opcionId, { miEquipoId = '', rivalId = '', nombreMio = '', nombreRival = '' } = {}) {
        if (!conferencia || conferencia.respondida) return null;
        const op = (conferencia.opciones || []).find((x) => x.id === opcionId);
        if (!op) return null;

        const st = leer();
        const repOut = aplicarDeltaReputacion(st.reputacion, op.efecto || {});
        st.reputacion = repOut.estado;

        if (op.efecto && op.efecto.rivalidad && miEquipoId && rivalId) {
            st.rivalidades = ajustarRivalidadPorDeclaracion(
                st.rivalidades,
                miEquipoId,
                rivalId,
                op.efecto.rivalidad
            );
        }

        const noticiaDecl = generarNoticiaConferencia({
            nombreClub: nombreMio,
            periodista: `${conferencia.periodista} (${conferencia.medio})`,
            cita: op.texto,
            tono: op.tono,
            rivalNombre: nombreRival,
        });
        st.noticias.unshift(noticiaDecl);
        st.noticias = st.noticias.slice(0, MAX_NOTICIAS);

        escribir(st);

        conferencia.respondida = true;
        conferencia.respuestaElegida = op;

        return {
            opcion: op,
            reputacion: repOut,
            noticia: noticiaDecl,
            rivalidadActualizada: miEquipoId && rivalId ? consultarRivalidad(st.rivalidades, miEquipoId, rivalId) : null,
        };
    }

    function formaDeClub(clubId) {
        const st = leer();
        const id = String(clubId || st.clubActualId || 'retoneta');
        return describirFormaEquipo(st.formaClubes[id]);
    }

    function descansarClub(clubId, motivo = 'descanso') {
        const st = leer();
        const id = String(clubId || st.clubActualId || 'retoneta');
        st.formaClubes[id] = aplicarRecuperacionPlantel(st.formaClubes[id], { motivo });
        escribir(st);
        return describirFormaEquipo(st.formaClubes[id]);
    }

    function equiparCelebracion(celebracionId) {
        if (!CELEBRACIONES_IDS.includes(celebracionId)) return null;
        const st = leer();
        st.celebracionEquipada = celebracionId;
        escribir(st);
        return st.celebracionEquipada;
    }

    function desbloquearCelebracion(celebracionId) {
        if (!CELEBRACIONES_IDS.includes(celebracionId)) return null;
        const st = leer();
        if (!st.celebracionesDesbloqueadas.includes(celebracionId)) {
            st.celebracionesDesbloqueadas.push(celebracionId);
            escribir(st);
        }
        return st.celebracionesDesbloqueadas;
    }

    function aplicarCapituloHistoria({ clubId = '', rivalId = '', recompensa = null, deltaRivalidad = 0 } = {}) {
        const st = leer();
        if (recompensa) {
            const repOut = aplicarDeltaReputacion(st.reputacion, recompensa);
            st.reputacion = repOut.estado;
            if (recompensa.celebracionDesbloqueada && CELEBRACIONES_IDS.includes(recompensa.celebracionDesbloqueada)) {
                if (!st.celebracionesDesbloqueadas.includes(recompensa.celebracionDesbloqueada)) {
                    st.celebracionesDesbloqueadas.push(recompensa.celebracionDesbloqueada);
                }
            }
        }
        if (deltaRivalidad && clubId && rivalId && clubId !== rivalId) {
            st.rivalidades = ajustarRivalidadPorDeclaracion(st.rivalidades, clubId, rivalId, deltaRivalidad);
        }
        escribir(st);
        return st;
    }

    return {
        leer,
        escribir,
        reiniciar,
        agregarNoticia,
        marcarNoticiasLeidas,
        rivalidadEntre,
        fijarClubActual,
        formaDeClub,
        descansarClub,
        equiparCelebracion,
        desbloquearCelebracion,
        aplicarCapituloHistoria,
        registrarPremiosTemporada,
        registrarTituloCompeticion,
        registrarTemporadaLiga,
        procesarPartido,
        responderConferencia,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.CarreraStore = CarreraStore;
}

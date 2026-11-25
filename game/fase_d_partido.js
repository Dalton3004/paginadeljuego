import { Game } from '../game.js';
import { slotDeMobilityId } from '../sim/planteles.js';
import {
    atributosJugador,
    rasgosJugador,
    modificadoresDesdeAtributos,
} from '../career/atributos.js';
import {
    actualizarDesafioEnVivo,
    evaluarResultadoDesafio,
    DesafiosStore,
} from '../career/desafios.js';
import { ControladorArcade, ArcadeStore } from '../career/arcade.js';
import {
    evaluarCelebracionesDesbloqueadas,
    resolverCelebracionActiva,
    calcularPoseCelebracion,
} from '../career/celebraciones.js';
import { evaluarCapituloHistoria, HistoriaStore } from '../career/historia.js';
import { ControladorComentarios } from '../career/comentarios.js';
import { construirDatosPrePartido } from '../career/prepartido.js';
import { CarreraStore } from '../career/store.js';
import { LigaCore } from '../liga.js';
import { HistorialLocalStore } from '../perfil.js';

/**
 * Integración en tiempo real de FASE D con el motor de partido y canvas:
 *   - Etapa 19: Reglas y evaluación de Modo Desafíos
 *   - Etapa 20: Multiplicadores, eventos temporales y goles especiales de Chaquito Arcade
 *   - Etapa 21: Celebraciones cosméticas durante CELEBRANDO_GOL
 *   - Etapa 22 y 23: Aplicación sutil de Atributos/Rasgos y Forma/Cansancio
 *   - Etapa 24: Cierre y consecuencias reales de capítulos del Modo Historia
 *   - Etapa 25: Radio / Comentarios contextuales en vivo
 *   - Etapa 26: Presentación Pre-Partido rica (breve vs completa)
 */

Object.assign(Game.prototype, {
    _initSistemasFaseDPartido() {
        const g = this.gestor;
        if (!g) return;

        this._celebracionGolActiva = null;
        this._ctrlArcade = null;
        this._ctrlComentarios = null;
        this._datosPrePartido = null;

        // 1) En línea el servidor es autoritativo: solo inicializamos comentarios y pre-partido limpio
        const eqLocal = this._equipo(this.seleccion && this.seleccion.local);
        const eqRival = this._equipo(this.seleccion && this.seleccion.rival);

        if (!this.enLinea) {
            // Etapas 22 y 23: atributos, rasgos y estado físico (en Liga/Copa/Supercopa/Historia/Solo)
            const usarForma = !this.modoDesafio && !this.modoArcade;
            const formaLocal = usarForma && eqLocal ? CarreraStore.formaDeClub(eqLocal.id) : null;
            for (const p of this.players) {
                const eqId = p.team === 'local' ? (eqLocal && eqLocal.id) : (eqRival && eqRival.id);
                const slot = slotDeMobilityId(p.mobilityId, p.isGK);
                const at = atributosJugador(eqId || 'retoneta', slot);
                const rsg = rasgosJugador(eqId || 'retoneta', slot, at);
                const mods = modificadoresDesdeAtributos(at, rsg, p.team === 'local' ? formaLocal : null);
                p.atributos = at;
                p.rasgos = rsg;
                p.attrMods = mods;
                if (!p.isGK) {
                    p.mobilityMultiplier *= mods.velocidad;
                } else {
                    p.gkReaction *= mods.reaccionArquero;
                }
            }

            // Etapa 19: configuración inicial de Modo Desafíos
            if (this.modoDesafio && this.modoDesafio.def) {
                const def = this.modoDesafio.def;
                if (def.tipoMotor === 'partido') {
                    g.framesRestantes = Math.max(5, def.tiempo) * CONFIG.TARGET_FPS;
                    g.golesLocal = def.golesLocalInicial || 0;
                    g.golesRival = def.golesRivalInicial || 0;
                    if (def.tacticaRivalForzada && TACTICAS[def.tacticaRivalForzada]) {
                        for (const p of this.players) {
                            if (p.team === 'rival' && !p.isGK) {
                                p.tacticaAvance = TACTICAS[def.tacticaRivalForzada].avance;
                            }
                        }
                    }
                }
            }

            // Etapa 20: configuración inicial de Modo Chaquito Arcade
            if (this.modoArcade && this.modoArcade.reglas) {
                this._ctrlArcade = new ControladorArcade(this.modoArcade.reglas);
                g.framesRestantes = this._ctrlArcade.reglas.duracionSeg * CONFIG.TARGET_FPS;
                this._sincronizarMultiplicadoresArcade();
            }

            // Etapa 24: configuración inicial de capítulo de Modo Historia
            if (this.modoHistoria) {
                g.framesRestantes = (this.modoHistoria.tiempoSeg || 70) * CONFIG.TARGET_FPS;
                g.golesLocal = this.modoHistoria.golesLocalInicial || 0;
                g.golesRival = this.modoHistoria.golesRivalInicial || 0;
            }
        }

        // Etapa 25: Radio / Comentarios contextuales
        const nomLoc = this.enLinea
            ? this._nombreOnline('L', eqLocal ? eqLocal.corto : 'LOCAL')
            : (eqLocal ? (eqLocal.nombre || eqLocal.corto) : 'LOCAL');
        const nomRiv = this.enLinea
            ? this._nombreOnline('R', eqRival ? eqRival.corto : 'RIVAL')
            : (eqRival ? (eqRival.nombre || eqRival.corto) : 'RIVAL');
        this._ctrlComentarios = new ControladorComentarios({
            nombreLocal: nomLoc,
            nombreRival: nomRiv,
            onAudioHook: (clip) => {
                this._ultimoAudioKeyComentario = clip.audioKey;
            },
        });

        // Etapa 26: Presentación Pre-Partido rica (breve o completa según importancia)
        const stCarrera = CarreraStore.leer();
        const tablaAct =
            !this.enLinea && this.modoLiga && this.liga && this.liga.liga
                ? LigaCore.tabla(this.liga.liga)
                : null;
        const rivInfo =
            !this.enLinea && eqLocal && eqRival
                ? CarreraStore.rivalidadEntre(eqLocal.id, eqRival.id)
                : null;
        this._datosPrePartido = construirDatosPrePartido({
            enLinea: this.enLinea,
            equipoLocal: eqLocal,
            equipoRival: eqRival,
            modoLiga: this.modoLiga,
            tablaLiga: tablaAct,
            modoCopa: this.modoCopa,
            modoSupercopa: this.modoSupercopa,
            modoDesafio: this.modoDesafio && this.modoDesafio.def,
            modoArcade: this.modoArcade,
            modoHistoria: this.modoHistoria,
            eventoEspecial: this._eventoEspecial,
            rivalidadInfo: rivInfo,
            rachasUsuario: stCarrera.rachas,
            formaLocal: !this.enLinea && eqLocal ? CarreraStore.formaDeClub(eqLocal.id) : null,
            climaCfg: this._climaEstado && this._climaEstado.cfg,
            historialPartidos: HistorialLocalStore.lista(),
        });
        if (!this.enLinea && this._datosPrePartido) {
            g.prematchTimer = this._datosPrePartido.duracionRecomendada;
            this._prematchDurationTotal = this._datosPrePartido.duracionRecomendada;
        } else {
            this._prematchDurationTotal = CONFIG.PREMATCH_LOAD_SEC;
        }
    },

    _sincronizarMultiplicadoresArcade() {
        if (!this._ctrlArcade || !this.ball) return;
        const m = this._ctrlArcade.multiplicadoresActivos();
        this.ball.arcadePowerMult = m.pelotaPotencia;
        for (const p of this.players) {
            p._arcadeFuria = m.furiaActiva;
        }
    },

    _obtenerDtPartidoEfectivo(dt) {
        if (!this.enLinea && this._ctrlArcade && this.gestor && this.gestor.estado === EstadoPartido.EN_JUEGO) {
            return dt * this._ctrlArcade.multiplicadoresActivos().dtFactor;
        }
        return dt;
    },

    _onGolFaseD(golInfo) {
        const g = this.gestor;
        if (!g) return;

        // Etapa 21: Activar celebración cosmética desbloqueada
        const stCarrera = CarreraStore.leer();
        const listaCeleb = evaluarCelebracionesDesbloqueadas({
            carrera: stCarrera,
            desafiosCompletados: DesafiosStore.totalCompletados(),
            historiaCompletada: !!HistoriaStore.leer().campanaCompletada,
        });
        const idsDisp = listaCeleb.filter((c) => c.desbloqueada).map((c) => c.id);
        const segRest = g.framesRestantes / CONFIG.TARGET_FPS;
        const celeb = resolverCelebracionActiva({
            preferida: stCarrera.celebracionEquipada || 'normal',
            desbloqueadasIds: golInfo && golInfo.team === 'rival' ? ['normal', 'grupal'] : idsDisp,
            esGolTardio: segRest <= 15,
            esFinal: !!(this._eventoEspecial && this._eventoEspecial.esFinal),
        });
        this._celebracionGolActiva = {
            ...celeb,
            team: (golInfo && golInfo.team) || 'local',
            autorId: (golInfo && golInfo.jugadorId) || '',
            elapsed: 0,
        };
        if (celeb.id === 'especial' && this.fx && !(this.prefs && this.prefs.reduceMotion)) {
            this.fx.confetti(CONFIG.WIDTH / 2, CONFIG.HEIGHT * 0.35, 18);
        }

        // Etapa 20: Reglas de valor de gol en Modo Chaquito Arcade
        if (!this.enLinea && this._ctrlArcade && golInfo) {
            const evGol = this._ctrlArcade.evaluarGol({
                equipoAnotador: golInfo.team,
                posPateadorY: this.ball ? this.ball.lastShotFromY : null,
                mitadCanchaY: CONFIG.HEIGHT / 2,
            });
            if (evGol.golesExtra > 0) {
                if (golInfo.team === 'local') g.golesLocal += evGol.golesExtra;
                else g.golesRival += evGol.golesExtra;
            }
            if (evGol.finalizarInmediato) {
                this._arcadeFinalizarTrasFestejo = true;
            }
        }
    },

    _updateFaseDEnPartido(dt, woodworkSnapshot = null) {
        const g = this.gestor;
        if (!g || g.pausado) return;

        const segRest = g.framesRestantes / CONFIG.TARGET_FPS;

        // Rasgo CLUTCH (Etapa 22): activo en los últimos 20s del partido
        if (!this.enLinea) {
            for (const p of this.players) {
                p._clutchActivo = !!(p.attrMods && p.attrMods.clutch && segRest <= 20);
            }
        }

        // Animación cosmética de celebración de gol (Etapa 21)
        if (g.estado === EstadoPartido.CELEBRANDO_GOL && this._celebracionGolActiva) {
            this._celebracionGolActiva.elapsed += dt;
        } else if (g.estado !== EstadoPartido.CELEBRANDO_GOL) {
            this._celebracionGolActiva = null;
            if (this._arcadeFinalizarTrasFestejo && g.estado === EstadoPartido.EN_JUEGO) {
                this._arcadeFinalizarTrasFestejo = false;
                g._finalizarPartido();
                return;
            }
        }

        // Etapa 20: Eventos temporales de Chaquito Arcade
        if (!this.enLinea && this._ctrlArcade) {
            const outArc = this._ctrlArcade.actualizar(dt, {
                enJuego: g.estado === EstadoPartido.EN_JUEGO,
            });
            this._sincronizarMultiplicadoresArcade();
            if (outArc.nuevoEvento && this._ctrlComentarios) {
                this._ctrlComentarios.disparar('arcade_evento', {
                    vars: { detalle: outArc.nuevoEvento.etiqueta },
                    prioridad: 2,
                    duracion: 2.8,
                    forzar: true,
                });
            }
        }

        // Etapa 19: Condiciones en vivo de Modo Desafíos (p. ej. Muro o Supervivencia)
        if (!this.enLinea && this.modoDesafio && g.estado === EstadoPartido.EN_JUEGO) {
            const tickDes = actualizarDesafioEnVivo(this.modoDesafio, {
                golesLocal: g.golesLocal,
                golesRival: g.golesRival,
            });
            if (tickDes.segundosExtra > 0) {
                g.framesRestantes += tickDes.segundosExtra * CONFIG.TARGET_FPS;
            }
            if (tickDes.terminarAhora) {
                g._finalizarPartido();
                g.cartel = 'DERROTA';
            }
        }

        // Etapa 25: Radio / Comentarios contextuales (respeta preferencia showComments !== false)
        if (this._ctrlComentarios && (!this.prefs || this.prefs.showComments !== false)) {
            this._ctrlComentarios.actualizar(dt, {
                enJuego: g.estado === EstadoPartido.EN_JUEGO,
                segundosRestantes: segRest,
                golesLocal: g.golesLocal,
                golesRival: g.golesRival,
                woodwork: woodworkSnapshot,
                ball: this.ball,
                statsEventos: (g.stats && g.stats.eventos) || [],
            });
        }
    },

    _cerrarDesafioAlFinalizar() {
        const d = this.modoDesafio;
        const g = this.gestor;
        if (!d || d.registrado || !g) return null;
        d.registrado = true;
        const stEq = g.stats && g.stats.equipos ? g.stats.equipos.local : {};
        const evalRes = evaluarResultadoDesafio(d.id, {
            golesLocal: g.golesLocal,
            golesRival: g.golesRival,
            segundosSobrantes: g.framesRestantes / CONFIG.TARGET_FPS,
            atajadas: stEq.atajadas || 0,
            tirosAlArco: stEq.tirosAlArco || 0,
            penales: this._resultadoPenales,
            abortadoPorDerrota: d.abortadoPorDerrota,
        });
        d.evaluacion = evalRes;
        g.cartel = evalRes.exito ? 'VICTORIA' : 'DERROTA';
        DesafiosStore.registrarIntento(evalRes);
        if (evalRes.exito) {
            CarreraStore.desbloquearCelebracion('acrobatica');
        }
        return evalRes;
    },

    _cerrarArcadeAlFinalizar() {
        const a = this.modoArcade;
        const g = this.gestor;
        if (!a || a.registrado || !g) return null;
        a.registrado = true;
        ArcadeStore.registrarPartidoArcade({
            gano: g.golesLocal > g.golesRival,
            golesMios: g.golesLocal,
        });
        return a;
    },

    _cerrarHistoriaAlFinalizar() {
        const h = this.modoHistoria;
        const g = this.gestor;
        if (!h || h.registrado || !g) return null;
        h.registrado = true;
        const evalCap = evaluarCapituloHistoria(h, {
            golesLocal: g.golesLocal,
            golesRival: g.golesRival,
            penales: this._resultadoPenales,
        });
        h.evaluacion = evalCap;
        const marc = this._resultadoPenales
            ? `${g.golesLocal}-${g.golesRival} (${this._resultadoPenales.golesMios}-${this._resultadoPenales.golesOtro}p)`
            : `${g.golesLocal}-${g.golesRival}`;
        HistoriaStore.registrarResultadoCapitulo(h, evalCap, { marcador: marc });
        if (evalCap.superado) {
            CarreraStore.aplicarCapituloHistoria({
                clubId: h.clubId,
                rivalId: h.rivalId,
                recompensa: h.recompensa,
                deltaRivalidad: h.deltaRivalidad || 0,
            });
        }
        return evalCap;
    },

    _obtenerPoseCelebracionJugador(p) {
        const cel = this._celebracionGolActiva;
        if (!cel || !this.gestor || this.gestor.estado !== EstadoPartido.CELEBRANDO_GOL) return null;
        if (!p || p.team !== cel.team || p.isGK) return null;
        const esAutor = Boolean(
            (cel.autorId && (p.playerId === cel.autorId || p.mobilityId === cel.autorId)) ||
                (!cel.autorId && p.isHuman)
        );
        const idx = p.mobilityId === `${p.team}_1` ? 1 : p.mobilityId === `${p.team}_2` ? 2 : 0;
        return calcularPoseCelebracion({
            tipo: cel.id,
            elapsed: cel.elapsed,
            esAutor,
            indiceCompanero: idx,
            reduceMotion: !!(this.prefs && this.prefs.reduceMotion),
        });
    },

    _drawOverlaysFaseD(ctx) {
        const g = this.gestor;
        if (!g) return;
        const W = CONFIG.WIDTH;

        // 1) Banner de evento/bonus de Chaquito Arcade (Etapa 20)
        if (!this.enLinea && this._ctrlArcade && g.estado === EstadoPartido.EN_JUEGO) {
            const ev = this._ctrlArcade.eventoActivo;
            const bonus = this._ctrlArcade.ultimoBonusTexto;
            const txt = bonus || (ev ? `${ev.etiqueta} (${Math.ceil(ev.restante)}s)` : '');
            if (txt) {
                const col = bonus ? '#ffcc00' : (ev && ev.color) || '#ffcc00';
                ctx.save();
                ctx.fillStyle = 'rgba(12, 6, 28, 0.88)';
                ctx.fillRect(W / 2 - 148, 45, 296, 20);
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(W / 2 - 148, 45, 296, 20);
                ctx.fillStyle = col;
                ctx.font = 'bold 10px Courier New';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(txt, W / 2, 55);
                ctx.restore();
            }
        }

        // 2) Objetivo compacto en vivo para Modo Desafíos o Modo Historia (Etapas 19 y 24)
        if (!this.enLinea && (this.modoDesafio || this.modoHistoria) && g.estado === EstadoPartido.EN_JUEGO && !this._ctrlArcade) {
            const objTxt = this.modoDesafio
                ? `🎯 ${this.modoDesafio.def.nombre}`
                : `📖 CAP. ${this.modoHistoria.orden}: ${this.modoHistoria.objetivo}`;
            ctx.save();
            ctx.fillStyle = 'rgba(4, 14, 30, 0.78)';
            ctx.fillRect(W / 2 - 165, 44, 330, 17);
            ctx.fillStyle = '#ffe580';
            ctx.font = 'bold 9px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const recorte = objTxt.length > 52 ? objTxt.slice(0, 51) + '…' : objTxt;
            ctx.fillText(recorte, W / 2, 52.5);
            ctx.restore();
        }

        // 3) Subtítulo cosmético de Celebración de Gol (Etapa 21)
        if (g.estado === EstadoPartido.CELEBRANDO_GOL && this._celebracionGolActiva) {
            const cel = this._celebracionGolActiva;
            ctx.save();
            ctx.fillStyle = 'rgba(6, 15, 32, 0.88)';
            ctx.fillRect(W / 2 - 140, CONFIG.HEIGHT * 0.68, 280, 24);
            ctx.strokeStyle = cel.id === 'especial' ? '#ffcc00' : '#4da3ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(W / 2 - 140, CONFIG.HEIGHT * 0.68, 280, 24);
            ctx.fillStyle = '#ffe580';
            ctx.font = 'bold 10.5px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${cel.icono} ${cel.nombre} · ${cel.grito}`, W / 2, CONFIG.HEIGHT * 0.68 + 12);
            ctx.restore();
        }

        // 4) Radio / Comentarios contextuales (Etapa 25)
        if (
            this._ctrlComentarios &&
            this._ctrlComentarios.actual &&
            (!this.prefs || this.prefs.showComments !== false) &&
            g.estado !== EstadoPartido.PREPARANDO &&
            g.estado !== EstadoPartido.FINALIZADO
        ) {
            const com = this._ctrlComentarios.actual;
            const alpha = Math.min(1, com.timer * 2.5);
            const yBar = CONFIG.HEIGHT - 44;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(5, 13, 28, 0.90)';
            ctx.fillRect(24, yBar, W - 48, 20);
            ctx.strokeStyle = com.prioridad >= 3 ? '#ffcc00' : '#3a9bff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(24, yBar, W - 48, 20);
            ctx.fillStyle = com.prioridad >= 3 ? '#ffe580' : '#ffffff';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const linea = `📻 ${com.texto}`;
            ctx.fillText(linea.length > 52 ? linea.slice(0, 51) + '…' : linea, W / 2, yBar + 10);
            ctx.restore();
        }
    },

    /**
     * Etapa 26: Dibuja la placa enriquecida de Presentación Pre-Partido (breve vs completa).
     */
    _drawFichaPrePartidoRica(ctx) {
        const d = this._datosPrePartido;
        const g = this.gestor;
        if (!d || !g) return false;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const totalDur = this._prematchDurationTotal || d.duracionRecomendada || CONFIG.PREMATCH_LOAD_SEC;
        const t = Math.max(0, g.prematchTimer);
        const progress = Math.max(0, Math.min(1, 1 - t / Math.max(0.5, totalDur)));

        const eqL = this._equipo(this.seleccion && this.seleccion.local);
        const eqR = this._equipo(this.seleccion && this.seleccion.rival);
        const evEsp = !this.enLinea && this._eventoEspecial && this._eventoEspecial.esEspecial ? this._eventoEspecial : null;
        const colorAcento = (evEsp && evEsp.color) || (d.esFinal ? '#ffcc00' : d.rivalidad.esClasico ? '#ff626c' : '#ffcc00');

        ctx.save();
        ctx.fillStyle = d.esFinal
            ? 'rgba(18, 12, 3, 0.93)'
            : d.esCompleta
            ? 'rgba(9, 14, 28, 0.92)'
            : 'rgba(2, 8, 23, 0.89)';
        ctx.fillRect(0, 0, W, H);

        if (d.esCompleta) {
            const gL = ctx.createRadialGradient(0, 0, 10, 0, 0, 250);
            gL.addColorStop(0, colorAcento + '33');
            gL.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gL;
            ctx.fillRect(0, 0, W, 250);
            const gR = ctx.createRadialGradient(W, 0, 10, W, 0, 250);
            gR.addColorStop(0, colorAcento + '33');
            gR.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gR;
            ctx.fillRect(0, 0, W, 250);

            ctx.strokeStyle = colorAcento;
            ctx.lineWidth = 3;
            ctx.strokeRect(10, 10, W - 20, H - 20);
        }

        // Encabezado de competición e importancia
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = colorAcento;
        ctx.font = 'bold 18px Courier New';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(d.competicion, W / 2, 46);
        ctx.fillText(d.competicion, W / 2, 46);

        const lineaSub = d.subtitulo ? `${d.subtitulo} · ${d.importancia}` : d.importancia;
        ctx.fillStyle = '#dce8f7';
        ctx.font = 'bold 10px Courier New';
        ctx.fillText(lineaSub.length > 52 ? lineaSub.slice(0, 51) + '…' : lineaSub, W / 2, 68);

        // Escudos y nombres
        const cy = d.esCompleta ? 182 : 215;
        const leftX = W * 0.27;
        const rightX = W * 0.73;
        const badgeW = 74;
        const badgeH = 88;

        const pintarClub = (eq, cx, lado, meta) => {
            const col = this._teamColor(eq, lado === 'L' ? '#4da3ff' : '#ff6b6b');
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy - 8, 50, 0, Math.PI * 2);
            ctx.fillStyle = col + '22';
            ctx.fill();
            ctx.restore();

            const img = eq ? this._badgeImage(eq) : null;
            if (img && img.width) {
                const k = Math.min(badgeW / img.width, badgeH / img.height);
                const dw = img.width * k;
                const dh = img.height * k;
                ctx.drawImage(img, cx - dw / 2, cy - dh / 2 - 8, dw, dh);
            } else {
                ctx.fillStyle = col;
                ctx.fillRect(cx - 32, cy - 44, 64, 76);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(cx - 32, cy - 44, 64, 76);
            }

            let label = String(meta.nombre || '').toUpperCase();
            if (label.length > 12) label = label.slice(0, 11) + '…';
            label = this._nombreOnline(lado, label);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px Courier New';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(label, cx, cy + 50);
            ctx.fillText(label, cx, cy + 50);

            if (meta.posicionTabla) {
                ctx.fillStyle = '#ffe580';
                ctx.font = 'bold 10px Courier New';
                ctx.fillText(`#${meta.posicionTabla}° EN TABLA (${meta.puntosTabla} PTS)`, cx, cy + 66);
            } else {
                ctx.fillStyle = col;
                ctx.font = '10px Courier New';
                ctx.fillText(this.enLinea ? (lado === 'L' ? 'LOCAL' : 'VISITANTE') : (lado === 'L' ? 'TU EQUIPO' : 'RIVAL'), cx, cy + 66);
            }
        };

        pintarClub(eqL, leftX, 'L', d.local);
        pintarClub(eqR, rightX, 'R', d.rival);

        if (d.esFinal || (evEsp && evEsp.mostrarTrofeo)) {
            const tx = W / 2;
            const ty = cy - 42;
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(tx - 10, ty - 14, 20, 13);
            ctx.fillRect(tx - 3, ty - 1, 6, 7);
            ctx.fillRect(tx - 9, ty + 6, 18, 4);
        }

        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 32px Courier New';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText('VS', W / 2, cy - 4);
        ctx.fillText('VS', W / 2, cy - 4);

        if (d.esCompleta && !this.enLinea) {
            // Placa televisiva completa: rivalidad, historial cara a cara, racha/forma y clima
            const boxX = 28;
            const boxY = 278;
            const boxW = W - 56;
            const boxH = 154;
            ctx.fillStyle = 'rgba(6, 18, 38, 0.90)';
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.strokeStyle = d.rivalidad.esClasico ? '#ff626c' : '#2f65a8';
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);

            ctx.fillStyle = d.rivalidad.esClasico ? '#ffd45a' : '#9ecbff';
            ctx.font = 'bold 11px Courier New';
            ctx.fillText(
                `${d.rivalidad.esClasico ? '🔥 ' : ''}${d.rivalidad.etiqueta} · ${d.rivalidad.textoNivel}`,
                W / 2,
                boxY + 24
            );

            ctx.fillStyle = '#dce8f7';
            ctx.font = '10px Courier New';
            ctx.fillText(d.historialCaraACara, W / 2, boxY + 52);

            ctx.fillStyle = '#48e078';
            ctx.font = 'bold 10px Courier New';
            ctx.fillText(`TU MOMENTO: ${d.local.rachaTexto}`, W / 2, boxY + 80);

            if (d.local.forma) {
                ctx.fillStyle = d.local.forma.color || '#9ecbff';
                ctx.font = '10px Courier New';
                ctx.fillText(`ESTADO PLANTEL: ${d.local.forma.textoCorto}`, W / 2, boxY + 106);
            }

            ctx.fillStyle = '#ffe580';
            ctx.font = 'bold 10px Courier New';
            ctx.fillText(`ESTADIO: ${d.climaTexto}`, W / 2, boxY + 132);
        } else {
            // Presentación breve para partidos comunes
            if (!this.enLinea && eqL && eqR && eqL.id !== eqR.id) {
                const pillY = 318;
                ctx.fillStyle = 'rgba(10, 29, 56, 0.90)';
                ctx.fillRect(46, pillY - 13, W - 92, 26);
                ctx.strokeStyle = '#3a9bff';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(46, pillY - 13, W - 92, 26);
                ctx.fillStyle = '#9ecbff';
                ctx.font = 'bold 10.5px Courier New';
                ctx.fillText(`${d.rivalidad.etiqueta} · ${d.local.rachaTexto}`, W / 2, pillY);
            }
            ctx.fillStyle = '#ffe580';
            ctx.font = 'bold 10.5px Courier New';
            ctx.fillText(`ESTADIO: ${d.climaTexto}`, W / 2, 358);
        }

        // Barra de progreso inferior
        const bw = 270;
        const bh = 12;
        const bx = W / 2 - bw / 2;
        const by = d.esCompleta ? 462 : 405;
        ctx.fillStyle = '#111a2e';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(bx + 2, by + 2, Math.max(0, (bw - 4) * progress), bh - 4);

        ctx.fillStyle = '#aab6c9';
        ctx.font = '11px Courier New';
        ctx.fillText(
            !this.enLinea ? `Saliendo a la cancha… ${Math.ceil(t)}s (ESPACIO para saltar)` : `Sincronizando partido… ${Math.ceil(t)}s`,
            W / 2,
            by + 26
        );

        ctx.fillStyle = '#9ecbff';
        ctx.font = '10.5px Courier New';
        ctx.fillText('WASD / Joystick · SPRINT · ESPACIO tiro · E pase · R elevado · Q cambiar', W / 2, H - 36);
        ctx.restore();
        return true;
    },
});

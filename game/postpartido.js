import { Game } from '../game.js';
import { HistorialLocalStore } from '../perfil.js';
import { CarreraStore } from '../career/store.js';

/**
 * ETAPA 2, 4 y FASE B (Etapas 5, 6, 7, 9, 10, 11, 12, 13) — Pantalla Post-Partido:
 *   celebración final en cancha -> pantalla de resultado (incluyendo penales) ->
 *   resumen, figura del partido, noticia deportiva, conferencia de prensa interactiva,
 *   racha expandida, rivalidad, reputación, impacto en Liga/Copa/Supercopa y replays.
 */

function escHtml(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtSegundos(seg) {
    const tot = Math.max(0, Math.round(Number(seg) || 0));
    const m = Math.floor(tot / 60);
    const s = tot % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function claseRating(r) {
    if (r >= 8.2) return 'elite';
    if (r >= 7.0) return 'good';
    if (r >= 5.8) return 'mid';
    return 'low';
}

Object.assign(Game.prototype, {
    _initPostPartidoUI() {
        if (this._postMatchBound) return;
        this._postMatchBound = true;
        this._postMatchPhase = 'inactivo'; // 'inactivo' | 'celebracion' | 'abierto' | 'oculto_replay'
        this._postMatchTimer = 0;
        this._postMatchTab = 'resumen';
        this._postMatchContext = null;

        const root = document.getElementById('postmatch-screen');
        if (root) {
            root.addEventListener('click', (e) => this._onPostMatchClick(e));
        }
    },

    _postPartidoVisible() {
        const root = document.getElementById('postmatch-screen');
        return !!(root && !root.hidden);
    },

    _resetPostPartido() {
        this._initPostPartidoUI();
        this._postMatchPhase = 'inactivo';
        this._postMatchTimer = 0;
        this._postMatchTab = 'resumen';
        this._postMatchContext = null;
        this._ultimoResumenOnline = null;
        this._ultimoImpactoLiga = null;
        this._ultimaRespuestaConferencia = null;
        const root = document.getElementById('postmatch-screen');
        if (root) {
            root.hidden = true;
            root.innerHTML = '';
        }
    },

    _iniciarSecuenciaPostPartido() {
        this._initPostPartidoUI();
        if (this._postMatchPhase !== 'inactivo') return;
        this._postMatchPhase = 'celebracion';
        // Si ya se celebró la tanda de penales, abrimos el resumen más ágilmente
        this._postMatchTimer = this._resultadoPenales ? 0.55 : 1.35;
        this._postMatchTab = 'resumen';
        this._construirContextoPostPartido();
    },

    _adelantarCelebracionFinal() {
        if (this._postMatchPhase === 'celebracion') {
            this._abrirPanelPostPartido();
            return true;
        }
        return false;
    },

    _updatePostPartido(dt) {
        if (!this.gestor || this.gestor.estado !== EstadoPartido.FINALIZADO) return;
        if (this._postMatchPhase === 'inactivo') {
            this._iniciarSecuenciaPostPartido();
        }
        if (this._postMatchPhase === 'celebracion') {
            this._postMatchTimer -= dt;
            if (this._postMatchTimer <= 0) {
                this._abrirPanelPostPartido();
            }
        }
    },

    _abrirPanelPostPartido() {
        this._initPostPartidoUI();
        this._construirContextoPostPartido();
        this._postMatchPhase = 'abierto';
        this._soltarTodosLosControles();
        const root = document.getElementById('postmatch-screen');
        if (!root) return;
        root.hidden = false;
        this._renderPostPartido();
        root.scrollTop = 0;
    },

    _ocultarPostPartidoTemporal() {
        if (this._postMatchPhase === 'abierto') {
            this._postMatchPhase = 'oculto_replay';
            const root = document.getElementById('postmatch-screen');
            if (root) root.hidden = true;
        }
    },

    _restaurarPostPartidoTrasReplay() {
        if (this._postMatchPhase === 'oculto_replay' && this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO) {
            this._postMatchPhase = 'abierto';
            const root = document.getElementById('postmatch-screen');
            if (root) {
                root.hidden = false;
                this._renderPostPartido();
            }
        }
    },

    _refrescarPostPartidoOnline() {
        if (this._postMatchPhase === 'celebracion') {
            this._construirContextoPostPartido();
        } else if (this._postMatchPhase === 'abierto') {
            this._construirContextoPostPartido();
            this._renderPostPartido();
        }
    },

    _construirContextoPostPartido() {
        const g = this.gestor;
        if (!g) return null;
        const soyVisitanteOnline = !!(this.enLinea && this.rolEnLinea === 'Visitante');
        const ladoMio = soyVisitanteOnline ? 'rival' : 'local';
        const ladoRival = ladoMio === 'local' ? 'rival' : 'local';

        const eqLocalObj = this._equipo(this.seleccion && this.seleccion.local);
        const eqRivalObj = this._equipo(this.seleccion && this.seleccion.rival);
        const eqMio = soyVisitanteOnline ? eqRivalObj : eqLocalObj;
        const eqOtro = soyVisitanteOnline ? eqLocalObj : eqRivalObj;

        const nombreMioBase = eqMio ? (eqMio.nombre || eqMio.corto) : 'TU EQUIPO';
        const nombreOtroBase = eqOtro ? (eqOtro.nombre || eqOtro.corto) : 'RIVAL';
        const cortoMio = this.enLinea
            ? this._nombreOnline(soyVisitanteOnline ? 'R' : 'L', eqMio ? eqMio.corto : 'TÚ')
            : (eqMio ? eqMio.corto : 'TU EQUIPO');
        const cortoOtro = this.enLinea
            ? this._nombreOnline(soyVisitanteOnline ? 'L' : 'R', eqOtro ? eqOtro.corto : 'RIVAL')
            : (eqOtro ? eqOtro.corto : 'RIVAL');

        const golesMios = soyVisitanteOnline ? g.golesRival : g.golesLocal;
        const golesOtro = soyVisitanteOnline ? g.golesLocal : g.golesRival;
        const pen = this._resultadoPenales || null;
        let resultado = golesMios > golesOtro ? 'VICTORIA' : (golesMios < golesOtro ? 'DERROTA' : 'EMPATE');
        if (pen && pen.ganador) {
            resultado = pen.ganador === 'mio' ? 'VICTORIA' : 'DERROTA';
        }

        // Fuente de estadísticas: servidor autoritativo en online, GestorPartido.stats en offline
        let serial = null;
        if (this.enLinea && this._ultimoResumenOnline) {
            serial = this._ultimoResumenOnline;
        } else if (g.stats) {
            serial = g.stats.serializar();
        }

        const vacioEq = {
            goles: 0, asistencias: 0, tiros: 0, tirosAlArco: 0, precisionTiro: 0,
            pases: 0, pasesCompletados: 0, precisionPases: 0, barridas: 0, barridasExitosas: 0,
            recuperaciones: 0, perdidas: 0, atajadas: 0, tiempoPosesion: 0, posesionPct: 50,
            ataques: 0, llegadasArea: 0,
        };
        const stMio = serial && serial.equipos ? { ...vacioEq, ...serial.equipos[ladoMio] } : { ...vacioEq, goles: golesMios };
        const stOtro = serial && serial.equipos ? { ...vacioEq, ...serial.equipos[ladoRival] } : { ...vacioEq, goles: golesOtro };

        const golesLista = serial && Array.isArray(serial.goles) ? serial.goles : [];
        const jugadoresLista = serial && Array.isArray(serial.jugadores) ? serial.jugadores : [];
        const eventosLista = serial && Array.isArray(serial.eventos) ? serial.eventos : [];
        const figura = serial && serial.figura ? serial.figura : null;

        const perfilLocal = HistorialLocalStore.perfil();
        const modo = this.enLinea
            ? 'online'
            : this.modoDesafio
            ? 'desafio'
            : this.modoArcade
            ? 'arcade'
            : this.modoHistoria
            ? 'historia'
            : this.modoSupercopa
            ? 'supercopa'
            : this.modoCopa
            ? 'copa'
            : this.modoLiga
            ? 'liga'
            : 'solo';

        if (modo === 'desafio' && this.modoDesafio && this.modoDesafio.evaluacion) {
            resultado = this.modoDesafio.evaluacion.exito ? 'VICTORIA' : 'DERROTA';
        } else if (modo === 'historia' && this.modoHistoria && this.modoHistoria.evaluacion) {
            resultado = this.modoHistoria.evaluacion.superado ? 'VICTORIA' : 'DERROTA';
        }

        this._postMatchContext = {
            modo,
            resultado,
            ladoMio,
            ladoRival,
            eqMio,
            eqOtro,
            nombreMio: this.enLinea ? cortoMio : nombreMioBase,
            nombreOtro: this.enLinea ? cortoOtro : nombreOtroBase,
            cortoMio,
            cortoOtro,
            golesMios,
            golesOtro,
            penales: pen,
            stMio,
            stOtro,
            goles: golesLista,
            jugadores: jugadoresLista,
            eventos: eventosLista,
            figura,
            rachaActual: perfilLocal.rachaActual || 0,
            mejorRacha: perfilLocal.mejorRacha || 0,
            impactoLiga: this._ultimoImpactoLiga || null,
            resultadoCopa: this._ultimoResultadoCopa || null,
            resultadoSupercopa: this._ultimoResultadoSupercopa || null,
            desafio: this.modoDesafio || null,
            arcade: this.modoArcade || null,
            historia: this.modoHistoria || null,
            carrera: this._ultimoPaqueteCarrera || null,
        };
        return this._postMatchContext;
    },

    _badgeImgHtml(eq, cls = 'pm-badge') {
        if (!eq || typeof this._badgeURL !== 'function') {
            return `<span class="${cls} pm-badge-fallback">⚽</span>`;
        }
        return `<img class="${cls}" alt="" src="${escHtml(this._badgeURL(eq))}">`;
    },

    _textoRacha(racha) {
        if (racha >= 2) return `🔥 RACHA ACTUAL: ${racha} VICTORIAS SEGUIDAS`;
        if (racha === 1) return '✓ RACHA ACTUAL: 1 VICTORIA';
        if (racha <= -2) return `⚠ RACHA ACTUAL: ${Math.abs(racha)} DERROTAS SEGUIDAS`;
        if (racha === -1) return 'RACHA ACTUAL: 1 DERROTA';
        return 'RACHA ACTUAL: EMPATE (RACHA EN 0)';
    },

    _renderPostPartido() {
        const root = document.getElementById('postmatch-screen');
        if (!root) return;
        const c = this._postMatchContext || this._construirContextoPostPartido();
        if (!c) return;

        const resCls = c.resultado === 'VICTORIA' ? 'win' : (c.resultado === 'DERROTA' ? 'loss' : 'draw');
        const modoLabel =
            c.modo === 'desafio' && c.desafio && c.desafio.def
                ? `🎯 DESAFÍO · ${c.desafio.def.nombre}`
                : c.modo === 'arcade'
                ? '🕹 CHAQUITO ARCADE · REGLAS ESPECIALES'
                : c.modo === 'historia' && c.historia
                ? `📖 MODO HISTORIA · ${c.historia.titulo}`
                : c.modo === 'supercopa'
                ? '⭐ SUPERCOPA CHAQUITO · FINAL DE CAMPEONES'
                : c.modo === 'copa'
                ? `🏆 COPA CHAQUITO · ${(c.resultadoCopa && c.resultadoCopa.rondaJugada) || 'ELIMINATORIA'}`
                : c.modo === 'liga'
                ? `LIGA CHAQUITO · FECHA ${c.impactoLiga ? c.impactoLiga.fechaJugada : ''}`
                : c.modo === 'online'
                ? 'PARTIDO EN LÍNEA · 1 VS 1'
                : 'PARTIDO AMISTOSO · SOLO';

        const ganadorTxt =
            c.modo === 'desafio' && c.desafio && c.desafio.evaluacion
                ? `${c.desafio.evaluacion.resultado} · ${c.desafio.evaluacion.puntuacion} PTS (${c.desafio.evaluacion.medalla})`
                : c.resultado === 'EMPATE'
                ? 'IGUALDAD EN LOS 90 MINUTOS'
                : `GANADOR: ${c.resultado === 'VICTORIA' ? c.nombreMio : c.nombreOtro}${c.penales ? ` (POR PENALES ${c.penales.golesMios}-${c.penales.golesOtro})` : ''}`;

        const clipsDisponibles = this._golesReplayDisponibles().length;
        const golesMiosDet = c.goles.filter((x) => x.team === c.ladoMio);
        const golesOtroDet = c.goles.filter((x) => x.team === c.ladoRival);

        const renderListaGoleadores = (lista) => {
            if (!lista.length) return '<span class="pm-nogol">—</span>';
            return lista
                .map((g) => {
                    const txt = `⚽ ${escHtml(g.nombre)} ${g.minuto}'${g.enContra ? ' (E/C)' : ''}`;
                    if (g.indice < clipsDisponibles) {
                        return `<button type="button" class="pm-gol-chip" data-replay-gol="${g.indice}" title="Ver repetición">${txt} ▶</button>`;
                    }
                    return `<span class="pm-gol-chip static">${txt}</span>`;
                })
                .join('');
        };

        let bodyTab;
        if (this._postMatchTab === 'estadisticas') bodyTab = this._htmlTabEstadisticas(c);
        else if (this._postMatchTab === 'jugadores') bodyTab = this._htmlTabJugadores(c);
        else if (this._postMatchTab === 'eventos') bodyTab = this._htmlTabEventos(c, clipsDisponibles);
        else bodyTab = this._htmlTabResumen(c, clipsDisponibles);

        // Barra de estado online (revancha en tiempo real)
        let bannerOnline = '';
        if (c.modo === 'online') {
            const msgRev = this._revanchaEstado ? this._textoRevanchaEstado(this._revanchaEstado) : (this.textoRed || '');
            if (msgRev) {
                bannerOnline = `<div class="pm-online-status" role="status">${escHtml(msgRev)}</div>`;
            }
        }

        // Botones principales según modo
        let btnPrimario;
        let btnSecundario;
        if (c.modo === 'desafio') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="reintentar-desafio">REINTENTAR DESAFÍO</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="volver-desafios">LISTA DE DESAFÍOS</button>';
        } else if (c.modo === 'arcade') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="revancha-arcade">OTRO PARTIDO ARCADE</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="volver-arcade">REGLAS ARCADE</button>';
        } else if (c.modo === 'historia') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="volver-historia">📖 CONTINUAR HISTORIA</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu-forzado">MENÚ PRINCIPAL</button>';
        } else if (c.modo === 'liga') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="continuar-liga">CONTINUAR A LA LIGA</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu-forzado">MENÚ PRINCIPAL</button>';
        } else if (c.modo === 'copa') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="continuar-copa">CONTINUAR A LA COPA</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu-forzado">MENÚ PRINCIPAL</button>';
        } else if (c.modo === 'supercopa') {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="abrir-supercopa">⭐ VER SUPERCOPA / PALMARÉS</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu-forzado">MENÚ PRINCIPAL</button>';
        } else if (c.modo === 'online') {
            const yaPidio = this._revanchaVoto === true;
            btnPrimario = `<button type="button" class="action-btn" data-pm-act="revancha"${yaPidio ? ' disabled' : ''}>${yaPidio ? 'ESPERANDO RIVAL…' : 'PEDIR REVANCHA'}</button>`;
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu">VOLVER AL MENÚ</button>';
        } else {
            btnPrimario = '<button type="button" class="action-btn" data-pm-act="revancha">JUGAR REVANCHA</button>';
            btnSecundario = '<button type="button" class="action-btn secondary" data-pm-act="menu">VOLVER AL MENÚ</button>';
        }

        const labelToggleStats = this._postMatchTab === 'estadisticas' ? 'VER RESUMEN' : 'VER ESTADÍSTICAS';
        const btnGoles =
            clipsDisponibles > 0
                ? `<button type="button" class="pm-tool-btn" data-pm-act="ver-goles">🎥 VER GOLES (${clipsDisponibles})</button>`
                : '<button type="button" class="pm-tool-btn" disabled>🎥 SIN GOLES</button>';

        const penSub = c.penales
            ? `<div class="pm-pen-tag">PENALES: ${c.penales.golesMios} - ${c.penales.golesOtro}</div>`
            : '<div class="pm-ft-tag">FINAL · 90\'</div>';

        const esCampeonTorneo =
            (c.modo === 'historia' && c.historia && c.historia.esFinal && c.historia.evaluacion && c.historia.evaluacion.superado) ||
            (c.modo === 'supercopa' && c.resultadoSupercopa && c.resultadoSupercopa.campeon) ||
            (c.modo === 'copa' && c.resultadoCopa && c.resultadoCopa.campeon) ||
            (c.modo === 'liga' && c.impactoLiga && c.impactoLiga.proximo && c.impactoLiga.proximo.terminada && c.impactoLiga.proximo.salioCampeon);

        root.innerHTML = `
            <div class="pm-card pm-${resCls}${esCampeonTorneo ? ' pm-champ' : ''}">
                <div class="pm-top-kicker">${escHtml(modoLabel)}</div>
                <h2 class="pm-result-title">${
                    esCampeonTorneo
                        ? '🏆 ¡CAMPEÓN!'
                        : c.modo === 'desafio' && c.desafio && c.desafio.evaluacion
                        ? (c.desafio.evaluacion.exito ? '🎯 ¡DESAFÍO SUPERADO!' : '✕ DESAFÍO FALLIDO')
                        : c.resultado === 'VICTORIA'
                        ? '¡VICTORIA!'
                        : c.resultado === 'DERROTA'
                        ? 'DERROTA'
                        : '¡EMPATE!'
                }</h2>
                <div class="pm-winner-line">${escHtml(ganadorTxt)}</div>

                <div class="pm-scoreboard">
                    <div class="pm-team-col">
                        ${this._badgeImgHtml(c.eqMio, 'pm-badge')}
                        <div class="pm-team-name">${escHtml(c.cortoMio)}</div>
                        <div class="pm-scorers">${renderListaGoleadores(golesMiosDet)}</div>
                    </div>
                    <div class="pm-score-center">
                        <div class="pm-score-nums">
                            <span>${c.golesMios}</span>
                            <i>-</i>
                            <span>${c.golesOtro}</span>
                        </div>
                        ${penSub}
                    </div>
                    <div class="pm-team-col">
                        ${this._badgeImgHtml(c.eqOtro, 'pm-badge')}
                        <div class="pm-team-name">${escHtml(c.cortoOtro)}</div>
                        <div class="pm-scorers">${renderListaGoleadores(golesOtroDet)}</div>
                    </div>
                </div>

                ${bannerOnline}

                <div class="pm-tabs" role="tablist">
                    <button type="button" role="tab" data-pm-tab="resumen" class="${this._postMatchTab === 'resumen' ? 'on' : ''}">RESUMEN</button>
                    <button type="button" role="tab" data-pm-tab="estadisticas" class="${this._postMatchTab === 'estadisticas' ? 'on' : ''}">ESTADÍSTICAS</button>
                    <button type="button" role="tab" data-pm-tab="jugadores" class="${this._postMatchTab === 'jugadores' ? 'on' : ''}">RATINGS</button>
                    <button type="button" role="tab" data-pm-tab="eventos" class="${this._postMatchTab === 'eventos' ? 'on' : ''}">EVENTOS</button>
                </div>

                <div class="pm-body">${bodyTab}</div>

                <div class="pm-quick-tools">
                    <button type="button" class="pm-tool-btn" data-pm-act="toggle-stats">📊 ${labelToggleStats}</button>
                    ${btnGoles}
                </div>

                <div class="pm-actions">
                    ${btnPrimario}
                    ${btnSecundario}
                </div>
            </div>
        `;
    },

    _htmlTabResumen(c) {
        let html = '';

        // 0) Carteles especiales de Desafíos, Arcade, Historia, Copa o Supercopa
        if (c.modo === 'desafio' && c.desafio && c.desafio.evaluacion) {
            const ev = c.desafio.evaluacion;
            html += `
                <div class="pm-trophy-banner ${ev.exito ? 'gold' : 'ko'}">
                    <div class="pm-trophy-ico">${ev.exito ? '🏅' : '🎯'}</div>
                    <div>
                        <b>${escHtml(ev.resultado)} · MEDALLA: ${escHtml(ev.medalla)} (${ev.puntuacion} PTS)</b>
                        <p>${escHtml(ev.motivo)}</p>
                    </div>
                </div>
            `;
        } else if (c.modo === 'arcade' && c.arcade) {
            html += `
                <div class="pm-trophy-banner ok">
                    <div class="pm-trophy-ico">🕹</div>
                    <div>
                        <b>MODO CHAQUITO ARCADE (${escHtml(c.arcade.etiquetaReglas || '')})</b>
                        <p>Partido festivo independiente: las tablas y récords oficiales de Liga y Copa no se alteran.</p>
                    </div>
                </div>
            `;
        } else if (c.modo === 'historia' && c.historia && c.historia.evaluacion) {
            const eh = c.historia.evaluacion;
            html += `
                <div class="pm-trophy-banner ${eh.superado ? 'gold' : 'ko'}">
                    <div class="pm-trophy-ico">${eh.superado ? (eh.estrellaExtra ? '★★' : '★') : '📖'}</div>
                    <div>
                        <b>${eh.superado ? '¡CAPÍTULO SUPERADO!' : 'CAPÍTULO NO SUPERADO'}</b>
                        <p>${escHtml(eh.resumen)} ${eh.superado ? `· Recompensa: ${escHtml(c.historia.recompensa.descripcion)}` : ''}</p>
                    </div>
                </div>
            `;
        } else if (c.modo === 'supercopa' && c.resultadoSupercopa) {
            const gano = c.resultadoSupercopa.campeon;
            html += `
                <div class="pm-trophy-banner ${gano ? 'gold' : ''}">
                    <div class="pm-trophy-ico">${gano ? '🏆' : '🥈'}</div>
                    <div>
                        <b>${gano ? '¡SUPERCAMPEÓN CHAQUITO!' : 'SUBCAMPEÓN DE LA SUPERCOPA'}</b>
                        <p>${gano ? `${escHtml(c.nombreMio)} sumó la Supercopa Oficial a su palmarés.` : `${escHtml(c.nombreOtro)} se quedó con el trofeo de campeones.`}</p>
                    </div>
                </div>
            `;
        } else if (c.modo === 'copa' && c.resultadoCopa) {
            const rc = c.resultadoCopa;
            const tit = rc.campeon
                ? '🏆 ¡CAMPEÓN DE LA COPA CHAQUITO!'
                : rc.ganoLlave
                ? `✓ ¡CLASIFICADO A ${escHtml(rc.rondaSiguiente || 'LA SIGUIENTE RONDA')}!`
                : `✕ ELIMINADO EN ${escHtml(rc.rondaJugada)}`;
            html += `
                <div class="pm-trophy-banner ${rc.campeon ? 'gold' : rc.ganoLlave ? 'ok' : 'ko'}">
                    <div>
                        <b>${tit}</b>
                    </div>
                </div>
            `;
        }

        // 1) FIGURA DEL PARTIDO (MVP)
        if (c.figura) {
            const esMio = c.figura.team === c.ladoMio;
            const eqFig = esMio ? c.eqMio : c.eqOtro;
            const nomEq = esMio ? c.cortoMio : c.cortoOtro;
            const rol = c.figura.isGK ? 'ARQUERO' : 'CAMPO';
            html += `
                <div class="pm-mvp-card">
                    <div class="pm-mvp-head">★ FIGURA DEL PARTIDO</div>
                    <div class="pm-mvp-main">
                        ${this._badgeImgHtml(eqFig, 'pm-badge sm')}
                        <div class="pm-mvp-info">
                            <b>${escHtml(c.figura.nombre)}</b>
                            <small>${escHtml(nomEq)} · ${rol}</small>
                            <p>${escHtml(c.figura.resumen)}</p>
                        </div>
                        <div class="pm-rating-box ${claseRating(c.figura.rating)}">${c.figura.rating.toFixed(1)}</div>
                    </div>
                </div>
            `;
        }

        // 2) Racha expandida (Etapa 12) + Rivalidad (Etapa 13) + Reputación (Etapa 7)
        const paq = c.carrera;
        if (paq && paq.rachas) {
            const clsRacha = c.resultado === 'VICTORIA' ? 'pos' : (c.resultado === 'DERROTA' ? 'neg' : 'neu');
            const subRachas = [];
            if (paq.rachas.estado.partidosInvicto >= 2) subRachas.push(`Invicto: ${paq.rachas.estado.partidosInvicto}`);
            if (paq.rachas.estado.partidosMarcando >= 2) subRachas.push(`Marcando: ${paq.rachas.estado.partidosMarcando}`);
            if (paq.rachas.estado.vallasInvictasSeguidas >= 2) subRachas.push(`Valla en 0: ${paq.rachas.estado.vallasInvictasSeguidas}`);
            const extraTxt = subRachas.length ? ` · ${subRachas.join(' · ')}` : '';
            html += `<div class="pm-streak ${clsRacha}">🔥 ${escHtml(paq.rachas.mensajePrincipal + extraTxt)}</div>`;
        } else {
            const clsRacha = c.rachaActual > 0 ? 'pos' : (c.rachaActual < 0 ? 'neg' : 'neu');
            html += `<div class="pm-streak ${clsRacha}">${escHtml(this._textoRacha(c.rachaActual))}</div>`;
        }

        if (paq) {
            const repSt = CarreraStore.leer().reputacion;
            const dGen = paq.reputacion ? paq.reputacion.deltas.general : 0;
            const dSign = dGen > 0 ? `+${dGen}` : String(dGen);
            const riv = c.modo !== 'online' && c.eqMio && c.eqOtro
                ? CarreraStore.rivalidadEntre(c.eqMio.id, c.eqOtro.id)
                : null;
            const dRiv = paq.rivalidad ? paq.rivalidad.cambio : 0;

            html += `<div class="pm-career-strip">`;
            html += `<div class="pm-career-pill"><span>REPUTACIÓN</span><b>${repSt.general}/100 <em>(${dSign})</em></b><small>${escHtml(repSt.rango)}</small></div>`;
            if (riv && riv.nivel > 0) {
                html += `<div class="pm-career-pill ${riv.esClasico ? 'clasico' : ''}"><span>${riv.esClasico ? '🔥 CLÁSICO' : 'RIVALIDAD'}</span><b>${riv.nivel}/100${dRiv > 0 ? ` <em>(+${dRiv})</em>` : ''}</b><small>${escHtml(riv.etiqueta)}</small></div>`;
            }
            html += `</div>`;

            if (paq.reputacion && paq.reputacion.nuevosTitulos && paq.reputacion.nuevosTitulos.length > 0) {
                const noms = paq.reputacion.nuevosTitulos.map((t) => t.nombre).join(', ');
                html += `<div class="pm-unlock-pill">★ NUEVO TÍTULO DESBLOQUEADO: <b>${escHtml(noms)}</b></div>`;
            }
        }

        // 3) Conferencia Post-Partido interactiva (Etapa 6)
        if (paq && paq.conferencia) {
            const conf = paq.conferencia;
            if (!conf.respondida) {
                const btns = (conf.opciones || [])
                    .map(
                        (op) =>
                            `<button type="button" class="pm-conf-opt" data-conf-opt="${escHtml(op.id)}">💬 "${escHtml(op.texto)}"</button>`
                    )
                    .join('');
                html += `
                    <div class="pm-conf-box">
                        <div class="pm-conf-head">🎤 CONFERENCIA DE PRENSA · ${escHtml(conf.periodista)} (${escHtml(conf.medio)})</div>
                        <p class="pm-conf-q">${escHtml(conf.pregunta)}</p>
                        <div class="pm-conf-opts">${btns}</div>
                    </div>
                `;
            } else if (conf.respuestaElegida) {
                html += `
                    <div class="pm-conf-box answered">
                        <div class="pm-conf-head">🎤 DECLARACIÓN REGISTRADA EN EL DIARIO</div>
                        <p class="pm-conf-a">"${escHtml(conf.respuestaElegida.texto)}"</p>
                    </div>
                `;
            }
        }

        // 4) Noticia Chaquito del partido (Etapa 5)
        if (paq && paq.noticia) {
            const n = paq.noticia;
            html += `
                <div class="pm-news-card">
                    <div class="pm-news-head">
                        <span class="nw-tag">${escHtml(n.etiqueta || 'CRÓNICA')}</span>
                        <span>DIARIO CHAQUITO</span>
                    </div>
                    <div class="pm-news-title">${escHtml(n.titular)}</div>
                    <p class="pm-news-lead">${escHtml(n.bajada)}</p>
                </div>
            `;
        }

        // 5) Impacto en la tabla si es modo Liga
        if (c.modo === 'liga' && c.impactoLiga) {
            const imp = c.impactoLiga;
            const movTxt =
                imp.deltaPos > 0
                    ? `▲ +${imp.deltaPos}`
                    : imp.deltaPos < 0
                    ? `▼ ${imp.deltaPos}`
                    : '＝ SIN CAMBIO';
            const movCls = imp.deltaPos > 0 ? 'up' : (imp.deltaPos < 0 ? 'down' : 'same');
            const ptsDelta = imp.deltaPts > 0 ? `+${imp.deltaPts}` : '0';
            const dgSign = imp.dgDespues > 0 ? `+${imp.dgDespues}` : String(imp.dgDespues);

            let proxHtml = '';
            if (imp.proximo) {
                if (imp.proximo.terminada) {
                    const campEq = this._equipo(imp.proximo.campeonId);
                    proxHtml = imp.proximo.salioCampeon
                        ? '<div class="pm-liga-next champ">🏆 ¡CAMPEÓN DE LA LIGA CHAQUITO!</div>'
                        : `<div class="pm-liga-next">Temporada terminada · Campeón: <b>${escHtml(campEq ? campEq.nombre : imp.proximo.campeonId)}</b></div>`;
                } else if (imp.proximo.libre) {
                    proxHtml = `<div class="pm-liga-next">PRÓXIMA (FECHA ${imp.proximo.fecha}): <b>FECHA LIBRE</b></div>`;
                } else {
                    const eqProx = this._equipo(imp.proximo.rivalId);
                    proxHtml = `
                        <div class="pm-liga-next">
                            <span>PRÓXIMO RIVAL (F${imp.proximo.fecha}):</span>
                            ${this._badgeImgHtml(eqProx, 'pm-badge xs')}
                            <b>${escHtml(eqProx ? eqProx.corto : imp.proximo.rivalId)}</b>
                        </div>
                    `;
                }
            }

            html += `
                <div class="pm-liga-box">
                    <div class="pm-sec-title">IMPACTO EN LA TABLA</div>
                    <div class="pm-liga-grid">
                        <div class="pm-liga-cell">
                            <span>POSICIÓN</span>
                            <b>${imp.posAntes}° → ${imp.posDespues}°</b>
                            <em class="${movCls}">${movTxt}</em>
                        </div>
                        <div class="pm-liga-cell">
                            <span>PUNTOS</span>
                            <b>${imp.ptsDespues} PTS</b>
                            <em class="pts">(${ptsDelta})</em>
                        </div>
                        <div class="pm-liga-cell">
                            <span>DIF. GOL</span>
                            <b>${dgSign}</b>
                            <em>ANTES ${imp.dgAntes > 0 ? '+' + imp.dgAntes : imp.dgAntes}</em>
                        </div>
                    </div>
                    ${proxHtml}
                </div>
            `;
        }

        // 6) Mini comparativa de 4 métricas clave
        html += '<div class="pm-mini-stats">';
        html += this._htmlStatRow('POSESIÓN', `${c.stMio.posesionPct}%`, `${c.stOtro.posesionPct}%`, c.stMio.posesionPct, c.stOtro.posesionPct);
        html += this._htmlStatRow('TIROS (AL ARCO)', `${c.stMio.tiros} (${c.stMio.tirosAlArco})`, `${c.stOtro.tiros} (${c.stOtro.tirosAlArco})`, c.stMio.tiros, c.stOtro.tiros);
        html += this._htmlStatRow('PASES COMPLETADOS', `${c.stMio.pasesCompletados}/${c.stMio.pases}`, `${c.stOtro.pasesCompletados}/${c.stOtro.pases}`, c.stMio.pasesCompletados, c.stOtro.pasesCompletados);
        html += this._htmlStatRow('RECUPERACIONES', String(c.stMio.recuperaciones), String(c.stOtro.recuperaciones), c.stMio.recuperaciones, c.stOtro.recuperaciones);
        html += '</div>';

        return html;
    },

    _htmlStatRow(label, txtIzq, txtDer, valIzq, valDer) {
        const a = Math.max(0, Number(valIzq) || 0);
        const b = Math.max(0, Number(valDer) || 0);
        const tot = a + b;
        const pctIzq = tot > 0 ? Math.round((a / tot) * 100) : 50;
        const pctDer = 100 - pctIzq;
        return `
            <div class="pm-stat-row">
                <div class="pm-stat-vals">
                    <b class="l">${escHtml(txtIzq)}</b>
                    <span>${escHtml(label)}</span>
                    <b class="r">${escHtml(txtDer)}</b>
                </div>
                <div class="pm-stat-bar">
                    <i class="l" style="width:${pctIzq}%"></i>
                    <i class="r" style="width:${pctDer}%"></i>
                </div>
            </div>
        `;
    },

    _htmlTabEstadisticas(c) {
        const m = c.stMio;
        const r = c.stOtro;
        let h = '<div class="pm-stats-full">';
        h += this._htmlStatRow('POSESIÓN (%)', `${m.posesionPct}%`, `${r.posesionPct}%`, m.posesionPct, r.posesionPct);
        h += this._htmlStatRow('TIEMPO EN POSESIÓN', fmtSegundos(m.tiempoPosesion), fmtSegundos(r.tiempoPosesion), m.tiempoPosesion, r.tiempoPosesion);
        h += this._htmlStatRow('GOLES', String(c.golesMios), String(c.golesOtro), c.golesMios, c.golesOtro);
        h += this._htmlStatRow('TIROS TOTALES', String(m.tiros), String(r.tiros), m.tiros, r.tiros);
        h += this._htmlStatRow('TIROS AL ARCO', `${m.tirosAlArco} (${m.precisionTiro}%)`, `${r.tirosAlArco} (${r.precisionTiro}%)`, m.tirosAlArco, r.tirosAlArco);
        h += this._htmlStatRow('PASES COMPLETADOS', `${m.pasesCompletados}/${m.pases} (${m.precisionPases}%)`, `${r.pasesCompletados}/${r.pases} (${r.precisionPases}%)`, m.pasesCompletados, r.pasesCompletados);
        h += this._htmlStatRow('BARRIDAS (QUITES)', `${m.barridas} (${m.barridasExitosas})`, `${r.barridas} (${r.barridasExitosas})`, m.barridas, r.barridas);
        h += this._htmlStatRow('RECUPERACIONES', String(m.recuperaciones), String(r.recuperaciones), m.recuperaciones, r.recuperaciones);
        h += this._htmlStatRow('PÉRDIDAS DE BALÓN', String(m.perdidas), String(r.perdidas), m.perdidas, r.perdidas);
        h += this._htmlStatRow('ATAJADAS', String(m.atajadas), String(r.atajadas), m.atajadas, r.atajadas);
        h += this._htmlStatRow('ATAQUES / ÁREA', `${m.ataques} (${m.llegadasArea})`, `${r.ataques} (${r.llegadasArea})`, m.ataques, r.ataques);
        h += '</div>';
        return h;
    },

    _htmlTabJugadores(c) {
        if (!c.jugadores || !c.jugadores.length) {
            return '<div class="pm-empty">No hay valoraciones individuales registradas para este partido.</div>';
        }
        const mios = c.jugadores.filter((j) => j.team === c.ladoMio).sort((a, b) => b.rating - a.rating);
        const otros = c.jugadores.filter((j) => j.team === c.ladoRival).sort((a, b) => b.rating - a.rating);

        const bloqueEquipo = (titulo, lista) => {
            let b = `<div class="pm-ratings-group"><div class="pm-sec-title">${escHtml(titulo)}</div>`;
            for (const j of lista) {
                const mvp = j.esFigura ? '<span class="pm-mvp-pill">★ MVP</span>' : '';
                const rol = j.isGK ? '<span class="pm-role gk">GK</span>' : '<span class="pm-role">JUG</span>';
                const nums = j.isGK
                    ? `ATAJ ${j.atajadas} · PAS ${j.pasesCompletados}/${j.pases}`
                    : `G ${j.goles} · A ${j.asistencias} · TIR ${j.tiros} · PAS ${j.pasesCompletados}/${j.pases} · REC ${j.recuperaciones}`;
                b += `
                    <div class="pm-player-row${j.esFigura ? ' is-mvp' : ''}">
                        <div class="pm-player-left">
                            <div class="pm-player-name">${rol} <b>${escHtml(j.nombre)}</b> ${mvp}</div>
                            <div class="pm-player-sub">${escHtml(j.resumen)}</div>
                            <div class="pm-player-nums">${escHtml(nums)}</div>
                        </div>
                        <div class="pm-rating-box sm ${claseRating(j.rating)}">${j.rating.toFixed(1)}</div>
                    </div>
                `;
            }
            b += '</div>';
            return b;
        };

        return bloqueEquipo(c.cortoMio, mios) + bloqueEquipo(c.cortoOtro, otros);
    },

    _htmlTabEventos(c, clipsDisponibles) {
        const evs = (c.eventos || []).filter((e) => e.tipo !== 'fin');
        if (!evs.length) {
            return '<div class="pm-empty">Partido trabado en mitad de cancha, sin goles ni intervenciones de arco registradas.</div>';
        }
        let h = '<div class="pm-timeline">';
        for (const ev of evs) {
            const esMio = ev.team === c.ladoMio;
            const eqNom = esMio ? c.cortoMio : c.cortoOtro;
            if (ev.tipo === 'gol') {
                const asist = ev.asistidorNombre ? ` · Asist: ${escHtml(ev.asistidorNombre)}` : '';
                const btnRep =
                    ev.indice < clipsDisponibles
                        ? `<button type="button" class="pm-ev-replay" data-replay-gol="${ev.indice}">▶ VER</button>`
                        : '';
                h += `
                    <div class="pm-ev gol ${esMio ? 'mio' : 'riv'}">
                        <span class="pm-ev-min">${ev.minuto}'</span>
                        <div class="pm-ev-txt">
                            <b>⚽ ¡GOL DE ${escHtml(eqNom)}! (${ev.marcadorLocal}-${ev.marcadorRival})</b>
                            <small>${escHtml(ev.nombre)}${ev.enContra ? ' (en contra)' : ''}${asist}</small>
                        </div>
                        ${btnRep}
                    </div>
                `;
            } else if (ev.tipo === 'atajada') {
                h += `
                    <div class="pm-ev save">
                        <span class="pm-ev-min">${ev.minuto}'</span>
                        <div class="pm-ev-txt">
                            <b>🧤 Atajada de ${escHtml(ev.nombre)} (${escHtml(eqNom)})</b>
                            <small>${ev.subtipo === 'atrapada' ? 'Segura en dos tiempos' : 'Desvío salvador'}</small>
                        </div>
                    </div>
                `;
            } else if (ev.tipo === 'barrida') {
                h += `
                    <div class="pm-ev tackle">
                        <span class="pm-ev-min">${ev.minuto}'</span>
                        <div class="pm-ev-txt">
                            <b>⚡ Quite limpio de ${escHtml(ev.nombre)} (${escHtml(eqNom)})</b>
                        </div>
                    </div>
                `;
            }
        }
        h += `<div class="pm-ev end"><span class="pm-ev-min">90'</span><div class="pm-ev-txt"><b>🏁 Final del partido (${c.golesMios} - ${c.golesOtro})</b></div></div>`;
        h += '</div>';
        return h;
    },

    _onPostMatchClick(e) {
        const confBtn = e.target.closest('[data-conf-opt]');
        if (confBtn) {
            const c = this._postMatchContext;
            if (c && c.carrera && c.carrera.conferencia && !c.carrera.conferencia.respondida) {
                const res = CarreraStore.responderConferencia(c.carrera.conferencia, confBtn.dataset.confOpt, {
                    miEquipoId: c.eqMio ? c.eqMio.id : '',
                    rivalId: c.eqOtro ? c.eqOtro.id : '',
                    nombreMio: c.cortoMio,
                    nombreRival: c.cortoOtro,
                });
                if (res && res.reputacion && c.carrera.reputacion) {
                    c.carrera.reputacion.deltas.general += res.reputacion.deltas.general;
                }
                if (typeof this._actualizarIndicadorNoticias === 'function') this._actualizarIndicadorNoticias();
                this._renderPostPartido();
            }
            return;
        }

        const tabBtn = e.target.closest('[data-pm-tab]');
        if (tabBtn) {
            this._postMatchTab = tabBtn.dataset.pmTab || 'resumen';
            this._renderPostPartido();
            return;
        }

        const repBtn = e.target.closest('[data-replay-gol]');
        if (repBtn) {
            const idx = Number(repBtn.dataset.replayGol) || 0;
            this.abrirReplayPostPartido(idx);
            return;
        }

        const actBtn = e.target.closest('[data-pm-act]');
        if (!actBtn || actBtn.disabled) return;
        const act = actBtn.dataset.pmAct;

        if (act === 'toggle-stats') {
            this._postMatchTab = this._postMatchTab === 'estadisticas' ? 'resumen' : 'estadisticas';
            this._renderPostPartido();
            const root = document.getElementById('postmatch-screen');
            if (root) root.scrollTop = 0;
            return;
        }
        if (act === 'ver-goles') {
            this.abrirReplayPostPartido(0);
            return;
        }
        if (act === 'reintentar-desafio') {
            const id = this.modoDesafio ? this.modoDesafio.id : 'remontada';
            this._resetPostPartido();
            if (typeof this._iniciarDesafio === 'function') this._iniciarDesafio(id);
            return;
        }
        if (act === 'volver-desafios') {
            this._resetPostPartido();
            this.modoDesafio = null;
            if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('desafios');
            else this._showMainMenu();
            return;
        }
        if (act === 'revancha-arcade') {
            const reglas = this.modoArcade ? this.modoArcade.reglas : null;
            this._resetPostPartido();
            if (reglas && typeof this._iniciarPartidoArcade === 'function') this._iniciarPartidoArcade(reglas);
            else this._initMatch();
            return;
        }
        if (act === 'volver-arcade') {
            this._resetPostPartido();
            this.modoArcade = null;
            if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('arcade');
            else this._showMainMenu();
            return;
        }
        if (act === 'volver-historia') {
            this._resetPostPartido();
            this.modoHistoria = null;
            if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('historia');
            else this._showMainMenu();
            return;
        }
        if (act === 'continuar-liga' || act === 'continuar-copa') {
            this._resetPostPartido();
            this._showMainMenu(); // detecta modoLiga o modoCopa y abre su pantalla
            return;
        }
        if (act === 'abrir-supercopa') {
            this._resetPostPartido();
            this.modoSupercopa = null;
            this._showMainMenu();
            if (this.supercopa) this.supercopa.abrirMenu();
            return;
        }
        if (act === 'menu-forzado') {
            this._resetPostPartido();
            this.modoLiga = null;
            this.modoCopa = null;
            this.modoSupercopa = null;
            this.modoDesafio = null;
            this.modoArcade = null;
            this.modoHistoria = null;
            this._showMainMenu();
            return;
        }
        if (act === 'revancha') {
            if (this.enLinea) {
                if (typeof this._pedirRevancha === 'function') this._pedirRevancha(true);
                this._renderPostPartido();
            } else {
                this._resetPostPartido();
                this._initMatch();
            }
            return;
        }
        if (act === 'menu') {
            if (this.enLinea) {
                this._resetPostPartido();
                if (typeof this._pedirRevancha === 'function') this._pedirRevancha(false);
                this._salirDeLinea(false);
            } else {
                this._resetPostPartido();
                this._showMainMenu();
            }
        }
    },

    _manejarTeclaPostPartido(code) {
        if (this._postMatchPhase === 'celebracion') {
            if (code === 'Enter' || code === 'Space' || code === 'Escape') {
                this._abrirPanelPostPartido();
                return true;
            }
            return true;
        }
        if (!this._postPartidoVisible()) return false;

        const tabs = ['resumen', 'estadisticas', 'jugadores', 'eventos'];
        if (code === 'ArrowRight' || code === 'KeyD') {
            const idx = (tabs.indexOf(this._postMatchTab) + 1) % tabs.length;
            this._postMatchTab = tabs[idx];
            this._renderPostPartido();
            return true;
        }
        if (code === 'ArrowLeft' || code === 'KeyA') {
            const idx = (tabs.indexOf(this._postMatchTab) + tabs.length - 1) % tabs.length;
            this._postMatchTab = tabs[idx];
            this._renderPostPartido();
            return true;
        }
        if (code === 'KeyG' && this._golesReplayDisponibles().length > 0) {
            this.abrirReplayPostPartido(0);
            return true;
        }
        if (code === 'Enter' || code === 'Space') {
            if (this.modoDesafio && typeof this._iniciarDesafio === 'function') {
                const id = this.modoDesafio.id;
                this._resetPostPartido();
                this._iniciarDesafio(id);
            } else if (this.modoArcade && typeof this._iniciarPartidoArcade === 'function') {
                const reglas = this.modoArcade.reglas;
                this._resetPostPartido();
                this._iniciarPartidoArcade(reglas);
            } else if (this.modoHistoria && typeof this._abrirModosExtra === 'function') {
                this._resetPostPartido();
                this.modoHistoria = null;
                this._abrirModosExtra('historia');
            } else if (this.modoLiga || this.modoCopa) {
                this._resetPostPartido();
                this._showMainMenu();
            } else if (this.modoSupercopa) {
                this._resetPostPartido();
                this.modoSupercopa = null;
                this._showMainMenu();
                if (this.supercopa) this.supercopa.abrirMenu();
            } else if (this.enLinea) {
                if (this._revanchaVoto !== true && typeof this._pedirRevancha === 'function') {
                    this._pedirRevancha(true);
                    this._renderPostPartido();
                }
            } else {
                this._resetPostPartido();
                this._initMatch();
            }
            return true;
        }
        if (code === 'Escape') {
            this._resetPostPartido();
            if (this.enLinea) {
                if (typeof this._pedirRevancha === 'function') this._pedirRevancha(false);
                this._salirDeLinea(false);
            } else {
                this._showMainMenu();
            }
            return true;
        }
        return false;
    },

    /** Celebración final sobre el césped antes de desplegar la pantalla Post-Partido. */
    _drawFinalCelebrationOverlay(ctx) {
        const g = this.gestor;
        if (!g || !g.cartel) return;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const alpha = Math.max(0, Math.min(1, g.cartelAlpha || 0));
        const scale = g.cartelScale || 1;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(2, 8, 22, ${(0.38 * alpha).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);

        let cut = this.assets['cartel_' + g.cartel];
        if (!cut || cut.__missing || cut.width <= 1) cut = this._cartelRecortado(g.cartel);
        const cx = W / 2;
        const cy = H * 0.42;

        if (cut && cut.width > 1) {
            const maxW = 350 * scale;
            const maxH = 180 * scale;
            const k = Math.min(maxW / cut.width, maxH / cut.height);
            const dw = cut.width * k;
            const dh = cut.height * k;
            ctx.drawImage(cut, cx - dw / 2, cy - dh / 2, dw, dh);
        } else {
            const colors = { VICTORIA: '#48e078', DERROTA: '#ff626c', EMPATE: '#ffd45a' };
            ctx.fillStyle = colors[g.cartel] || '#ffcc00';
            ctx.font = 'bold 42px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeText(g.cartel, cx, cy);
            ctx.fillText(g.cartel, cx, cy);
        }

        const soyVis = this.enLinea && this.rolEnLinea === 'Visitante';
        const gl = soyVis ? g.golesRival : g.golesLocal;
        const gr = soyVis ? g.golesLocal : g.golesRival;
        const ganoFinalEspecial =
            !this.enLinea &&
            this._eventoEspecial &&
            this._eventoEspecial.esFinal &&
            (gl > gr || (this._resultadoPenales && this._resultadoPenales.ganador === 'mio'));

        if (ganoFinalEspecial) {
            ctx.fillStyle = 'rgba(46, 36, 5, 0.92)';
            ctx.fillRect(cx - 148, cy - 118, 296, 26);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx - 148, cy - 118, 296, 26);
            ctx.fillStyle = '#ffe580';
            ctx.font = 'bold 12px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`🏆 ¡CAMPEÓN! · ${this._eventoEspecial.etiqueta}`, cx, cy - 105);
        }

        ctx.fillStyle = 'rgba(4, 12, 28, 0.85)';
        ctx.fillRect(cx - 88, cy + 74, 176, 36);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 88, cy + 74, 176, 36);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${gl}  -  ${gr}`, cx, cy + 92);

        ctx.fillStyle = '#dce8f7';
        ctx.font = 'bold 11px Courier New';
        ctx.fillText('FINAL DEL PARTIDO · ABRIENDO RESUMEN…', cx, H - 38);
        ctx.restore();
    },
});

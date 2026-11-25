import { Game } from '../game.js';
import {
    DESAFIOS_CATALOGO,
    obtenerDesafio,
    crearEstadoActivoDesafio,
    DesafiosStore,
} from '../career/desafios.js';
import {
    PRESETS_ARCADE,
    normalizarReglasArcade,
    resumirReglasArcade,
    ArcadeStore,
} from '../career/arcade.js';
import {
    construirCapitulosHistoria,
    HistoriaStore,
} from '../career/historia.js';
import { CarreraStore } from '../career/store.js';

/**
 * Pantallas y lanzadores de FASE D — MODOS EXTRA (`#extra-modes-screen`):
 *   - Etapa 19: Modo Desafíos
 *   - Etapa 20: Modo Chaquito Arcade
 *   - Etapa 24: Modo Historia
 */

function escEx(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

Object.assign(Game.prototype, {
    _initModosExtraUI() {
        if (this._modosExtraBound) return;
        this._modosExtraBound = true;
        this._modoExtraVista = 'desafios'; // 'desafios' | 'arcade' | 'historia'
        this._arcadeReglasDraft = ArcadeStore.leer().reglas;
        this._arcadeLocalId = 'retoneta';
        this._arcadeRivalId = 'el_boguero';

        const root = document.getElementById('extra-modes-screen');
        if (root) {
            root.addEventListener('click', (e) => this._onModosExtraClick(e));
            root.addEventListener('change', (e) => this._onModosExtraChange(e));
        }
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this._modosExtraVisible()) {
                e.preventDefault();
                this._cerrarModosExtra();
            }
        });
    },

    _modosExtraVisible() {
        const root = document.getElementById('extra-modes-screen');
        return !!(root && !root.hidden);
    },

    _abrirModosExtra(vista = 'desafios') {
        this._initModosExtraUI();
        this._modoExtraVista = ['desafios', 'arcade', 'historia'].includes(vista) ? vista : 'desafios';
        const root = document.getElementById('extra-modes-screen');
        if (!root) return;

        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const modes = document.getElementById('mode-menu');
        if (modes) modes.hidden = true;
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        if (this.liga) this.liga.ocultar();
        if (this.copa) this.copa.ocultar();
        const news = document.getElementById('news-screen');
        if (news) news.hidden = true;
        const club = document.getElementById('club-screen');
        if (club) club.hidden = true;

        this.menuVisible = true;
        root.hidden = false;
        this._renderModosExtra();
        root.scrollTop = 0;
    },

    _cerrarModosExtra() {
        const root = document.getElementById('extra-modes-screen');
        if (root) root.hidden = true;
        this._showMainMenu();
    },

    _renderModosExtra() {
        const root = document.getElementById('extra-modes-screen');
        if (!root) return;

        let body;
        let titulo = '🎯 MODO DESAFÍOS';
        if (this._modoExtraVista === 'arcade') {
            titulo = '🕹 CHAQUITO ARCADE';
            body = this._htmlVistaArcade();
        } else if (this._modoExtraVista === 'historia') {
            titulo = '📖 MODO HISTORIA';
            body = this._htmlVistaHistoria();
        } else {
            body = this._htmlVistaDesafios();
        }

        root.innerHTML = `
            <div class="lg-wrap nw-wrap mc-wrap">
                <h2 class="lg-title">${titulo}</h2>
                <div class="lg-tabs nw-tabs" role="tablist">
                    <button type="button" role="tab" data-ex-tab="desafios" class="${this._modoExtraVista === 'desafios' ? 'on' : ''}">🎯 DESAFÍOS</button>
                    <button type="button" role="tab" data-ex-tab="arcade" class="${this._modoExtraVista === 'arcade' ? 'on' : ''}">🕹 ARCADE</button>
                    <button type="button" role="tab" data-ex-tab="historia" class="${this._modoExtraVista === 'historia' ? 'on' : ''}">📖 HISTORIA</button>
                </div>
                <div class="nw-body">${body}</div>
                <div class="lg-actions">
                    <button type="button" class="action-btn secondary" data-ex-act="volver">VOLVER AL MENÚ</button>
                </div>
            </div>
        `;
    },

    _htmlVistaDesafios() {
        const completados = DesafiosStore.totalCompletados();
        const total = DESAFIOS_CATALOGO.length;
        const cards = DESAFIOS_CATALOGO.map((d) => {
            const prog = DesafiosStore.progresoDe(d.id);
            const eqL = this._equipo(d.equipoSugerido);
            const eqR = this._equipo(d.rivalSugerido);
            const medColor =
                prog.mejorMedalla === 'ORO'
                    ? '#ffcc00'
                    : prog.mejorMedalla === 'PLATA'
                    ? '#dce8f7'
                    : prog.mejorMedalla === 'BRONCE'
                    ? '#e29856'
                    : '#7b8ba5';
            return `
                <div class="nw-rep-card" style="margin-bottom:8px;border-color:${prog.completado ? '#48e078' : '#26477a'}">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                        <b style="color:#ffcc00;font-size:11px">${d.icono} ${escEx(d.nombre)}</b>
                        <span style="font-size:9px;color:${medColor}">★ ${escEx(prog.mejorMedalla)} · RÉCORD: ${prog.mejorPuntaje} PTS</span>
                    </div>
                    <p class="lg-mini" style="margin:5px 0">${escEx(d.objetivo)}</p>
                    <div style="font-size:8.5px;color:#9ecbff;line-height:1.5;margin-bottom:6px">
                        <div>⏱ <b>Tiempo:</b> ${d.tiempo}s · <b>Cruce:</b> ${escEx(eqL ? eqL.corto : d.equipoSugerido)} vs ${escEx(eqR ? eqR.corto : d.rivalSugerido)}</div>
                        <div>✓ <b>Victoria:</b> ${escEx(d.condicionVictoria)}</div>
                        <div>✕ <b>Derrota:</b> ${escEx(d.condicionDerrota)}</div>
                    </div>
                    <button type="button" class="action-btn" data-ex-desafio="${escEx(d.id)}" style="width:100%">
                        ${prog.completado ? 'REJUGAR DESAFÍO' : 'JUGAR DESAFÍO'}
                    </button>
                </div>
            `;
        }).join('');

        return `
            <p class="lg-mini" style="margin-bottom:8px">
                Superados: <b style="color:#48e078">${completados}/${total}</b> · No modifica tu Liga ni Copa. Superar 1 desafío desbloquea la celebración <b>🤸 Mortal en el Aire</b>.
            </p>
            ${cards}
        `;
    },

    _htmlVistaArcade() {
        const stArc = ArcadeStore.leer();
        const r = normalizarReglasArcade(this._arcadeReglasDraft);
        const catalogo = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS : [];

        const optsLocal = catalogo
            .map((e) => `<option value="${escEx(e.id)}"${e.id === this._arcadeLocalId ? ' selected' : ''}>${escEx(e.nombre)}</option>`)
            .join('');
        const optsRival = catalogo
            .filter((e) => e.id !== this._arcadeLocalId)
            .map((e) => `<option value="${escEx(e.id)}"${e.id === this._arcadeRivalId ? ' selected' : ''}>${escEx(e.nombre)}</option>`)
            .join('');

        const presetsHtml = PRESETS_ARCADE.map(
            (p) => `
                <button type="button" class="pm-tool-btn" data-ex-preset="${escEx(p.id)}" title="${escEx(p.desc)}">
                    ${escEx(p.nombre)}
                </button>
            `
        ).join('');

        return `
            <div class="nw-rep-card" style="margin-bottom:8px">
                <div class="pm-sec-title">MODO EXPERIMENTAL · SEPARADO DE LIGA Y COPA</div>
                <p class="lg-mini" style="margin:4px 0">Partidos jugados en Arcade: <b>${stArc.partidos}</b> · Victorias: <b>${stArc.victorias}</b> · Goles Arcade: <b>${stArc.golesArcade}</b></p>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${presetsHtml}</div>
            </div>

            <div class="nw-rep-card" style="margin-bottom:8px">
                <div class="pm-sec-title">CONFIGURAR REGLAS ESPECIALES</div>
                <div class="mc-squad-grid" style="margin-bottom:8px">
                    <div class="mc-player-chip">
                        <span>TU EQUIPO</span>
                        <select id="arc-sel-local" style="width:100%;margin-top:4px">${optsLocal}</select>
                    </div>
                    <div class="mc-player-chip">
                        <span>RIVAL</span>
                        <select id="arc-sel-rival" style="width:100%;margin-top:4px">${optsRival}</select>
                    </div>
                    <div class="mc-player-chip">
                        <span>DURACIÓN</span>
                        <select id="arc-sel-dur" style="width:100%;margin-top:4px">
                            <option value="45"${r.duracionSeg === 45 ? ' selected' : ''}>45s (Corto)</option>
                            <option value="60"${r.duracionSeg === 60 ? ' selected' : ''}>60s (Ágil)</option>
                            <option value="90"${r.duracionSeg === 90 ? ' selected' : ''}>90s (Completo)</option>
                        </select>
                    </div>
                    <div class="mc-player-chip">
                        <span>VELOCIDAD</span>
                        <select id="arc-sel-vel" style="width:100%;margin-top:4px">
                            <option value="normal"${r.velocidadJuego === 'normal' ? ' selected' : ''}>Normal</option>
                            <option value="turbo"${r.velocidadJuego === 'turbo' ? ' selected' : ''}>Turbo (+18%)</option>
                            <option value="relampago"${r.velocidadJuego === 'relampago' ? ' selected' : ''}>Relámpago (+32%)</option>
                        </select>
                    </div>
                </div>

                <div class="mc-player-chip" style="margin-bottom:8px">
                    <span>VALOR ESPECIAL DE GOLES</span>
                    <select id="arc-sel-esp" style="width:100%;margin-top:4px">
                        <option value="normal"${r.golesEspeciales === 'normal' ? ' selected' : ''}>Clásico (1 gol)</option>
                        <option value="larga_distancia"${r.golesEspeciales === 'larga_distancia' ? ' selected' : ''}>Bombazo desde lejos vale +1 extra</option>
                        <option value="gol_de_oro"${r.golesEspeciales === 'gol_de_oro' ? ' selected' : ''}>⚡ Gol de Oro (el primero gana)</option>
                    </select>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;font-size:9px">
                    <label class="cfg-check"><input type="checkbox" id="arc-chk-ball" ${r.pelotaRapida ? 'checked' : ''}> ☄ Pelota más rápida</label>
                    <label class="cfg-check"><input type="checkbox" id="arc-chk-x2" ${r.golDoble ? 'checked' : ''}> 2X Gol doble permanente</label>
                    <label class="cfg-check"><input type="checkbox" id="arc-chk-furia" ${r.modoFuria ? 'checked' : ''}> 🔥 Modo Furia (sin fatiga)</label>
                    <label class="cfg-check"><input type="checkbox" id="arc-chk-ev" ${r.eventosTemporales ? 'checked' : ''}> 🎲 Eventos temporales en vivo</label>
                </div>

                <p class="lg-mini" style="margin-top:8px;color:#ffcc00">Resumen activo: <b>${escEx(resumirReglasArcade(r))}</b></p>
                <button type="button" class="action-btn" data-ex-act="iniciar-arcade" style="width:100%;margin-top:6px">🕹 ¡JUGAR CHAQUITO ARCADE!</button>
            </div>
        `;
    },

    _htmlVistaHistoria() {
        const stH = HistoriaStore.leer();
        const catalogo = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS : [];
        const capitulos = construirCapitulosHistoria(stH.clubId);

        const optsClub = catalogo
            .map((e) => `<option value="${escEx(e.id)}"${e.id === stH.clubId ? ' selected' : ''}>${escEx(e.nombre)}</option>`)
            .join('');

        const listaHtml = capitulos
            .map((cap) => {
                const comp = stH.completados[cap.id];
                const habilitado = cap.orden <= stH.capituloActual;
                const eqRiv = this._equipo(cap.rivalId);
                const estadoTxt = comp && comp.superado
                    ? `✓ SUPERADO ${comp.estrellaExtra ? '★★' : '★'} (${escEx(comp.marcador || '')})`
                    : habilitado
                    ? '▶ DISPONIBLE'
                    : '🔒 BLOQUEADO';
                return `
                    <div class="nw-rep-card" style="margin-bottom:8px;opacity:${habilitado ? '1' : '0.62'};border-color:${comp && comp.superado ? '#48e078' : habilitado ? '#ffcc00' : '#26477a'}">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                            <b style="color:#ffcc00;font-size:10.5px">${escEx(cap.titulo)}</b>
                            <span style="font-size:8.5px;color:${comp && comp.superado ? '#48e078' : '#ffe580'}">${estadoTxt}</span>
                        </div>
                        <p class="lg-mini" style="margin:5px 0">${escEx(cap.relato)}</p>
                        <div style="font-size:8.5px;color:#9ecbff;line-height:1.5;margin-bottom:6px">
                            <div>🆚 <b>Rival:</b> ${escEx(eqRiv ? eqRiv.nombre : cap.rivalId)} · <b>Clima:</b> ${escEx(cap.clima.toUpperCase())}</div>
                            <div>🎯 <b>Objetivo:</b> ${escEx(cap.objetivo)}</div>
                            <div>★ <b>Estrella extra:</b> ${escEx(cap.objetivoExtra)} · <b>Recompensa:</b> ${escEx(cap.recompensa.descripcion)}</div>
                        </div>
                        ${
                            habilitado
                                ? `<button type="button" class="action-btn" data-ex-historia="${escEx(cap.id)}" style="width:100%">${comp && comp.superado ? 'REJUGAR CAPÍTULO' : 'JUGAR CAPÍTULO'}</button>`
                                : ''
                        }
                    </div>
                `;
            })
            .join('');

        return `
            <div class="nw-club-picker" style="margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <label for="hist-club-sel">CLUB PROTAGONISTA:</label>
                <select id="hist-club-sel">${optsClub}</select>
                <button type="button" class="pm-tool-btn" data-ex-act="reiniciar-historia">REINICIAR CAMPAÑA</button>
            </div>
            ${
                stH.campanaCompletada
                    ? `<div class="pm-trophy-banner gold" style="margin-bottom:8px"><div class="pm-trophy-ico">👑</div><div><b>¡CAMPAÑA COMPLETADA!</b><p>Desbloqueaste la celebración especial Corona Dorada y dejaste huella en Chaquito.</p></div></div>`
                    : ''
            }
            ${listaHtml}
        `;
    },

    _leerFormularioArcade() {
        const root = document.getElementById('extra-modes-screen');
        if (!root) return this._arcadeReglasDraft;
        const val = (id, fb) => {
            const el = root.querySelector('#' + id);
            return el ? el.value : fb;
        };
        const chk = (id) => {
            const el = root.querySelector('#' + id);
            return !!(el && el.checked);
        };
        this._arcadeLocalId = val('arc-sel-local', this._arcadeLocalId || 'retoneta');
        const candRiv = val('arc-sel-rival', this._arcadeRivalId || 'el_boguero');
        this._arcadeRivalId = candRiv === this._arcadeLocalId ? (candRiv === 'retoneta' ? 'el_boguero' : 'retoneta') : candRiv;
        this._arcadeReglasDraft = normalizarReglasArcade({
            duracionSeg: Number(val('arc-sel-dur', 60)),
            velocidadJuego: val('arc-sel-vel', 'turbo'),
            golesEspeciales: val('arc-sel-esp', 'normal'),
            pelotaRapida: chk('arc-chk-ball'),
            golDoble: chk('arc-chk-x2'),
            modoFuria: chk('arc-chk-furia'),
            eventosTemporales: chk('arc-chk-ev'),
        });
        return this._arcadeReglasDraft;
    },

    _onModosExtraChange(e) {
        const t = e.target;
        if (!t) return;
        if (t.id === 'hist-club-sel') {
            HistoriaStore.iniciarNuevaCampana(t.value);
            CarreraStore.fijarClubActual(t.value);
            this._renderModosExtra();
            return;
        }
        if (t.id && t.id.startsWith('arc-')) {
            this._leerFormularioArcade();
            this._renderModosExtra();
        }
    },

    _onModosExtraClick(e) {
        const tabBtn = e.target.closest('[data-ex-tab]');
        if (tabBtn) {
            this._modoExtraVista = tabBtn.dataset.exTab;
            this._renderModosExtra();
            return;
        }

        const presetBtn = e.target.closest('[data-ex-preset]');
        if (presetBtn) {
            const pr = PRESETS_ARCADE.find((p) => p.id === presetBtn.dataset.exPreset);
            if (pr) {
                this._arcadeReglasDraft = normalizarReglasArcade(pr.reglas);
                this._renderModosExtra();
            }
            return;
        }

        const desBtn = e.target.closest('[data-ex-desafio]');
        if (desBtn) {
            this._iniciarDesafio(desBtn.dataset.exDesafio);
            return;
        }

        const histBtn = e.target.closest('[data-ex-historia]');
        if (histBtn) {
            this._iniciarCapituloHistoria(histBtn.dataset.exHistoria);
            return;
        }

        const actBtn = e.target.closest('[data-ex-act]');
        if (!actBtn) return;
        const act = actBtn.dataset.exAct;
        if (act === 'iniciar-arcade') {
            const reglas = ArcadeStore.guardarReglas(this._leerFormularioArcade());
            this._iniciarPartidoArcade(reglas);
        } else if (act === 'reiniciar-historia') {
            const st = HistoriaStore.leer();
            HistoriaStore.iniciarNuevaCampana(st.clubId || 'retoneta');
            this._renderModosExtra();
        } else if (act === 'volver') {
            this._cerrarModosExtra();
        }
    },

    _limpiarModosEspecialesActivos() {
        this.modoLiga = null;
        this.modoCopa = null;
        this.modoSupercopa = null;
        this.modoDesafio = null;
        this.modoArcade = null;
        this.modoHistoria = null;
    },

    _iniciarDesafio(desafioId) {
        const def = obtenerDesafio(desafioId);
        const root = document.getElementById('extra-modes-screen');
        if (root) root.hidden = true;

        this._limpiarModosEspecialesActivos();
        this.seleccion.local = def.equipoSugerido || 'retoneta';
        this.seleccion.rival = def.rivalSugerido || 'el_boguero';
        this.seleccion.dificultad = def.dificultad || 'normal';
        this.seleccion.clima = def.clima || 'noche';
        this.modoDesafio = crearEstadoActivoDesafio(def.id);

        if (def.tipoMotor === 'penales') {
            // Desafío directo de penales usando el motor real de tanda
            const goPen = () => {
                const menu = document.getElementById('main-menu');
                this.menuVisible = false;
                if (menu) menu.style.display = 'none';
                this._playSoundtrack();
                this._initMatch();
                this.gestor.estado = EstadoPartido.FINALIZADO;
                this.iniciarTandaPenales({
                    titulo: `🎯 DESAFÍO · ${def.nombre}`,
                    onFinish: (resPen) => {
                        this._resultadoPenales = resPen;
                        this.gestor.cartel = resPen.ganador === 'mio' ? 'VICTORIA' : 'DERROTA';
                        if (typeof this._cerrarDesafioAlFinalizar === 'function') {
                            this._cerrarDesafioAlFinalizar();
                        }
                    },
                });
            };
            if (typeof this._ensureMatchAssets === 'function') this._ensureMatchAssets(goPen);
            else goPen();
            return;
        }

        this._startMatchFromMenu();
    },

    _iniciarPartidoArcade(reglas) {
        const root = document.getElementById('extra-modes-screen');
        if (root) root.hidden = true;

        this._limpiarModosEspecialesActivos();
        this.seleccion.local = this._arcadeLocalId || 'retoneta';
        this.seleccion.rival = this._arcadeRivalId || 'el_boguero';
        this.seleccion.dificultad = this.dificultadPreferida || 'normal';
        this.seleccion.clima = 'noche';
        this.modoArcade = {
            reglas: normalizarReglasArcade(reglas),
            etiquetaReglas: resumirReglasArcade(reglas),
            registrado: false,
        };
        this._startMatchFromMenu();
    },

    _iniciarCapituloHistoria(capituloId) {
        const stH = HistoriaStore.leer();
        const caps = construirCapitulosHistoria(stH.clubId);
        const cap = caps.find((c) => c.id === capituloId) || caps[0];
        if (!cap || cap.orden > stH.capituloActual) return;

        const root = document.getElementById('extra-modes-screen');
        if (root) root.hidden = true;

        this._limpiarModosEspecialesActivos();
        this.seleccion.local = stH.clubId || 'retoneta';
        this.seleccion.rival = cap.rivalId;
        this.seleccion.dificultad = cap.dificultad || 'normal';
        this.seleccion.clima = cap.clima || 'noche';
        this.modoHistoria = {
            ...cap,
            clubId: stH.clubId || 'retoneta',
            registrado: false,
            penalesResueltos: false,
            evaluacion: null,
        };
        this._startMatchFromMenu();
    },
});

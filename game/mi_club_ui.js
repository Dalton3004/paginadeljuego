import { Game } from '../game.js';
import { CarreraStore } from '../career/store.js';
import { construirFichaMiClub } from '../career/mi_club.js';
import { construirHistorialYPalmares, calcularRecordsReales } from '../career/records_palmares.js';
import { EquipoFavoritoStore } from '../career/favorito_perfil.js';
import { AuthStore } from '../settings.js';
import { RASGOS } from '../career/atributos.js';
import { DesafiosStore } from '../career/desafios.js';
import { HistoriaStore } from '../career/historia.js';
import { LigaStore } from '../liga.js';
import { CopaStore } from '../copa.js';
import { SupercopaStore } from '../supercopa.js';
import { HistorialLocalStore } from '../perfil.js';

/**
 * ETAPA 17, 21, 22, 23, 29, 30 y 31 — Pantalla dedicada `MI CLUB` (`#club-screen`).
 *
 * Centraliza equipo, Equipo Favorito explícito, plantel con atributos/rasgos, estado físico,
 * celebraciones de gol, camisetas titular/alternativa, estadísticas históricas, vitrina visual,
 * historial permanente de temporadas/competiciones y los 8 récords históricos reales.
 */

function escClub(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

Object.assign(Game.prototype, {
    _initMiClubUI() {
        if (this._miClubBound) return;
        this._miClubBound = true;
        this._miClubTab = 'resumen'; // 'resumen' | 'vitrina' | 'campanas' | 'palmares'
        this._miClubOrigen = 'menu';

        const root = document.getElementById('club-screen');
        if (root) {
            root.addEventListener('click', (e) => this._onMiClubClick(e));
            root.addEventListener('change', (e) => {
                if (e.target && e.target.id === 'mc-club-sel') {
                    CarreraStore.fijarClubActual(e.target.value);
                    this._renderMiClub();
                }
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this._miClubVisible()) {
                e.preventDefault();
                this._cerrarMiClub();
            }
        });
    },

    _miClubVisible() {
        const root = document.getElementById('club-screen');
        return !!(root && !root.hidden);
    },

    _abrirMiClub(origen = 'menu', clubForzado = '') {
        this._initMiClubUI();
        this._miClubOrigen = origen || 'menu';
        const root = document.getElementById('club-screen');
        if (!root) return;

        if (clubForzado) {
            CarreraStore.fijarClubActual(clubForzado);
        }

        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        if (this.liga) this.liga.ocultar();
        if (this.copa) this.copa.ocultar();
        const news = document.getElementById('news-screen');
        if (news) news.hidden = true;

        this.menuVisible = true;
        root.hidden = false;
        this._renderMiClub();
        root.scrollTop = 0;
    },

    _cerrarMiClub() {
        const root = document.getElementById('club-screen');
        if (root) root.hidden = true;
        if (this._miClubOrigen === 'liga' && this.liga && this.liga.liga) {
            this.liga.mostrar();
            return;
        }
        if (this._miClubOrigen === 'copa' && this.copa && this.copa.copa) {
            this.copa.mostrar();
            return;
        }
        this._showMainMenu();
    },

    _renderMiClub() {
        const root = document.getElementById('club-screen');
        if (!root) return;

        const st = CarreraStore.leer();
        const catalogo = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS : [];
        const ligaAct = (this.liga && this.liga.liga) || LigaStore.actual();
        const favId = EquipoFavoritoStore.obtener();
        // El club favorito es explícito; si se eligió y no hay club forzado en carrera, abre ese por comodidad
        const clubId =
            st.clubActualId ||
            favId ||
            (ligaAct && ligaAct.miEquipo) ||
            (catalogo[0] && catalogo[0].id) ||
            'retoneta';

        const copaHist = CopaStore.historial();
        const supercopaHist = SupercopaStore.historial();
        const histPartidos = HistorialLocalStore.lista();
        const historiaEst = HistoriaStore.leer();

        const ficha = construirFichaMiClub(clubId, {
            equiposCatalogo: catalogo,
            carrera: st,
            ligaActual: ligaAct,
            copaHistorial: copaHist,
            supercopaHistorial: supercopaHist,
            historialPartidos: histPartidos,
            desafiosCompletados: DesafiosStore.totalCompletados(),
            historiaCompletada: !!historiaEst.campanaCompletada,
        });

        const esFavorito = favId === ficha.equipo.id;

        const opts = catalogo
            .map(
                (eq) =>
                    `<option value="${escClub(eq.id)}"${eq.id === ficha.equipo.id ? ' selected' : ''}>${eq.id === favId ? '★ ' : ''}${escClub(eq.nombre)} (${'★'.repeat(eq.estrellas || 3)})</option>`
            )
            .join('');

        let body;
        if (this._miClubTab === 'vitrina') body = this._htmlMiClubVitrina(ficha);
        else if (this._miClubTab === 'campanas') body = this._htmlMiClubCampanas(ficha);
        else if (this._miClubTab === 'palmares') {
            body = this._htmlMiClubPalmaresGlobal({
                st,
                copaHist,
                supercopaHist,
                historiaEst,
                catalogo,
                histPartidos,
            });
        } else body = this._htmlMiClubResumen(ficha);

        root.innerHTML = `
            <div class="lg-wrap nw-wrap mc-wrap">
                <h2 class="lg-title">🏛 MI CLUB</h2>
                <div class="nw-club-picker" style="margin-bottom:8px">
                    <label for="mc-club-sel">SEDE SOCIAL DEL CLUB:</label>
                    <select id="mc-club-sel">${opts}</select>
                </div>

                <div class="mc-hero">
                    <img class="pm-badge" alt="" src="${escClub(this._badgeURL(ficha.equipo))}">
                    <div class="mc-hero-info">
                        <b>${escClub(ficha.equipo.nombre)}${esFavorito ? '<span class="mc-fav-pill">★ FAVORITO</span>' : ''}</b>
                        <small>${'★'.repeat(ficha.equipo.estrellas || 3)} · REPUTACIÓN ${ficha.reputacion.general}/100 (${escClub(ficha.reputacion.rango)})</small>
                        <div class="mc-hero-kpis">
                            <span>Liga: <b>${ficha.vitrina.ligas}</b></span>
                            <span>Copa: <b>${ficha.vitrina.copas}</b></span>
                            <span>Supercopa: <b>${ficha.vitrina.supercopas}</b></span>
                            <span>Estado: <b style="color:${ficha.forma.color}">${escClub(ficha.forma.icono)} ${escClub(ficha.forma.nombre)}</b></span>
                        </div>
                        <div style="margin-top:6px">
                            ${
                                esFavorito
                                    ? `<button type="button" class="pm-tool-btn" data-mc-fav="" style="padding:5px 8px;font-size:6.5px">QUITAR EQUIPO FAVORITO</button>`
                                    : `<button type="button" class="pm-tool-btn" data-mc-fav="${escClub(ficha.equipo.id)}" style="padding:5px 8px;font-size:6.5px;border-color:#ffcc00;color:#ffcc00">★ ELEGIR COMO EQUIPO FAVORITO</button>`
                            }
                        </div>
                    </div>
                </div>

                <div class="lg-tabs nw-tabs" role="tablist">
                    <button type="button" role="tab" data-mc-act="tab-resumen" class="${this._miClubTab === 'resumen' ? 'on' : ''}">PLANTEL</button>
                    <button type="button" role="tab" data-mc-act="tab-vitrina" class="${this._miClubTab === 'vitrina' ? 'on' : ''}">FESTEJOS</button>
                    <button type="button" role="tab" data-mc-act="tab-campanas" class="${this._miClubTab === 'campanas' ? 'on' : ''}">RIVALES</button>
                    <button type="button" role="tab" data-mc-act="tab-palmares" class="${this._miClubTab === 'palmares' ? 'on' : ''}">🏅 PALMARÉS Y RÉCORDS</button>
                </div>

                <div class="nw-body">${body}</div>

                <div class="lg-actions">
                    <button type="button" class="action-btn" data-mc-act="ir-liga">IR A LIGA / COMPETICIONES</button>
                    <button type="button" class="action-btn secondary" data-mc-act="volver">VOLVER</button>
                </div>
            </div>
        `;
    },

    _htmlMiClubResumen(f) {
        const s = f.estadisticas;
        const c1 = f.equipo.colores[0] || '#2457c9';
        const c2 = f.equipo.colores[1] || f.equipo.colores[0] || '#111111';
        const a1 = f.kitAlternativo.colores[0];
        const a2 = f.kitAlternativo.colores[1] || a1;

        const titulosRep = f.reputacion.titulosDetalle
            .map((t) => `<span class="nw-title-pill ${t.desbloqueado ? 'on' : 'off'}">${t.desbloqueado ? '★ ' : '🔒 '}${escClub(t.nombre)}</span>`)
            .join('');

        const cartasPlantel = (f.plantelDetallado || [])
            .map((j) => {
                const a = j.atributos;
                const chipsRasgos = (j.rasgos || [])
                    .map((rId) => {
                        const r = RASGOS[rId];
                        return r ? `<span class="mc-trait-pill" title="${escClub(r.desc)}">${r.icono} ${escClub(r.nombre)}</span>` : '';
                    })
                    .join('');
                const statsLinea =
                    j.slot === 'gk'
                        ? `ATA ${a.atajada} · DEF ${a.defensa} · FUE ${a.fuerza} · PAS ${a.pase}`
                        : `VEL ${a.velocidad} · TIR ${a.tiro} · REG ${a.regate} · PAS ${a.pase} · DEF ${a.defensa}`;
                return `
                    <div class="mc-player-chip ${j.slot === 'gk' ? 'gk' : ''}">
                        <span>${escClub(j.puesto)} · MEDIA ${j.media}</span>
                        <b>${escClub(j.nombre)}</b>
                        <small style="display:block;font-size:8px;color:#9ecbff;margin-top:3px">${statsLinea}</small>
                        ${chipsRasgos ? `<div class="mc-traits-row">${chipsRasgos}</div>` : ''}
                    </div>
                `;
            })
            .join('');

        return `
            <div class="nw-rep-card">
                <div class="pm-sec-title">ESTADO FÍSICO Y NÚMEROS HISTÓRICOS</div>
                <p class="lg-mini" style="margin:2px 0 8px;color:${f.forma.color}">${escClub(f.forma.textoCorto)} — ${escClub(f.forma.resumen)}</p>
                <div class="sc-stats" style="margin-bottom:6px">
                    <div class="sc-stat"><b>${s.pj}</b><span>PARTIDOS</span></div>
                    <div class="sc-stat win"><b>${s.ganados}</b><span>VICTORIAS</span></div>
                    <div class="sc-stat draw"><b>${s.empatados}</b><span>EMPATES</span></div>
                    <div class="sc-stat loss"><b>${s.perdidos}</b><span>DERROTAS</span></div>
                    <div class="sc-stat gold"><b>${s.golesHistoricos}</b><span>GOLES FAV.</span></div>
                    <div class="sc-stat"><b>${s.golesRecibidos}</b><span>GOLES CON.</span></div>
                    <div class="sc-stat win"><b>${s.vallasInvictas}</b><span>VALLA EN 0</span></div>
                    <div class="sc-stat gold"><b>${s.efectividad}%</b><span>EFECTIV.</span></div>
                </div>
            </div>

            <div class="nw-rep-card" style="margin-top:8px">
                <div class="pm-sec-title">PLANTEL F8 · ATRIBUTOS Y RASGOS</div>
                <div class="mc-squad-grid">${cartasPlantel}</div>
                <div class="mc-kits-row">
                    <div class="mc-kit-swatch">
                        <span class="mc-swatch-bar" style="background:linear-gradient(90deg,${c1} 50%,${c2} 50%)"></span>
                        <small>TITULAR OFICIAL</small>
                    </div>
                    <div class="mc-kit-swatch">
                        <span class="mc-swatch-bar" style="background:linear-gradient(90deg,${a1} 50%,${a2} 50%)"></span>
                        <small>SUPLENTE: ${escClub(f.kitAlternativo.nombre)}</small>
                    </div>
                </div>
            </div>

            <div class="nw-rep-card" style="margin-top:8px">
                <div class="pm-sec-title">PRESTIGIO Y TÍTULOS HONORÍFICOS</div>
                <div class="nw-titles-grid">${titulosRep}</div>
            </div>
        `;
    },

    _htmlMiClubVitrina(f) {
        const v = f.vitrina;
        const r = f.records;
        const eqNombre = (id) => {
            const eq = this._equipo(id);
            return eq ? eq.corto : id || 'Rival';
        };

        const goleadaTxt = r.mayorGoleada
            ? `${r.mayorGoleada.gf}-${r.mayorGoleada.gc} vs ${escClub(eqNombre(r.mayorGoleada.rivalId))}`
            : 'Sin registrar';
        const remontadaTxt = r.mayorRemontada
            ? `${r.mayorRemontada.gf}-${r.mayorRemontada.gc} vs ${escClub(eqNombre(r.mayorRemontada.rivalId))}`
            : 'Sin registrar';

        let premiosHtml;
        if (f.premiosDestacados.length > 0) {
            premiosHtml = f.premiosDestacados
                .map(
                    (p) => `
                        <div class="lg-m mio">
                            <span class="lg-m-t izq"><span>${escClub(p.premio)}</span></span>
                            <span class="lg-m-sc"><b>${escClub(p.ganador)}</b></span>
                            <span class="lg-m-t der"><span>${escClub(p.detalle)}</span></span>
                        </div>
                    `
                )
                .join('');
        } else {
            premiosHtml = `<div class="pm-empty">Completá temporadas de Liga para sumar Botines de Oro, Guantes y distinciones a la vitrina.</div>`;
        }

        const celebHtml = (f.celebraciones || [])
            .map((c) => {
                const equipada = f.celebracionEquipada === c.id;
                return `
                    <div class="mc-player-chip ${equipada ? 'gk' : ''}" style="opacity:${c.desbloqueada ? '1' : '0.68'}">
                        <span>${c.desbloqueada ? (equipada ? '★ EQUIPADA' : '✓ DESBLOQUEADA') : '🔒 BLOQUEADA'}</span>
                        <b>${c.icono} ${escClub(c.nombre)}</b>
                        <small style="display:block;font-size:8px;color:#aab6c9;margin:3px 0">${escClub(c.requisitoTexto)}</small>
                        ${
                            c.desbloqueada && !equipada
                                ? `<button type="button" class="pm-tool-btn" data-mc-celeb="${escClub(c.id)}" style="margin-top:4px;width:100%">EQUIPAR FESTEJO</button>`
                                : ''
                        }
                    </div>
                `;
            })
            .join('');

        return `
            <div class="mc-trophies-row">
                <div class="mc-trophy-box"><span>🏆</span><b>${v.ligas}</b><small>LIGAS</small></div>
                <div class="mc-trophy-box"><span>🥇</span><b>${v.copas}</b><small>COPAS</small></div>
                <div class="mc-trophy-box"><span>⭐</span><b>${v.supercopas}</b><small>SUPERCOPAS</small></div>
                <div class="mc-trophy-box"><span>🏟</span><b>${v.finales}</b><small>FINALES</small></div>
            </div>

            <div class="nw-rep-card" style="margin-top:8px">
                <div class="pm-sec-title">🎉 CELEBRACIONES DE GOL (COSMÉTICAS)</div>
                <div class="mc-squad-grid">${celebHtml}</div>
            </div>

            <div class="nw-rep-card" style="margin-top:8px">
                <div class="pm-sec-title">RÉCORDS DEL CLUB SELECCIONADO</div>
                <div class="mc-records-list">
                    <div class="mc-rec-item"><span>Mayor goleada</span><b>${goleadaTxt}</b></div>
                    <div class="mc-rec-item"><span>Mayor remontada</span><b>${remontadaTxt}</b></div>
                    <div class="mc-rec-item"><span>Mejor racha de victorias</span><b>${r.mejorRachaVictorias} seguidas</b></div>
                    <div class="mc-rec-item"><span>Mayor invicto</span><b>${r.mejorRachaInvicto} partidos</b></div>
                    <div class="mc-rec-item"><span>Partidos seguidos marcando</span><b>${r.mejorRachaGoles} partidos</b></div>
                </div>
            </div>

            <div class="pm-sec-title" style="margin-top:10px">DISTINCIONES Y PREMIOS DEL CLUB</div>
            <div class="lg-matches">${premiosHtml}</div>
        `;
    },

    _htmlMiClubCampanas(f) {
        let h = '';
        if (f.objetivosActivos && f.objetivosActivos.principal) {
            const p = f.objetivosActivos.principal;
            h += `
                <div class="obj-card main ${p.estado}" style="margin-bottom:8px">
                    <div class="obj-head"><span>OBJETIVO DE TEMPORADA EN CURSO</span><span class="obj-pill">${escClub(p.estado.toUpperCase())}</span></div>
                    <div class="obj-title">${escClub(p.titulo)}</div>
                </div>
            `;
        }

        h += `<div class="pm-sec-title">PRINCIPALES RIVALIDADES DEL CLUB</div>`;
        if (!f.rivalidades.length) {
            h += `<div class="pm-empty">Aún sin clásicos ni rivalidades activas registradas.</div>`;
        } else {
            h += `<div class="nw-riv-list" style="margin-bottom:10px">`;
            for (const rv of f.rivalidades.slice(0, 5)) {
                const eqRiv = this._equipo(rv.rivalId);
                h += `
                    <div class="nw-riv-card ${rv.esClasico ? 'clasico' : ''}">
                        <div class="nw-riv-head">
                            <b>${rv.esClasico ? '🔥 ' : ''}${escClub(eqRiv ? eqRiv.nombre : rv.rivalId)}</b>
                            <span class="nw-riv-lvl">${escClub(rv.textoNivel)}</span>
                        </div>
                        <div class="nw-riv-sub">${escClub(rv.etiqueta)} · Historial: ${rv.pj} PJ (${rv.ganados}G ${rv.empatados}E ${rv.perdidos}P)</div>
                    </div>
                `;
            }
            h += `</div>`;
        }

        h += `<div class="pm-sec-title">TEMPORADAS CON ${escClub(f.equipo.corto || f.equipo.nombre)}</div>`;
        if (!f.temporadas.length) {
            h += `<div class="pm-empty">Todavía no hay temporadas cerradas con ${escClub(f.equipo.nombre)}.</div>`;
        } else {
            h += `<div class="lg-matches">`;
            for (const tmp of f.temporadas.slice(0, 8)) {
                h += `
                    <div class="lg-m mio">
                        <span class="lg-m-t izq"><span>Puesto: <b>${tmp.posicionFinal}°</b></span></span>
                        <span class="lg-m-sc"><small>Obj ${tmp.cumplidos}/${tmp.total}</small></span>
                        <span class="lg-m-t der"><span>${tmp.posicionFinal === 1 ? '🏆 CAMPEÓN' : 'FINALIZADA'}</span></span>
                    </div>
                `;
            }
            h += `</div>`;
        }
        return h;
    },

    _htmlMiClubPalmaresGlobal({ st, copaHist, supercopaHist, historiaEst, catalogo, histPartidos }) {
        const pal = construirHistorialYPalmares({
            carrera: st,
            copaHistorial: copaHist,
            supercopaHistorial: supercopaHist,
            historiaEstado: historiaEst,
            equiposCatalogo: catalogo,
        });
        const records = calcularRecordsReales({
            carrera: st,
            historialPartidos: histPartidos,
            equiposCatalogo: catalogo,
        });

        const vitrinaHtml = pal.vitrinaVisual
            .map(
                (item) => `
                <div class="mc-trophy-box">
                    <span>${item.icono}</span>
                    <b>${item.cantidad}</b>
                    <small>${escClub(item.titulo)}</small>
                </div>
            `
            )
            .join('');

        const recordsHtml = records
            .map(
                (rec) => `
                <div class="mc-rec-item">
                    <span>${rec.icono} ${escClub(rec.titulo)}</span>
                    <b style="color:${rec.registrado ? '#ffcc00' : '#7a8aa3'}">${escClub(rec.valorTexto)}</b>
                </div>
            `
            )
            .join('');

        let tempHtml;
        if (!pal.temporadas.length) {
            tempHtml = `<div class="pm-empty">Las temporadas finalizadas quedan registradas aquí de forma permanente aunque arranques una nueva campaña.</div>`;
        } else {
            tempHtml = `<div class="lg-matches">` +
                pal.temporadas
                    .map((t) => {
                        const ptsTxt = t.puntos != null ? `${t.puntos} pts` : '';
                        const golesTxt = t.gf != null && t.gc != null ? `${t.gf}:${t.gc}` : '';
                        const sub = [ptsTxt, golesTxt, t.campeonNombre ? `Campeón: ${t.campeonNombre}` : '']
                            .filter(Boolean)
                            .join(' · ');
                        return `
                            <div class="lg-m ${t.salioCampeon ? 'mio' : ''}">
                                <span class="lg-m-t izq"><span>Temp. #${t.numero} · ${escClub(t.miEquipoNombre)}</span></span>
                                <span class="lg-m-sc"><b>${t.posicionFinal}°</b></span>
                                <span class="lg-m-t der"><span>${escClub(sub || (t.salioCampeon ? '🏆 CAMPEÓN' : 'FINALIZADA'))}</span></span>
                            </div>
                        `;
                    })
                    .join('') +
                `</div>`;
        }

        let copasHtml = '';
        if (pal.copas.length || pal.supercopas.length) {
            const filasCopa = pal.copas
                .slice(0, 8)
                .map(
                    (c) => `
                    <div class="lg-m">
                        <span class="lg-m-t izq"><span>🥇 Copa · ${escClub(c.campeonNombre)}</span></span>
                        <span class="lg-m-sc"><small>${escClub(c.marcadorFinal || 'CAMPEÓN')}</small></span>
                        <span class="lg-m-t der"><span>Sub: ${escClub(c.subcampeonNombre)}</span></span>
                    </div>
                `
                )
                .join('');
            const filasSup = pal.supercopas
                .slice(0, 8)
                .map(
                    (s) => `
                    <div class="lg-m mio">
                        <span class="lg-m-t izq"><span>⭐ Supercopa · ${escClub(s.campeonNombre)}</span></span>
                        <span class="lg-m-sc"><small>${escClub(s.marcador)}</small></span>
                        <span class="lg-m-t der"><span>vs ${escClub(s.subcampeonNombre)}</span></span>
                    </div>
                `
                )
                .join('');
            copasHtml = `
                <div class="pm-sec-title" style="margin-top:10px">HISTORIAL DE COPAS Y SUPERCOPAS</div>
                <div class="lg-matches">${filasSup}${filasCopa}</div>
            `;
        }

        let hallHtml = '';
        if (pal.mejoresJugadores.length) {
            hallHtml = `
                <div class="pm-sec-title" style="margin-top:10px">CUADRO DE HONOR · MEJORES JUGADORES</div>
                <div class="lg-matches">
                    ${pal.mejoresJugadores
                        .slice(0, 10)
                        .map(
                            (m) => `
                        <div class="lg-m">
                            <span class="lg-m-t izq"><span>${escClub(m.distincion)}</span></span>
                            <span class="lg-m-sc"><b>${escClub(m.nombre)}</b></span>
                            <span class="lg-m-t der"><span>${escClub(m.club)} · ${escClub(m.detalle)}</span></span>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            `;
        }

        return `
            <div class="mc-trophies-row">${vitrinaHtml}</div>

            <div class="nw-rep-card" style="margin-top:8px">
                <div class="pm-sec-title">🏅 RÉCORDS REALES DE CARRERA (ETAPA 31)</div>
                <div class="mc-records-list">${recordsHtml}</div>
            </div>

            <div class="pm-sec-title" style="margin-top:10px">HISTORIAL PERMANENTE DE TEMPORADAS (ETAPA 30)</div>
            ${tempHtml}
            ${copasHtml}
            ${hallHtml}
        `;
    },

    _onMiClubClick(e) {
        const favBtn = e.target.closest('[data-mc-fav]');
        if (favBtn) {
            const nuevoFav = favBtn.getAttribute('data-mc-fav') || '';
            EquipoFavoritoStore.fijar(nuevoFav);
            if (AuthStore && typeof AuthStore.respaldarCarreraRemota === 'function') {
                AuthStore.respaldarCarreraRemota().catch(() => null);
            }
            this._renderMiClub();
            return;
        }
        const celBtn = e.target.closest('[data-mc-celeb]');
        if (celBtn) {
            CarreraStore.equiparCelebracion(celBtn.dataset.mcCeleb);
            this._renderMiClub();
            return;
        }
        const b = e.target.closest('[data-mc-act]');
        if (!b) return;
        const act = b.dataset.mcAct;
        if (act === 'tab-resumen') {
            this._miClubTab = 'resumen';
            this._renderMiClub();
        } else if (act === 'tab-vitrina') {
            this._miClubTab = 'vitrina';
            this._renderMiClub();
        } else if (act === 'tab-campanas') {
            this._miClubTab = 'campanas';
            this._renderMiClub();
        } else if (act === 'tab-palmares') {
            this._miClubTab = 'palmares';
            this._renderMiClub();
        } else if (act === 'ir-liga') {
            const root = document.getElementById('club-screen');
            if (root) root.hidden = true;
            if (this.liga) this.liga.abrirMenu();
        } else if (act === 'volver') {
            this._cerrarMiClub();
        }
    },
});


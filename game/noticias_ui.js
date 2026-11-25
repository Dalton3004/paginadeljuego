import { Game } from '../game.js';
import { CarreraStore } from '../career/store.js';
import { TITULOS_REPUTACION } from '../career/reputacion.js';
import { rivalidadesDeEquipo } from '../career/rivalidades.js';

/**
 * ETAPAS 5, 7, 11, 12 y 13 — Pantalla dedicada de Noticias Chaquito,
 * Reputación del Club, Rachas Expandidas, Palmarés y Rivalidades.
 */

function escNot(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

Object.assign(Game.prototype, {
    _initNoticiasUI() {
        if (this._noticiasBound) return;
        this._noticiasBound = true;
        this._noticiasTab = 'diario'; // 'diario' | 'reputacion' | 'rivalidades'
        this._noticiasFiltro = 'todas'; // 'todas' | 'destacadas' | 'prensa'
        this._noticiasOrigen = 'menu';
        this._noticiasClubRiv = '';

        const root = document.getElementById('news-screen');
        if (root) {
            root.addEventListener('click', (e) => this._onNoticiasClick(e));
            root.addEventListener('change', (e) => {
                if (e.target && e.target.id === 'nw-club-sel') {
                    this._noticiasClubRiv = e.target.value;
                    this._renderPantallaNoticias();
                }
            });
        }
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Escape' && this._noticiasVisible()) {
                e.preventDefault();
                this._cerrarPantallaNoticias();
            }
        });
    },

    _noticiasVisible() {
        const root = document.getElementById('news-screen');
        return !!(root && !root.hidden);
    },

    _actualizarIndicadorNoticias() {
        const btn = document.getElementById('news-hit');
        if (!btn) return;
        const st = CarreraStore.leer();
        btn.classList.toggle('has-news', (st.noticiasSinLeer || 0) > 0);
    },

    _abrirPantallaNoticias(origen = 'menu') {
        this._initNoticiasUI();
        this._noticiasOrigen = origen || 'menu';
        const root = document.getElementById('news-screen');
        if (!root) return;

        CarreraStore.marcarNoticiasLeidas();
        this._actualizarIndicadorNoticias();

        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');

        if (!this._noticiasClubRiv) {
            this._noticiasClubRiv =
                (this.liga && this.liga.liga && this.liga.liga.miEquipo) ||
                (this.copa && this.copa.copa && this.copa.copa.miEquipo) ||
                (this.seleccion && this.seleccion.local) ||
                (typeof EQUIPOS !== 'undefined' && EQUIPOS[0] ? EQUIPOS[0].id : '');
        }

        this.menuVisible = true;
        root.hidden = false;
        this._renderPantallaNoticias();
        root.scrollTop = 0;
    },

    _cerrarPantallaNoticias() {
        const root = document.getElementById('news-screen');
        if (root) root.hidden = true;

        if (this._noticiasOrigen === 'liga' && this.liga && this.liga.liga) {
            this.liga.mostrar();
            return;
        }
        if (this._noticiasOrigen === 'copa' && this.copa && this.copa.copa) {
            this.copa.mostrar();
            return;
        }
        this._showMainMenu();
    },

    _renderPantallaNoticias() {
        const root = document.getElementById('news-screen');
        if (!root) return;
        const st = CarreraStore.leer();

        let body;
        if (this._noticiasTab === 'reputacion') body = this._htmlNoticiasReputacion(st);
        else if (this._noticiasTab === 'rivalidades') body = this._htmlNoticiasRivalidades(st);
        else body = this._htmlNoticiasDiario(st);

        root.innerHTML = `
            <div class="lg-wrap nw-wrap">
                <h2 class="lg-title">📰 DIARIO CHAQUITO</h2>
                <p class="lg-sub">NOTICIAS · REPUTACIÓN · RACHAS · RIVALIDADES</p>

                <div class="lg-tabs nw-tabs" role="tablist">
                    <button type="button" role="tab" data-nw-act="tab-diario" class="${this._noticiasTab === 'diario' ? 'on' : ''}">NOTICIAS</button>
                    <button type="button" role="tab" data-nw-act="tab-rep" class="${this._noticiasTab === 'reputacion' ? 'on' : ''}">REPUTACIÓN</button>
                    <button type="button" role="tab" data-nw-act="tab-riv" class="${this._noticiasTab === 'rivalidades' ? 'on' : ''}">RIVALIDADES</button>
                </div>

                <div class="nw-body">${body}</div>

                <div class="lg-actions">
                    ${
                        this.supercopa && this.supercopa.disponible()
                            ? '<button type="button" class="action-btn" data-nw-act="ir-supercopa">⭐ SUPERCOPA DISPONIBLE</button>'
                            : ''
                    }
                    <button type="button" class="action-btn secondary" data-nw-act="volver">VOLVER</button>
                </div>
            </div>
        `;
    },

    _htmlNoticiasDiario(st) {
        const todas = st.noticias || [];
        const filtradas = todas.filter((n) => {
            if (this._noticiasFiltro === 'destacadas') return !!n.destacada;
            if (this._noticiasFiltro === 'prensa') return n.categoria === 'conferencia';
            return true;
        });

        let h = `
            <div class="sc-filter" style="justify-content:center;margin-bottom:10px">
                <button type="button" class="sc-chip ${this._noticiasFiltro === 'todas' ? 'on' : ''}" data-nw-filtro="todas">TODAS (${todas.length})</button>
                <button type="button" class="sc-chip ${this._noticiasFiltro === 'destacadas' ? 'on' : ''}" data-nw-filtro="destacadas">PORTADA</button>
                <button type="button" class="sc-chip ${this._noticiasFiltro === 'prensa' ? 'on' : ''}" data-nw-filtro="prensa">CONFERENCIAS</button>
            </div>
        `;

        if (!filtradas.length) {
            h += `<div class="pm-empty">Todavía no hay crónicas en esta sección. ¡Jugá partidos en Liga, Copa o Amistoso para salir en el diario!</div>`;
            return h;
        }

        h += '<div class="nw-feed">';
        for (const n of filtradas) {
            const fecha = n.cuando ? new Date(n.cuando).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
            h += `
                <article class="nw-item ${n.destacada ? 'featured' : ''} ${n.categoria === 'conferencia' ? 'press' : ''}">
                    <div class="nw-item-head">
                        <span class="nw-tag">${escNot(n.etiqueta || 'FÚTBOL 8')}</span>
                        <span class="nw-ctx">${escNot(n.contexto || '')}${fecha ? ' · ' + escNot(fecha) : ''}</span>
                    </div>
                    <h3 class="nw-headline">${escNot(n.titular)}</h3>
                    <p class="nw-lead">${escNot(n.bajada)}</p>
                </article>
            `;
        }
        h += '</div>';
        return h;
    },

    _htmlNoticiasReputacion(st) {
        const rep = st.reputacion;
        const ra = st.rachas;
        const pal = st.palmares;

        const barra = (label, val, color) => `
            <div class="nw-rep-row">
                <div class="nw-rep-lbl"><span>${label}</span><b>${val}/100</b></div>
                <div class="nw-rep-bar"><i style="width:${val}%;background:${color}"></i></div>
            </div>
        `;

        const titulosHtml = TITULOS_REPUTACION.map((t) => {
            const ok = (rep.titulosDesbloqueados || []).includes(t.id);
            return `<span class="nw-title-pill ${ok ? 'on' : 'off'}">${ok ? '★ ' : '🔒 '}${escNot(t.nombre)}</span>`;
        }).join('');

        let tempHtml = '';
        if (st.historialTemporadas && st.historialTemporadas.length > 0) {
            tempHtml += `<div class="pm-sec-title" style="margin-top:10px">HISTORIAL DE TEMPORADAS (OBJETIVOS)</div><div class="lg-matches">`;
            for (const tmp of st.historialTemporadas.slice(0, 5)) {
                const eq = this._equipo(tmp.miEquipo);
                tempHtml += `
                    <div class="lg-m mio">
                        <span class="lg-m-t izq"><span>${escNot(eq ? eq.corto : tmp.miEquipo)}</span></span>
                        <span class="lg-m-sc"><b>${tmp.posicionFinal}°</b></span>
                        <span class="lg-m-t der"><span>Obj: ${tmp.cumplidos}/${tmp.total}</span></span>
                    </div>
                `;
            }
            tempHtml += `</div>`;
        }

        return `
            <div class="nw-rep-card">
                <div class="nw-rep-top">
                    <span class="nw-rep-rank">${escNot(rep.rango)}</span>
                    <b class="nw-rep-num">REPUTACIÓN ${rep.general}/100</b>
                </div>
                ${barra('POPULARIDAD', rep.popularidad, '#ffcc00')}
                ${barra('RESPETO DEPORTIVO', rep.respeto, '#3a9bff')}
                ${barra('RELACIÓN CON HINCHADA', rep.hinchada, '#48e078')}
                ${barra('TENSIÓN MÁXIMA DE RIVALIDAD', rep.rivalidadMaxima, '#ff626c')}
                <div class="pm-sec-title" style="margin-top:8px">TÍTULOS HONORÍFICOS (NO PAY-TO-WIN)</div>
                <div class="nw-titles-grid">${titulosHtml}</div>
            </div>

            <div class="nw-rep-card" style="margin-top:10px">
                <div class="pm-sec-title">VITRINA Y RACHAS DE CARRERA</div>
                <div class="sc-stats" style="margin-bottom:6px">
                    <div class="sc-stat gold"><b>${pal.ligas}</b><span>LIGAS</span></div>
                    <div class="sc-stat gold"><b>${pal.copas}</b><span>COPAS</span></div>
                    <div class="sc-stat gold"><b>${pal.supercopas}</b><span>SUPERCOPAS</span></div>
                    <div class="sc-stat win"><b>${ra.victoriasConsecutivas}</b><span>VICT. SEG.</span></div>
                    <div class="sc-stat"><b>${ra.partidosInvicto}</b><span>INVICTO</span></div>
                    <div class="sc-stat"><b>${ra.partidosMarcando}</b><span>MARCANDO</span></div>
                    <div class="sc-stat"><b>${ra.vallasInvictasSeguidas}</b><span>VALLA EN 0</span></div>
                    <div class="sc-stat gold"><b>${ra.mejorInvicto}</b><span>RÉC. INVICTO</span></div>
                </div>
            </div>
            ${tempHtml}
        `;
    },

    _htmlNoticiasRivalidades(st) {
        const equipos = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS : [];
        const clubActual = this._noticiasClubRiv || (equipos[0] && equipos[0].id) || '';
        const lista = rivalidadesDeEquipo(st.rivalidades, clubActual);

        const opts = equipos
            .map(
                (eq) =>
                    `<option value="${escNot(eq.id)}"${eq.id === clubActual ? ' selected' : ''}>${escNot(eq.nombre)}</option>`
            )
            .join('');

        let h = `
            <div class="nw-club-picker">
                <label for="nw-club-sel">VER RIVALIDADES DE:</label>
                <select id="nw-club-sel">${opts}</select>
            </div>
        `;

        if (!lista.length) {
            h += `<div class="pm-empty">Aún no se registraron cruces ni clásicos para este club. ¡Salí a la cancha para forjar historia!</div>`;
            return h;
        }

        h += `<div class="nw-riv-list">`;
        for (const r of lista) {
            const eqRiv = this._equipo(r.rivalId);
            const nom = eqRiv ? eqRiv.nombre : r.rivalId;
            const barColor = r.esClasico ? '#ff5a5f' : r.nivel >= 50 ? '#ffcc00' : '#3a9bff';
            h += `
                <div class="nw-riv-card ${r.esClasico ? 'clasico' : ''}">
                    <div class="nw-riv-head">
                        <div class="nw-riv-team">
                            ${eqRiv ? `<img class="pm-badge xs" alt="" src="${escNot(this._badgeURL(eqRiv))}">` : ''}
                            <b>${escNot(nom)}</b>
                        </div>
                        <span class="nw-riv-lvl">${r.esClasico ? '🔥 ' : ''}${escNot(r.textoNivel)}</span>
                    </div>
                    <div class="nw-riv-sub">${escNot(r.etiqueta)} · Historial: ${r.pj} PJ (${r.ganados}G ${r.empatados}E ${r.perdidos}P)</div>
                    <div class="nw-rep-bar"><i style="width:${r.nivel}%;background:${barColor}"></i></div>
                </div>
            `;
        }
        h += `</div>`;
        return h;
    },

    _onNoticiasClick(e) {
        const fBtn = e.target.closest('[data-nw-filtro]');
        if (fBtn) {
            this._noticiasFiltro = fBtn.dataset.nwFiltro || 'todas';
            this._renderPantallaNoticias();
            return;
        }
        const b = e.target.closest('[data-nw-act]');
        if (!b) return;
        const act = b.dataset.nwAct;
        if (act === 'tab-diario') {
            this._noticiasTab = 'diario';
            this._renderPantallaNoticias();
        } else if (act === 'tab-rep') {
            this._noticiasTab = 'reputacion';
            this._renderPantallaNoticias();
        } else if (act === 'tab-riv') {
            this._noticiasTab = 'rivalidades';
            this._renderPantallaNoticias();
        } else if (act === 'ir-supercopa') {
            const root = document.getElementById('news-screen');
            if (root) root.hidden = true;
            if (this.supercopa) this.supercopa.abrirMenu();
        } else if (act === 'volver') {
            this._cerrarPantallaNoticias();
        }
    },
});

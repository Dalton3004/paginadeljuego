import { Game } from '../game.js';
import { construirEstadoCentralChaquito } from '../career/navegacion.js';
import { EquipoFavoritoStore } from '../career/favorito_perfil.js';
import { CarreraStore } from '../career/store.js';
import { DesafiosStore, DESAFIOS_CATALOGO } from '../career/desafios.js';
import { LigaStore } from '../liga.js';
import { CopaStore } from '../copa.js';
import { AuthStore } from '../settings.js';

/**
 * ETAPA 27 — Menú Central Chaquito accesible y limpio para móvil y PC.
 *
 * Evita saturar la portada principal: un único botón `#hub-hit` (`☰ CENTRAL`) abre
 * un panel ordenado con foco de teclado y botones amplios táctiles hacia las secciones
 * clave del universo Chaquito.
 */

function escNav(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

Object.assign(Game.prototype, {
    _initNavegacionUI() {
        if (this._navUIBound) return;
        this._navUIBound = true;

        const hubBtn = document.getElementById('hub-hit');
        if (hubBtn) {
            hubBtn.addEventListener('click', () => this._abrirCentralChaquito());
        }

        window.addEventListener('keydown', (e) => {
            const dialog = document.getElementById('menu-dialog');
            const content = document.getElementById('dialog-content');
            if (e.code === 'Escape' && dialog && dialog.classList.contains('open') && content && content.classList.contains('hub-wide')) {
                e.preventDefault();
                this._cerrarCentralChaquito();
            }
        });
    },

    _cerrarCentralChaquito() {
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        if (content) content.classList.remove('hub-wide');
        if (dialog) dialog.classList.remove('open');
        const hubBtn = document.getElementById('hub-hit');
        if (hubBtn) hubBtn.focus({ preventScroll: true });
    },

    _abrirCentralChaquito() {
        this._initNavegacionUI();
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        if (!dialog || !content) return;

        content.classList.remove('rk-wide', 'cfg-wide', 'sc-wide');
        content.classList.add('hub-wide');

        const catalogo = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS : [];
        const sesion = AuthStore.current ? AuthStore.current() : null;
        const stCar = CarreraStore.leer();
        const estado = construirEstadoCentralChaquito({
            ligaActual: (this.liga && this.liga.liga) || LigaStore.actual(),
            copaActual: (this.copa && this.copa.copa) || CopaStore.actual(),
            noticiasNoLeidas: Number(stCar && stCar.noticiasSinLeer) || 0,
            desafiosCompletados: DesafiosStore.totalCompletados(),
            totalDesafios: DESAFIOS_CATALOGO.length,
            equipoFavoritoId: EquipoFavoritoStore.obtener(),
            equiposCatalogo: catalogo,
            sesionNombre: sesion ? sesion.nombre : '',
        });

        const favLinea = estado.favorito.elegido
            ? `★ Club favorito: <b>${escNav(estado.favorito.nombre)}</b>`
            : `Sin club favorito elegido · podés configurarlo en <b>Perfil</b> o <b>Mi Club</b>`;

        const tarjetas = estado.secciones
            .map(
                (s) => `
                <button type="button" class="hub-tile ${s.id === 'jugar' ? 'primary' : ''}" data-hub-go="${escNav(s.id)}">
                    <span class="hub-ico" aria-hidden="true">${s.icono}</span>
                    <span class="hub-txt">
                        <b>${escNav(s.titulo)}</b>
                        <small>${escNav(s.subtitulo)}</small>
                    </span>
                    ${s.badge ? `<em class="hub-badge">${escNav(s.badge)}</em>` : ''}
                </button>
            `
            )
            .join('');

        content.innerHTML = `
            <div class="hub-head">
                <h2>☰ CENTRAL CHAQUITO</h2>
                <p class="hub-sub">${favLinea}</p>
            </div>
            <nav class="hub-grid" aria-label="Secciones principales de Liga Chaquito F8">
                ${tarjetas}
            </nav>
            <div class="hub-quick-row">
                <button type="button" class="pm-tool-btn" data-hub-go="palmares">🏅 PALMARÉS Y RÉCORDS</button>
                <button type="button" class="pm-tool-btn" data-hub-go="supercopa">⭐ SUPERCOPA</button>
            </div>
            <button type="button" class="action-btn secondary" id="dialog-close" style="margin-top:10px">CERRAR</button>
        `;

        content.querySelectorAll('[data-hub-go]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const dest = btn.getAttribute('data-hub-go');
                this._navegarDesdeCentral(dest);
            });
        });

        const closeBtn = content.querySelector('#dialog-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this._cerrarCentralChaquito());

        const onBackdrop = (e) => {
            if (e.target === dialog) {
                dialog.removeEventListener('click', onBackdrop);
                this._cerrarCentralChaquito();
            }
        };
        dialog.addEventListener('click', onBackdrop);
        dialog.classList.add('open');

        const firstBtn = content.querySelector('.hub-tile');
        if (firstBtn) {
            setTimeout(() => {
                try { firstBtn.focus({ preventScroll: true }); } catch (_e) { firstBtn.focus(); }
            }, 0);
        }
    },

    _navegarDesdeCentral(destino) {
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        if (content) content.classList.remove('hub-wide');
        if (dialog) dialog.classList.remove('open');

        switch (destino) {
            case 'jugar':
                this._abrirModoJuego();
                break;
            case 'liga':
                if (this.liga) this.liga.abrirMenu();
                break;
            case 'copa':
                if (this.copa) this.copa.abrirMenu();
                break;
            case 'supercopa':
                if (this.supercopa) this.supercopa.abrirMenu();
                break;
            case 'arcade':
                if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('arcade');
                break;
            case 'desafios':
                if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('desafios');
                break;
            case 'historia':
                if (typeof this._abrirModosExtra === 'function') this._abrirModosExtra('historia');
                break;
            case 'mi_club':
                if (typeof this._abrirMiClub === 'function') this._abrirMiClub('menu');
                break;
            case 'palmares':
                if (typeof this._abrirMiClub === 'function') {
                    this._miClubTab = 'palmares';
                    this._abrirMiClub('menu');
                }
                break;
            case 'noticias':
                if (typeof this._abrirPantallaNoticias === 'function') this._abrirPantallaNoticias('menu');
                break;
            case 'perfil':
                if (typeof window !== 'undefined' && window.SocialUI && typeof window.SocialUI.open === 'function') {
                    window.SocialUI.open('perfil');
                } else {
                    const sBtn = document.getElementById('social-hit');
                    if (sBtn) sBtn.click();
                }
                break;
            case 'ranking':
                if (typeof window !== 'undefined' && window.SocialUI && typeof window.SocialUI.open === 'function') {
                    window.SocialUI.open('ranking');
                } else {
                    const rBtn = document.getElementById('rank-hit');
                    if (rBtn) rBtn.click();
                }
                break;
            case 'ajustes': {
                const cfgBtn = document.getElementById('settings-hit');
                if (cfgBtn) cfgBtn.click();
                break;
            }
            default:
                break;
        }
    },
});

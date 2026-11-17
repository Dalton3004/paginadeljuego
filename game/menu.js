import { Game } from '../game.js';
// Game — menú principal y selector de modo.
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    _bindMenu() {
        const menu = document.getElementById('main-menu');
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        const closeDialog = () => dialog.classList.remove('open');
        document.getElementById('play-hit').addEventListener('click', () => {
            this._abrirModoJuego();
        });
        document.getElementById('mode-solo-hit').addEventListener('click', () => this._elegirModoDesdeMenu('solo'));
        document.getElementById('mode-online-hit').addEventListener('click', () => this._elegirModoDesdeMenu('online'));
        document.getElementById('mode-league-hit').addEventListener('click', () => {
            this._cerrarMenuModos();
            if (this.liga) this.liga.abrirMenu();
        });
        document.getElementById('mode-back-hit').addEventListener('click', () => this._cerrarMenuModos());
        document.addEventListener('keydown', e => {
            const modes = document.getElementById('mode-menu');
            if (e.key === 'Escape' && modes && !modes.hidden) {
                e.preventDefault();
                this._cerrarMenuModos();
            }
        });
        this._bindTeamSelect();
        document.getElementById('rank-hit').addEventListener('click', () => {
            // Ranking vacío por defecto; listo para registro futuro.
            content.classList.add('rk-wide');
            content.classList.remove('cfg-wide', 'sc-wide');
            const closeRank = () => {
                content.classList.remove('rk-wide', 'sc-wide');
                closeDialog();
            };
            const pintar = () => {
                if (typeof RankingUI !== 'undefined' && RankingUI.render) {
                    content.innerHTML = RankingUI.render();
                } else {
                    content.innerHTML = '<h2>RANKING DE JUGADORES</h2><p>No se pudo cargar el ranking.</p><button class="action-btn secondary" id="dialog-close">VOLVER</button>';
                }
                const btn = document.getElementById('dialog-close');
                if (btn) btn.addEventListener('click', closeRank);
            };
            pintar();
            dialog.classList.add('open');
            if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) {
                RankingStore.sincronizar().then(() => {
                    if (dialog.classList.contains('open')) pintar();
                });
            }
            const onBackdrop = (e) => {
                if (e.target === dialog) {
                    content.classList.remove('rk-wide', 'sc-wide');
                    dialog.removeEventListener('click', onBackdrop);
                }
            };
            dialog.addEventListener('click', onBackdrop);
        });
        document.getElementById('settings-hit').addEventListener('click', () => {
            content.classList.add('cfg-wide');
            content.classList.remove('rk-wide', 'sc-wide');
            const prefs = (typeof SettingsStore !== 'undefined') ? SettingsStore.get() : null;
            if (typeof SettingsUI !== 'undefined' && SettingsUI.render) {
                content.innerHTML = SettingsUI.render(prefs);
            } else {
                content.innerHTML = '<h2>CONFIGURACIÓN</h2><p>No se pudo cargar el panel.</p><button class="action-btn secondary" id="dialog-close">VOLVER</button>';
            }
            dialog.classList.add('open');

            const closeCfg = () => {
                content.classList.remove('cfg-wide', 'sc-wide');
                closeDialog();
            };

            if (typeof SettingsUI !== 'undefined' && SettingsUI.bind) {
                SettingsUI.bind(content, {
                    onMusicVolume: (v) => {
                        this.prefs.musicVolume = v;
                        if (this._faseMusica() === 'menu' && this.soundtrack) this.soundtrack.volume = this._volMenu();
                    },
                    onReset: (defs) => {
                        this._aplicarPreferencias(defs);
                        if (typeof SettingsUI !== 'undefined') {
                            content.innerHTML = SettingsUI.render(defs);
                            SettingsUI.bind(content, {
                                onMusicVolume: (v) => {
                                    this.prefs.musicVolume = v;
                                    if (this._faseMusica() === 'menu' && this.soundtrack) this.soundtrack.volume = this._volMenu();
                                }
                            });
                            const save2 = document.getElementById('settings-save');
                            if (save2) save2.addEventListener('click', () => {
                                const form = SettingsUI.readForm(content);
                                const next = SettingsStore.set(form);
                                this._aplicarPreferencias(next);
                                closeCfg();
                            });
                            const close2 = document.getElementById('dialog-close');
                            if (close2) close2.addEventListener('click', closeCfg);
                        }
                    }
                });
            }

            // Llevar el foco al campo de jugador para poder tipear de una.
            const authName = document.getElementById('cfg-auth-name');
            if (authName) {
                setTimeout(() => {
                    try { authName.focus({ preventScroll: true }); } catch (err) { authName.focus(); }
                }, 0);
            }

            const saveBtn = document.getElementById('settings-save');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (typeof SettingsUI !== 'undefined' && typeof SettingsStore !== 'undefined') {
                        const form = SettingsUI.readForm(content);
                        const next = SettingsStore.set(form);
                        this._aplicarPreferencias(next);
                    }
                    closeCfg();
                });
            }
            const closeBtn = document.getElementById('dialog-close');
            if (closeBtn) closeBtn.addEventListener('click', closeCfg);
            const onBackdrop = (e) => {
                if (e.target === dialog) {
                    content.classList.remove('cfg-wide');
                    dialog.removeEventListener('click', onBackdrop);
                }
            };
            dialog.addEventListener('click', onBackdrop);
        });
        dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
    },

    // JUGAR abre el selector gráfico de modos, con arte distinto para PC y celular.
    _abrirModoJuego() {
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        const modes = document.getElementById('mode-menu');
        if (modes) {
            modes.hidden = false;
            document.getElementById('mode-solo-hit').focus({ preventScroll: true });
        }
        this.modoLiga = null;
    },

    _cerrarMenuModos() {
        const modes = document.getElementById('mode-menu');
        if (modes) modes.hidden = true;
        const play = document.getElementById('play-hit');
        if (play) play.focus({ preventScroll: true });
    },

    _elegirModoDesdeMenu(modo) {
        this._cerrarMenuModos();
        if (modo === 'solo') {
            if (this._teamsAvailable()) this._openTeamSelect('solo');
            else this._startMatchFromMenu();
            return;
        }
        if (modo === 'online') {
            if (this._teamsAvailable()) this._openTeamSelect('online');
            else this._mostrarEsperaRival();
        }
    },
});

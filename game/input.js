import { Game } from '../game.js';
// Game — teclado, mouse y menús de pausa / fin de partido.
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    _bindInput() {
        /** true si el foco está en un campo de texto (login, registro, etc.) */
        const escribiendoEnFormulario = (e) => {
            const t = e && e.target;
            if (!t || !t.tagName) return false;
            const tag = t.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
            if (t.isContentEditable) return true;
            return false;
        };
        /** menú principal, config, ranking u otros overlays HTML abiertos */
        const uiHTMLActiva = () => {
            if (this.menuVisible) return true;
            const dialog = document.getElementById('menu-dialog');
            if (dialog && dialog.classList.contains('open')) return true;
            const team = document.getElementById('team-select');
            if (team && !team.hidden) return true;
            const modes = document.getElementById('mode-menu');
            if (modes && !modes.hidden) return true;
            if (this.liga && this.liga.visible()) return true;
            return false;
        };

        const resumeMusic = () => this._playSoundtrack();
        window.addEventListener('pointerdown', resumeMusic, { once: false });
        window.addEventListener('keydown', resumeMusic, { once: false });
        window.addEventListener('keydown', (e) => {
            // No interceptar teclas mientras se escribe en login / registro / inputs.
            if (escribiendoEnFormulario(e)) return;
            if (this.enLinea && e.code === 'Escape') {
                e.preventDefault();
                if (this._menuOnline && this._pauseHelpOpen) {
                    this._pauseHelpOpen = false;
                    return;
                }
                this._alternarPausa();
                return;
            }
            // Navegación del menú en línea (el partido no se pausa en el servidor).
            if (this.enLinea && this._menuOnline) {
                const g = this.gestor;
                if (this._pauseHelpOpen) {
                    if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Backspace') this._pauseHelpOpen = false;
                    e.preventDefault();
                    return;
                }
                const nOpt = this._pauseOptions().length;
                if (e.code === 'ArrowUp' || e.code === 'KeyW') g.pauseMenuSelection = (g.pauseMenuSelection + nOpt - 1) % nOpt;
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') g.pauseMenuSelection = (g.pauseMenuSelection + 1) % nOpt;
                else if (e.code === 'Enter' || e.code === 'Space') this._handlePauseMenuConfirm();
                e.preventDefault();
                return;
            }
            const enMenuFinal = this.enLinea && this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO;
            if (this.enLinea && !enMenuFinal && this._teclaEnLinea(e.code, true)) {
                e.preventDefault();
                return;
            }
            if (!this.player || !this.gestor) return;
            // Menú / diálogos HTML: no manejar controles del partido (permite escribir en la cuenta).
            if (uiHTMLActiva()) {
                this._clearPlayerKeys();
                return;
            }
            const k = this.player.keys;
            const g = this.gestor;

            // Pausa del partido: Escape abre/cierra y el menú admite teclado.
            if (e.code === 'Escape' && g.estado !== EstadoPartido.FINALIZADO) {
                e.preventDefault();
                if (g.pausado && this._pauseHelpOpen) {
                    this._pauseHelpOpen = false;
                    return;
                }
                g.pausado = !g.pausado;
                g.pauseMenuSelection = 0;
                this._pauseHelpOpen = false;
                this._clearPlayerKeys();
                return;
            }
            if (g.pausado) {
                if (this._pauseHelpOpen) {
                    if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space' || e.code === 'Backspace') {
                        this._pauseHelpOpen = false;
                    }
                    e.preventDefault();
                    return;
                }
                const nOpt = this._pauseOptions().length;
                if (e.code === 'ArrowUp' || e.code === 'KeyW') g.pauseMenuSelection = (g.pauseMenuSelection + nOpt - 1) % nOpt;
                else if (e.code === 'ArrowDown' || e.code === 'KeyS') g.pauseMenuSelection = (g.pauseMenuSelection + 1) % nOpt;
                else if (e.code === 'Enter' || e.code === 'Space') this._handlePauseMenuConfirm();
                e.preventDefault();
                return;
            }

            // Menú de fin de partido
            if (g.estado === EstadoPartido.FINALIZADO) {
                if (e.code === 'ArrowUp' || e.code === 'KeyW') {
                    g.endMenuSelection = 0;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'ArrowDown' || e.code === 'KeyS') {
                    g.endMenuSelection = 1;
                    e.preventDefault();
                    return;
                }
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    this._handleEndMenuConfirm();
                    return;
                }
                return; // bloquea el resto de controles
            }

            if (!this._heldMove) this._heldMove = { up: false, down: false, left: false, right: false, shift: false };
            const held = this._heldMove;
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':    held.up = true;    k.up = true; break;
                case 'KeyS': case 'ArrowDown':  held.down = true;  k.down = true; break;
                case 'KeyA': case 'ArrowLeft':  held.left = true;  k.left = true; break;
                case 'KeyD': case 'ArrowRight': held.right = true; k.right = true; break;
                case 'ShiftLeft': case 'ShiftRight': held.shift = true; k.shift = true; break;

                case 'Space':
                    e.preventDefault();
                    if (g.isPlaying() && !e.repeat) this.player.actionSpace(this.ball);
                    break;

                case 'KeyQ':
                    e.preventDefault();
                    if (g.isPlaying()) this._switchPlayer();
                    break;

                case 'KeyE':
                    e.preventDefault();
                    if (g.isPlaying()) {
                        const mates = g.getLocalTeammates(this.player);
                        this.player.actionPass(this.ball, mates);
                    }
                    break;

                case 'KeyR':
                    e.preventDefault();
                    if (g.isPlaying()) {
                        this.player.actionLongPass(this.ball, g.getLocalTeammates(this.player));
                    }
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (escribiendoEnFormulario(e)) return;
            const enMenuFinal = this.enLinea && this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO;
            if (this.enLinea && !enMenuFinal && this._teclaEnLinea(e.code, false)) {
                e.preventDefault();
                return;
            }
            if (!this.player) return;
            if (uiHTMLActiva()) {
                this._clearPlayerKeys();
                return;
            }
            if (!this._heldMove) this._heldMove = { up: false, down: false, left: false, right: false, shift: false };
            const held = this._heldMove;
            const k = this.player.keys;
            switch (e.code) {
                case 'KeyW': case 'ArrowUp':    held.up = false;    k.up = false; break;
                case 'KeyS': case 'ArrowDown':  held.down = false;  k.down = false; break;
                case 'KeyA': case 'ArrowLeft':  held.left = false;  k.left = false; break;
                case 'KeyD': case 'ArrowRight': held.right = false; k.right = false; break;
                case 'ShiftLeft': case 'ShiftRight': held.shift = false; k.shift = false; break;
                case 'Space':
                    e.preventDefault();
                    if (this.player && this.ball) this.player.releaseShotCharge(this.ball);
                    break;
            }
        });

        // Clic en botones del menú final
        this.canvas.addEventListener('click', (e) => {
            if (!this.gestor) return;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = CONFIG.WIDTH / rect.width;
            const scaleY = CONFIG.HEIGHT / rect.height;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;

            if (this.enLinea && this._menuOnline) {
                const b = this.pauseButtons;
                if (this._pauseHelpOpen) {
                    if (this._hit(mx, my, b.volverAyuda)) this._pauseHelpOpen = false;
                    return;
                }
                const opts = this._pauseOptions();
                for (let i = 0; i < opts.length; i++) {
                    const btn = b[opts[i].action];
                    if (btn && this._hit(mx, my, btn)) {
                        this.gestor.pauseMenuSelection = i;
                        this._handlePauseMenuConfirm();
                        break;
                    }
                }
                return;
            }
            if (this.gestor.pausado) {
                const b = this.pauseButtons;
                if (this._pauseHelpOpen) {
                    if (this._hit(mx, my, b.volverAyuda)) this._pauseHelpOpen = false;
                    return;
                }
                const opts = this._pauseOptions();
                for (let i = 0; i < opts.length; i++) {
                    const btn = b[opts[i].action];
                    if (btn && this._hit(mx, my, btn)) {
                        this.gestor.pauseMenuSelection = i;
                        this._handlePauseMenuConfirm();
                        break;
                    }
                }
                return;
            }
            if (this.gestor.estado !== EstadoPartido.FINALIZADO) return;
            const b = this.endButtons;
            if (this._hit(mx, my, b.revancha)) {
                this.gestor.endMenuSelection = 0;
                this._handleEndMenuConfirm();
            } else if (this._hit(mx, my, b.menu)) {
                this.gestor.endMenuSelection = 1;
                this._handleEndMenuConfirm();
            }
        });
    },

    _clearPlayerKeys() {
        this._heldMove = { up: false, down: false, left: false, right: false, shift: false };
        if (this.player && this.player.keys) {
            this.player.keys = { up: false, down: false, left: false, right: false, shift: false };
            this.player.releaseShotCharge?.(this.ball);
        }
    },

    _handlePauseMenuConfirm() {
        // En línea el menú usa _menuOnline; offline usa gestor.pausado.
        if (this.enLinea) {
            if (!this._menuOnline) return;
        } else if (!this.gestor || !this.gestor.pausado) {
            return;
        }
        const opts = this._pauseOptions();
        const opt = opts[this.gestor.pauseMenuSelection];
        if (!opt) return;
        if (opt.action === 'continuar') {
            if (this.enLinea) this._menuOnline = false;
            else this.gestor.pausado = false;
            this._pauseHelpOpen = false;
            this._clearPlayerKeys();
        } else if (opt.action === 'ayuda') {
            this._pauseHelpOpen = true;
        } else if (opt.action === 'reiniciar') {
            this._pauseHelpOpen = false;
            this._initMatch();
        } else if (opt.action === 'salir') {
            this._pauseHelpOpen = false;
            if (this.enLinea) {
                this._menuOnline = false;
                this._salirDeLinea(false);
            } else {
                this._showMainMenu();
            }
        }
    },

    _hit(mx, my, btn) {
        return mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h;
    },

    _handleEndMenuConfirm() {
        const sel = this.gestor.endMenuSelection;
        if (this.enLinea) {
            // 0 = REVANCHA (aceptar), 1 = menú (rechazar)
            if (sel === 0) {
                if (typeof this._pedirRevancha === 'function') this._pedirRevancha(true);
            } else {
                if (typeof this._pedirRevancha === 'function') this._pedirRevancha(false);
                this._salirDeLinea(false);
            }
            return;
        }
        if (this.modoLiga) {            // liga: no hay revancha, se vuelve a la tabla
            this._showMainMenu();
            return;
        }
        if (sel === 0) {
            // REVANCHA → nuevo partido
            this._initMatch();
        } else {
            // Volver al menú principal y pausar la simulación.
            this._showMainMenu();
        }
    },
});

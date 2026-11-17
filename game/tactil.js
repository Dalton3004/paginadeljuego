import { Game } from '../game.js';
// Game — pausa y controles táctiles.
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    // Pausa (offline / liga) o menú de salida (en línea, donde el servidor no se puede frenar).
    _alternarPausa() {
        if (!this.gestor) return;
        if (this.enLinea) {
            if (this.gestor.estado === EstadoPartido.FINALIZADO) { this._menuOnline = false; return; }
            this._menuOnline = !this._menuOnline;
            this.gestor.pauseMenuSelection = 0;
            this._pauseHelpOpen = false;
            if (this._menuOnline && this.teclas) {      // al abrir el menú se sueltan todas las teclas
                for (const k of Object.keys(this.teclas)) this.teclas[k] = false;
                this._inputDirty = true;
                this._emitirInput();
            }
            return;
        }
        if (this.gestor.estado === EstadoPartido.FINALIZADO) return;
        this.gestor.pausado = !this.gestor.pausado;
        this.gestor.pauseMenuSelection = 0;
        this._pauseHelpOpen = false;
        this._clearPlayerKeys();
    },

    _tienePelotaControlada() {
        const p = this.player;
        return !!(p && p.hasBall && this.ball && this.ball.owner === p);
    },

    // Botón contextual BARRER/TIRO y rótulo PAUSA / MENÚ.
    _actualizarBotonesTactiles() {
        if (this._btnAccion === undefined) {
            this._btnAccion = document.getElementById('btn-accion');
            this._btnPausa = document.getElementById('pause-touch');
            this._modoAccion = '';
            this._btnAccionSinEnergia = false;
        }
        const p = this.player;
        if (this._btnAccion) {
            const tiene = this._tienePelotaControlada();
            const modo = tiene ? 'tiro' : 'barrer';
            if (modo !== this._modoAccion) {
                this._modoAccion = modo;
                const label = this._btnAccion.querySelector('.tc-label');
                if (label) label.textContent = tiene ? 'TIRO' : 'BARRER';
                this._btnAccion.classList.toggle('tc-tiro', tiene);
                this._btnAccion.classList.toggle('tc-barrer', !tiene);
                this._btnAccion.setAttribute('aria-label', tiene ? 'Tiro' : 'Barrer');
            }
            const sin = !tiene && !!(p && !p.isGK && p.stamina < p.costoBarrida());
            if (sin !== this._btnAccionSinEnergia) {
                this._btnAccionSinEnergia = sin;
                this._btnAccion.classList.toggle('sin-energia', sin);
            }
        }
        if (this._btnPausa) {
            const t = this.enLinea ? 'MENÚ' : 'PAUSA';
            if (this._btnPausa.textContent !== t) this._btnPausa.textContent = t;
        }
    },

    _bindTouchControls() {
        const zona = document.getElementById('touch-controls');
        if (zona) zona.addEventListener('contextmenu', e => e.preventDefault());   // sin menú de "mantener presionado"

        const pauseButton = document.getElementById('pause-touch');
        if (pauseButton) {
            let ultimo = 0;
            const alternar = e => {
                e.preventDefault();
                const ahora = performance.now();
                if (ahora - ultimo < 350) return;      // pointerup y click del mismo toque
                ultimo = ahora;
                this._alternarPausa();
            };
            pauseButton.addEventListener('pointerup', alternar);
            pauseButton.addEventListener('click', alternar);
        }

        // Botones de acción (sprint, tiro, barrer, pase, cambiar)
        document.querySelectorAll('#touch-controls [data-key]').forEach(button => {
            const code = button.dataset.key;
            // El dedo sigue "agarrado" al botón aunque se deslice afuera (si el navegador no lo permite, no pasa nada).
            const capturar = e => {
                try { if (button.setPointerCapture && e.pointerId !== undefined) button.setPointerCapture(e.pointerId); } catch (_) {}
            };
            const down = e => {
                e.preventDefault();
                button.classList.add('pulsado');
                if (code === 'Accion') {
                    const tiene = this._tienePelotaControlada();
                    this._accionTactil = tiene ? 'tiro' : 'barrer';
                    if (this.enLinea) this._teclaEnLinea(tiene ? 'Tiro' : 'Barrer', true);
                    else if (this.player && this.gestor && this.gestor.isPlaying()) {
                        if (tiene) this.player.actionShoot(this.ball);
                        else this.player.actionSlide(this.ball);
                    }
                    capturar(e);
                    return;
                }
                if (this.enLinea) {
                    this._teclaEnLinea(code, true);
                    capturar(e);
                    return;
                }
                if (!this.player || !this.gestor || !this.gestor.isPlaying()) return;
                if (code === 'Tiro') this.player.actionShoot(this.ball);
                else if (code === 'Barrer') this.player.actionSlide(this.ball);
                else if (code === 'Space') this.player.actionSpace(this.ball);
                else if (code === 'KeyE') this.player.actionPass(this.ball, this.gestor.getLocalTeammates(this.player));
                else if (code === 'KeyQ') this._switchPlayer();
                else if (code === 'KeyR') this.player.actionLongPass(this.ball, this.gestor.getLocalTeammates(this.player));
                else {
                    const map = {KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ShiftLeft:'shift'};
                    if (map[code]) this.player.keys[map[code]] = true;
                }
                capturar(e);
            };
            const up = e => {
                e.preventDefault();
                button.classList.remove('pulsado');
                if (code === 'Accion') {
                    const era = this._accionTactil;
                    this._accionTactil = null;
                    if (this.enLinea) this._teclaEnLinea(era === 'tiro' ? 'Tiro' : 'Barrer', false);
                    else if (era === 'tiro' && this.player) this.player.releaseShotCharge(this.ball);
                    return;
                }
                if (this.enLinea) {
                    this._teclaEnLinea(code, false);
                    return;
                }
                if (!this.player) return;
                if (code === 'Tiro' || code === 'Space') this.player.releaseShotCharge(this.ball);
                const map = {KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',ShiftLeft:'shift'};
                if (map[code]) this.player.keys[map[code]] = false;
            };
            button.addEventListener('pointerdown', down);
            button.addEventListener('pointerup', up);
            button.addEventListener('pointercancel', up);
            button.addEventListener('lostpointercapture', up);
        });

        // Joystick virtual deslizante (movimiento)
        this._bindVirtualJoystick();
    },

    _bindVirtualJoystick() {
        const stick = document.getElementById('touch-joystick');
        const knob = document.getElementById('joy-knob');
        if (!stick || !knob) return;

        let MAX_RADIUS = 36;         // px que se puede alejar el knob del centro (se ajusta al tamaño real)
        const DEADZONE = 0.18;       // zona muerta relativa (0-1)
        let activePointer = null;
        let originX = 0, originY = 0;
        // Últimas direcciones emitidas (para online: solo enviar cambios)
        let lastDirs = { up: false, down: false, left: false, right: false };

        const setKnob = (dx, dy) => {
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const applyDirs = (up, down, left, right) => {
            if (!this._heldMove) this._heldMove = { up: false, down: false, left: false, right: false, shift: false };
            this._heldMove.up = !!up;
            this._heldMove.down = !!down;
            this._heldMove.left = !!left;
            this._heldMove.right = !!right;
            if (this.enLinea) {
                const pairs = [
                    ['up', 'KeyW', up],
                    ['down', 'KeyS', down],
                    ['left', 'KeyA', left],
                    ['right', 'KeyD', right]
                ];
                for (const [key, code, val] of pairs) {
                    if (lastDirs[key] !== val) {
                        this._teclaEnLinea(code, val);
                        lastDirs[key] = val;
                    }
                }
                return;
            }
            if (!this.player) return;
            this.player.keys.up = up;
            this.player.keys.down = down;
            this.player.keys.left = left;
            this.player.keys.right = right;
            lastDirs = { up, down, left, right };
        };

        const updateFromPoint = (clientX, clientY) => {
            let dx = clientX - originX;
            let dy = clientY - originY;
            const dist = Math.hypot(dx, dy);
            if (dist > MAX_RADIUS) {
                const s = MAX_RADIUS / dist;
                dx *= s;
                dy *= s;
            }
            setKnob(dx, dy);

            const nx = dx / MAX_RADIUS;
            const ny = dy / MAX_RADIUS;
            const mag = Math.hypot(nx, ny);

            if (mag < DEADZONE) {
                applyDirs(false, false, false, false);
                return;
            }

            // Umbral para activar cada eje (permite 8 direcciones cómodas)
            const AXIS = 0.32;
            applyDirs(ny < -AXIS, ny > AXIS, nx < -AXIS, nx > AXIS);
        };

        const onDown = (e) => {
            if (activePointer !== null) return;
            e.preventDefault();
            activePointer = e.pointerId;
            const rect = stick.getBoundingClientRect();
            MAX_RADIUS = Math.max(22, Math.round(rect.width * 0.305));
            originX = rect.left + rect.width / 2;
            originY = rect.top + rect.height / 2;
            knob.classList.add('active');
            if (stick.setPointerCapture) stick.setPointerCapture(e.pointerId);
            updateFromPoint(e.clientX, e.clientY);
        };

        const onMove = (e) => {
            if (e.pointerId !== activePointer) return;
            e.preventDefault();
            updateFromPoint(e.clientX, e.clientY);
        };

        const onUp = (e) => {
            if (e.pointerId !== activePointer && e.type !== 'lostpointercapture') return;
            activePointer = null;
            knob.classList.remove('active');
            setKnob(0, 0);
            applyDirs(false, false, false, false);
        };

        stick.addEventListener('pointerdown', onDown);
        stick.addEventListener('pointermove', onMove);
        stick.addEventListener('pointerup', onUp);
        stick.addEventListener('pointercancel', onUp);
        stick.addEventListener('lostpointercapture', onUp);
    },
});

import { Game } from '../game.js';
import { ESTADOS_HINCHADA, ControladorHinchada } from '../career/ambiente_core.js';

export { ESTADOS_HINCHADA, ControladorHinchada };

/**
 * ETAPA 14 — Audio y carteles visuales de Hinchada Dinámica sobre `Game.prototype`.
 */
Object.assign(Game.prototype, {
    _initControladorHinchada({ esClasico = false, esFinal = false, intensidadBase = 0.12 } = {}) {
        if (!this._ctrlHinchada) {
            this._ctrlHinchada = new ControladorHinchada({ esClasico, esFinal, intensidadBase });
        } else {
            this._ctrlHinchada.reiniciar({ esClasico, esFinal, intensidadBase });
        }
    },

    /** Exclamación sintética muy suave ("uuuh" de tribuna) sin requerir descargas pesadas extra. */
    _sonarExclamacionTribuna(tipo) {
        if (this.prefs && this.prefs.sfxEnabled === false) return;
        const ctx = this._audioCtx;
        if (!ctx || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        if (this._lastCrowdSfxAt && now - this._lastCrowdSfxAt < 1.2) return;
        this._lastCrowdSfxAt = now;

        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            const vol = Math.min(0.06, (Number(this.prefs && this.prefs.sfxVolume) || 0.8) * 0.055);
            if (tipo === 'gasp') {
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(135, now + 0.32);
            } else {
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(260, now + 0.26);
            }
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(vol, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.38);
        } catch (_e) {
            // ignorar si el contexto de audio está restringido
        }
    },

    _aplicarVolumenHinchadaDinamica(mult = 1) {
        if (this.prefs && this.prefs.musicEnabled === false) return;
        if (this._faseMusica() !== 'partido') return;
        const base = this._volCanto();
        const target = Math.max(0, Math.min(0.26, base * mult));
        if (this._cantoGain && this._audioCtx) {
            try {
                this._cantoGain.gain.setTargetAtTime(target, this._audioCtx.currentTime, 0.25);
            } catch (_e) {}
        } else if (this._cancha) {
            this._cancha.volume = target;
        }
    },

    _drawBannerHinchada(ctx) {
        if (!this._ctrlHinchada || !this._ctrlHinchada.banner) return;
        if (this.prefs && this.prefs.reduceMotion) return;
        if (!this.gestor || this.gestor.estado === EstadoPartido.PREPARANDO || this.gestor.estado === EstadoPartido.CUENTA_REGRESIVA) {
            return;
        }
        const b = this._ctrlHinchada.banner;
        const alpha = Math.min(1, b.ttl * 2.2);
        const W = CONFIG.WIDTH;

        ctx.save();
        ctx.globalAlpha = alpha * 0.92;
        ctx.font = 'bold 9.5px Courier New';
        const tw = Math.min(W - 32, Math.max(180, ctx.measureText(b.texto).width + 22));
        const bx = (W - tw) / 2;
        const by = 46;

        ctx.fillStyle = 'rgba(4, 12, 28, 0.86)';
        ctx.fillRect(bx, by, tw, 18);
        ctx.strokeStyle = b.color || '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, tw, 18);

        ctx.fillStyle = b.color || '#ffcc00';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.texto, W / 2, by + 9.5);
        ctx.restore();
    },
});

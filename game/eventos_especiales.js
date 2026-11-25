import { Game } from '../game.js';
import { clasificarEventoEspecial } from '../career/ambiente_core.js';

export { clasificarEventoEspecial };

/**
 * ETAPA 16 — Renderizado de Estadio y Finales Especiales sobre `Game.prototype`.
 */
Object.assign(Game.prototype, {
    _clasificarEventoPartido(opts) {
        return clasificarEventoEspecial(opts);
    },

    _drawDecoracionEspecialCancha(ctx) {
        const ev = this._eventoEspecial;
        if (!ev || !ev.esEspecial) return;

        ctx.save();
        // Carteles LED / banderas especiales sobre el borde superior e inferior de la valla
        ctx.fillStyle = 'rgba(6, 14, 30, 0.84)';
        ctx.fillRect(92, 50, 92, 12);
        ctx.fillRect(296, 50, 92, 12);
        ctx.strokeStyle = ev.color;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(92, 50, 92, 12);
        ctx.strokeRect(296, 50, 92, 12);

        ctx.fillStyle = ev.color;
        ctx.font = 'bold 7px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const corto =
            ev.tipo === 'supercopa'
                ? '★ SUPERCOPA ★'
                : ev.tipo === 'final_copa'
                ? '★ GRAN FINAL ★'
                : ev.tipo === 'partido_decisivo_liga'
                ? '★ DEFINICIÓN ★'
                : '🔥 CLÁSICO 🔥';
        ctx.fillText(corto, 138, 56);
        ctx.fillText(corto, 342, 56);

        // Pedestal y trofeo dorado al costado de la línea media en Finales y Supercopa
        if (ev.mostrarTrofeo) {
            const tx = 24;
            const ty = CONFIG.HEIGHT / 2;
            // Alfombra roja/dorada ceremonial
            ctx.fillStyle = '#7a1220';
            ctx.fillRect(tx - 9, ty - 14, 18, 24);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 1;
            ctx.strokeRect(tx - 9, ty - 14, 18, 24);
            // Pedestal
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(tx - 6, ty - 2, 12, 9);
            // Copa pixel-art brillante
            const shine = 0.85 + 0.15 * Math.sin(performance.now() / 220);
            ctx.globalAlpha = shine;
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(tx - 5, ty - 12, 10, 7);
            ctx.fillRect(tx - 2, ty - 5, 4, 4);
            ctx.fillRect(tx - 5, ty - 2, 10, 2);
            ctx.fillStyle = '#fff8c4';
            ctx.fillRect(tx - 3, ty - 11, 2, 4);
        }
        ctx.restore();
    },

    _dispararCelebracionEspecialFinal() {
        const ev = this._eventoEspecial;
        if (!ev || !ev.esEspecial || !this.fx) return;
        if (this.prefs && this.prefs.reduceMotion) return;
        const g = this.gestor;
        if (!g) return;
        const ganoUsuario =
            g.golesLocal > g.golesRival ||
            (this._resultadoPenales && this._resultadoPenales.ganador === 'mio');
        if (!ganoUsuario) return;

        const W = CONFIG.WIDTH;
        for (let i = 0; i < 28; i++) {
            this.fx.confetti(40 + Math.random() * (W - 80), 46 + Math.random() * 40, 1);
        }
    },
});

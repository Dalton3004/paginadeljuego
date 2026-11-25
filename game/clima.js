import { Game } from '../game.js';
import { CLIMAS_ORDEN, CLIMAS_CATALOGO, elegirClimaPartido } from '../career/ambiente_core.js';

export { CLIMAS_ORDEN, CLIMAS_CATALOGO, elegirClimaPartido };

/**
 * ETAPA 15 — Renderizado y ciclo de Clima y Variantes de Estadio sobre `Game.prototype`.
 */
Object.assign(Game.prototype, {
    _initClimaPartido({ esFinal = false, esSupercopa = false, esClasico = false } = {}) {
        const reduce = !!(this.prefs && this.prefs.reduceMotion);
        const pref = (this.seleccion && this.seleccion.clima) || 'auto';
        const cfg = elegirClimaPartido({
            preferencia: this.enLinea ? 'dia' : pref, // en Online cancha limpia estándar salvo elección futura
            esFinal,
            esSupercopa,
            esClasico,
            reduceMotion: reduce,
        });

        const W = typeof CONFIG !== 'undefined' ? CONFIG.WIDTH : 480;
        const H = typeof CONFIG !== 'undefined' ? CONFIG.HEIGHT : 640;
        const cantGotas = reduce ? Math.min(18, Math.floor(cfg.gotas * 0.4)) : cfg.gotas;
        const gotas = [];
        for (let i = 0; i < cantGotas; i++) {
            gotas.push({
                x: Math.random() * W,
                y: Math.random() * H,
                len: cfg.id === 'lluvia_intensa' ? 11 + Math.random() * 6 : 8 + Math.random() * 4,
                sp: cfg.id === 'lluvia_intensa' ? 430 + Math.random() * 120 : 320 + Math.random() * 90,
            });
        }

        this._climaEstado = {
            cfg,
            gotas,
            splashes: [],
            flashAlpha: 0,
            nextThunder: 7 + Math.random() * 9,
            fogTime: 0,
        };
        return cfg;
    },

    _emitirSplashLluvia(x, y, cantidad = 3) {
        const st = this._climaEstado;
        if (!st || st.cfg.gotas <= 0) return;
        if (this.prefs && this.prefs.reduceMotion) return;
        for (let i = 0; i < cantidad; i++) {
            if (st.splashes.length >= 28) break;
            st.splashes.push({
                x: x + (Math.random() - 0.5) * 8,
                y: y + (Math.random() - 0.5) * 4,
                vx: (Math.random() - 0.5) * 36,
                vy: -(16 + Math.random() * 24),
                life: 0,
                max: 0.22 + Math.random() * 0.12,
            });
        }
    },

    _updateClima(dt) {
        const st = this._climaEstado;
        if (!st || (this.gestor && this.gestor.pausado)) return;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const reduce = !!(this.prefs && this.prefs.reduceMotion);

        if (st.gotas.length > 0) {
            const vx = st.cfg.id === 'lluvia_intensa' ? -78 : -46;
            for (let i = 0; i < st.gotas.length; i++) {
                const g = st.gotas[i];
                g.x += vx * dt;
                g.y += g.sp * dt;
                if (g.y > H + 12) {
                    g.y = -12;
                    g.x = Math.random() * (W + 60);
                } else if (g.x < -15) {
                    g.x = W + 10;
                }
            }

            // Salpicaduras de agua al correr rápido, barrer o patear bajo la lluvia
            if (!reduce && this.ball && this.ball._justKicked) {
                this._emitirSplashLluvia(this.ball.pos.x, this.ball.pos.y + 3, 4);
            }
            if (!reduce && Array.isArray(this.players)) {
                for (const p of this.players) {
                    if (p && p.isSliding && Math.random() < 0.35) {
                        this._emitirSplashLluvia(p.pos.x, p.pos.y + 4, 2);
                    }
                }
            }
        }

        if (st.splashes.length > 0) {
            let write = 0;
            for (let i = 0; i < st.splashes.length; i++) {
                const s = st.splashes[i];
                s.life += dt;
                if (s.life < s.max) {
                    s.x += s.vx * dt;
                    s.y += s.vy * dt;
                    s.vy += 120 * dt;
                    st.splashes[write++] = s;
                }
            }
            st.splashes.length = write;
        }

        if (st.cfg.relampagos && !reduce) {
            if (st.flashAlpha > 0) {
                st.flashAlpha = Math.max(0, st.flashAlpha - dt * 1.9);
            }
            st.nextThunder -= dt;
            if (st.nextThunder <= 0) {
                st.flashAlpha = 0.22;
                st.nextThunder = 9 + Math.random() * 12;
            }
        }

        if (st.cfg.niebla && !reduce) {
            st.fogTime += dt;
        }
    },

    /** Capa sobre el césped pero debajo de los jugadores (tono de campo y charcos sutiles). */
    _drawClimaUnder(ctx) {
        const st = this._climaEstado;
        if (!st) return;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;

        if (st.cfg.tintCancha) {
            ctx.fillStyle = st.cfg.tintCancha;
            ctx.fillRect(0, 0, W, H);
        }

        // Charcos sutiles en tormenta intensa (solo estéticos, sin tapar líneas)
        if (st.cfg.id === 'lluvia_intensa') {
            ctx.save();
            ctx.fillStyle = 'rgba(130, 185, 240, 0.11)';
            const puddles = [
                [118, 210, 22, 8],
                [356, 268, 25, 9],
                [142, 434, 24, 8],
                [338, 472, 20, 7],
            ];
            for (const [px, py, rx, ry] of puddles) {
                ctx.beginPath();
                ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        if (st.splashes.length > 0) {
            ctx.fillStyle = 'rgba(200, 232, 255, 0.75)';
            for (const s of st.splashes) {
                ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
            }
        }
    },

    /** Capa atmosférica sobre jugadores pero DEBAJO del HUD (reflectores, lluvia, niebla). */
    _drawClimaOver(ctx) {
        const st = this._climaEstado;
        if (!st) return;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;

        // Haces de reflectores en partidos nocturnos o lluviosos
        if (st.cfg.reflectores) {
            ctx.save();
            const corners = [
                [0, 42, 165, 210],
                [W, 42, W - 165, 210],
                [0, H, 165, H - 190],
                [W, H, W - 165, H - 190],
            ];
            for (const [x0, y0, x1, y1] of corners) {
                const g = ctx.createRadialGradient(x0, y0, 6, x0, y0, 210);
                g.addColorStop(0, 'rgba(255, 248, 210, 0.14)');
                g.addColorStop(1, 'rgba(255, 248, 210, 0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y0);
                ctx.lineTo(x0, y1);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        // Gotas de lluvia pixel-crisp
        if (st.gotas.length > 0) {
            ctx.save();
            ctx.strokeStyle =
                st.cfg.id === 'lluvia_intensa'
                    ? 'rgba(205, 230, 255, 0.48)'
                    : 'rgba(205, 230, 255, 0.34)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            const dx = st.cfg.id === 'lluvia_intensa' ? -2.4 : -1.4;
            for (let i = 0; i < st.gotas.length; i++) {
                const g = st.gotas[i];
                ctx.moveTo(g.x, g.y);
                ctx.lineTo(g.x + dx, g.y + g.len);
            }
            ctx.stroke();
            ctx.restore();
        }

        // Niebla suave en los bordes (mantiene el centro de la cancha nítido)
        if (st.cfg.niebla) {
            ctx.save();
            const drift = Math.sin(st.fogTime * 0.45) * 18;
            const topFog = ctx.createLinearGradient(0, 40, 0, 175);
            topFog.addColorStop(0, 'rgba(220, 234, 248, 0.30)');
            topFog.addColorStop(1, 'rgba(220, 234, 248, 0)');
            ctx.fillStyle = topFog;
            ctx.fillRect(0, 40, W, 140);

            const botFog = ctx.createLinearGradient(0, H - 135, 0, H);
            botFog.addColorStop(0, 'rgba(220, 234, 248, 0)');
            botFog.addColorStop(1, 'rgba(220, 234, 248, 0.28)');
            ctx.fillStyle = botFog;
            ctx.fillRect(0, H - 135, W, 135);

            ctx.fillStyle = 'rgba(226, 238, 250, 0.09)';
            ctx.beginPath();
            ctx.ellipse(W * 0.5 + drift, 108, 190, 28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (st.flashAlpha > 0) {
            ctx.fillStyle = `rgba(235, 245, 255, ${st.flashAlpha.toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
        }
    },
});

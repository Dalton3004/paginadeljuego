/** Mundo FX: partículas, sacudida, trail, orquestación. */
import {
    TAU, clamp, easeOut, makeRng,
    userCfg, GLOBAL_DEF,
} from './helpers.js';
import { EstadoJugador, CONFETTI } from './estado_jugador.js';

export class Mundo {
    constructor(game) {
        this.game = game;
        this.enabled = true;
        this.errors = 0;
        this.rng = makeRng(20260110);
        this.calmaSistema = 1;
        this._cfgGlobal = Object.assign({}, GLOBAL_DEF, userCfg().global || {});
        try {
            if (typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.calmaSistema = 0.5;
            }
        } catch (_e) { /* sin matchMedia */ }
        this.reset();
    }

    get calma() {
        const prefReduce = !!(this.game && this.game.prefs && this.game.prefs.reduceMotion);
        return prefReduce ? 0.35 : this.calmaSistema;
    }

    get G() {
        return this._cfgGlobal;
    }

    reset() {
        if (this.parts) this.parts.length = 0;
        else this.parts = [];
        if (this.states) this.states.clear();
        else this.states = new Map();
        this.mode = 'juego';
        this.modeT = 0;
        this.celeb = { team: null, scorer: null };
        this.shakeAmp = 0;
        this.ballSpin = 0;
        this.lastBallSpeed = 0;
        this.prevBallVel = { x: 0, y: 0 };
        if (this.trail) this.trail.length = 0;
        else this.trail = [];
        this.gestorRef = null;
        this.lastOwner = null;
        this.prevGoles = [0, 0];
        this.confettiT = 0;
    }

    _fail(e) {
        this.errors++;
        if (typeof console !== 'undefined' && console.warn) console.warn('[FX] error, se desactivan los efectos:', e);
        if (this.errors >= 3) { this.enabled = false; this.states.clear(); this.parts.length = 0; }
    }

    // ---------- ciclo ----------
    update(dt) {
        if (!this.enabled) return;
        try { this._update(dt); } catch (e) { this._fail(e); }
    }

    _update(dt) {
        const g = this.game, ge = g.gestor;
        if (!ge) return;
        if (this.gestorRef !== ge) {
            this.reset();
            this.gestorRef = ge;
            this.prevGoles = [ge.golesLocal, ge.golesRival];
        }
        const modo = ge.estado === 'CELEBRANDO_GOL' ? 'gol' : (ge.estado === 'FINALIZADO' ? 'fin' : 'juego');
        const newMode = modo !== this.mode;
        if (newMode) this._setMode(modo, ge);
        this.modeT += dt;

        const b = g.ball;
        if (b && b.owner) this.lastOwner = b.owner;

        g.players.forEach((p, i) => {
            let st = this.states.get(p);
            if (!st) { st = new EstadoJugador(p, this, i); this.states.set(p, st); }
            if (newMode) st.onMode();
            st.update(dt);
        });

        if (this.mode === 'gol' && this.confettiT > 0) {
            this.confettiT -= dt;
            if (this.G.particulas > 0 && this.calma >= 0.5) {
                const W = typeof CONFIG !== 'undefined' ? CONFIG.WIDTH : 480;
                this.confetti(60 + this.rng() * (W - 120), 50, 1);
                if (this.rng() < 0.6) this.confetti(60 + this.rng() * (W - 120), 50, 1);
            }
        }

        this._updateBall(dt, b);
        this._updateParts(dt);
        this.shakeAmp *= Math.exp(-dt * 9);
        if (this.shakeAmp < 0.02) this.shakeAmp = 0;
    }

    _setMode(modo, ge) {
        this.mode = modo;
        this.modeT = 0;
        const g = this.game;
        if (modo === 'gol') {
            const local = ge.golesLocal > this.prevGoles[0];
            const team = local ? 'local' : 'rival';
            let scorer = (this.lastOwner && this.lastOwner.team === team && !this.lastOwner.isGK) ? this.lastOwner : null;
            if (!scorer && g.ball) {
                let best = Infinity;
                for (const p of g.players) {
                    if (p.team !== team || p.isGK) continue;
                    const d = p.pos.distanceTo(g.ball.pos);
                    if (d < best) { best = d; scorer = p; }
                }
            }
            this.celeb = { team, scorer };
            const goal = local ? CONFIG.GOAL_NORTH : CONFIG.GOAL_SOUTH;
            const gx = goal.x + goal.w / 2, gy = goal.lineY;
            this.shake(7.5);
            for (let i = 0; i < 16; i++) this.star(gx + (this.rng() - 0.5) * goal.w, gy, (this.rng() - 0.5) * 150, (local ? 1 : -1) * (30 + this.rng() * 85));
            this.ring(gx, gy, 54);
            this.ring(gx, gy, 30);
            this.flash(gx, gy, 24, '#fff6b0');
            this.confettiT = 1.8;
            // La hinchada festeja: los del equipo propio todos, los del rival solo una parte
            if (g.hinchada && typeof g.hinchada.goal === 'function') {
                g.hinchada.goal(local ? 'north' : 'south', { fraction: local ? 1 : 0.5, duration: 2.8 + 1.2 });
            }
        } else if (modo === 'fin') {
            const l = ge.golesLocal, r = ge.golesRival;
            this.celeb = { team: l > r ? 'local' : (r > l ? 'rival' : null), scorer: null };
        } else {
            this.celeb = { team: null, scorer: null };
        }
        this.prevGoles = [ge.golesLocal, ge.golesRival];
    }

    roleOf(p) {
        const c = this.celeb;
        if (!c || !c.team) return 'neutral';
        if (p === c.scorer) return 'goleador';
        return p.team === c.team ? 'alegria' : 'tristeza';
    }

    get ball() { return this.game.ball; }

    _updateBall(dt, b) {
        if (!b) return;
        const k = dt * 60;
        const sp = b.vel.length();
        if (b.owner) this.ballSpin += b.owner.vel.length() * 0.035 * (b.owner.facing.x >= 0 ? 1 : -1) * k;
        else this.ballSpin += sp * 0.05 * (b.vel.x >= 0 ? 1 : -1) * k;
        this.ballSpin %= TAU;

        // Pique de una pelota que venía por el aire: un poco de polvo en el pasto
        if (b.bounceFrame) {
            b.bounceFrame = false;
            if (this.mode === 'juego') this.dust(b.pos.x, b.pos.y + 3, 2, 0.9, 2.2);
        }

        // Rebote fuerte contra palo / pared: si la pelota iba libre y cambió brusco de dirección
        if (!b.owner && this.mode === 'juego' && this.lastBallSpeed > 7.5 && sp > 3.5) {
            const dot = (b.vel.x * this.prevBallVel.x + b.vel.y * this.prevBallVel.y) / (sp * this.lastBallSpeed);
            if (dot < -0.25) {
                this.sparks(b.pos.x, b.pos.y, 5);
                this.ring(b.pos.x, b.pos.y, 16);
                this.shake(1.1);
            }
        }
        this.lastBallSpeed = sp;
        this.prevBallVel.x = b.vel.x;
        this.prevBallVel.y = b.vel.y;

        // Compactación in-place (sin asignar array nuevo cada frame)
        let tw = 0;
        for (let i = 0; i < this.trail.length; i++) {
            const q = this.trail[i];
            q.a -= dt * 5;
            if (q.a > 0) this.trail[tw++] = q;
        }
        this.trail.length = tw;
        if (this.G.estela && this.calma >= 0.5 && !b.owner && sp > 6.5 && this.mode === 'juego') {
            this.trail.push({ x: b.pos.x, y: b.pos.y - (b.z || 0), a: 1, hot: sp > 9 });
            if (this.trail.length > 14) this.trail.shift();
        }
    }

    // ---------- emisores de partículas ----------
    _n(n) {
        const v = n * this.G.particulas * this.calma;
        return Math.floor(v) + (this.rng() < (v % 1) ? 1 : 0);
    }
    _push(q) {
        this.parts.push(q);
        if (this.parts.length > 260) this.parts.splice(0, this.parts.length - 260);
    }
    shake(a) {
        if (this.game && this.game.prefs && this.game.prefs.reduceMotion) return;
        this.shakeAmp = Math.min(10, Math.max(this.shakeAmp, a));
    }
    dust(x, y, n, spread, size) {
        n = this._n(n);
        for (let i = 0; i < n; i++) {
            const r = this.rng();
            this._push({ k: 'dust', layer: 0, x: x + (this.rng() - 0.5) * 4, y, vx: (this.rng() - 0.5) * spread * 40,
                vy: -(8 + r * 22), life: 0, max: 0.35 + r * 0.3, size: size * (0.7 + this.rng() * 0.6), g: 0, drag: 2.2 });
        }
    }
    grass(x, y, n) {
        n = this._n(n);
        for (let i = 0; i < n; i++) {
            this._push({ k: 'grass', layer: 0, x, y, vx: (this.rng() - 0.5) * 70, vy: -(30 + this.rng() * 50),
                life: 0, max: 0.45 + this.rng() * 0.25, size: 1.6, g: 260, drag: 0.5 });
        }
    }
    sweat(x, y) {
        if (this._n(1) < 1) return;
        this._push({ k: 'sweat', layer: 1, x, y, vx: (this.rng() - 0.5) * 24, vy: -18, life: 0, max: 0.55, size: 1.8, g: 150, drag: 0.3 });
    }
    star(x, y, vx, vy) {
        if (this._n(1) < 1) return;
        this._push({ k: 'star', layer: 1, x, y, vx: vx !== undefined ? vx : (this.rng() - 0.5) * 50,
            vy: vy !== undefined ? vy : -(30 + this.rng() * 30), life: 0, max: 0.8 + this.rng() * 0.4,
            size: 3 + this.rng() * 2.5, g: 80, drag: 0.6, rot: this.rng() * TAU, vr: (this.rng() - 0.5) * 6 });
    }
    confetti(x, y, n) {
        n = this._n(n);
        for (let i = 0; i < n; i++) {
            this._push({ k: 'confetti', layer: 1, x, y, vx: (this.rng() - 0.5) * 40, vy: 20 + this.rng() * 40,
                life: 0, max: 1.6 + this.rng() * 0.8, size: 3, g: 55, drag: 0.4, rot: this.rng() * TAU,
                vr: (this.rng() - 0.5) * 12, color: CONFETTI[Math.floor(this.rng() * CONFETTI.length)], ph: this.rng() * TAU });
        }
    }
    ring(x, y, maxR) {
        if (this.calma < 1) return;
        this._push({ k: 'ring', layer: 0, x, y, vx: 0, vy: 0, life: 0, max: 0.45, size: maxR, g: 0, drag: 0 });
    }
    flash(x, y, size, color) {
        if (this.calma < 1 || this.G.particulas <= 0) return;
        this._push({ k: 'flash', layer: 1, x, y, vx: 0, vy: 0, life: 0, max: 0.09, size: size || 9,
            color: color || '#ffffff', rot: this.rng() * TAU, g: 0, drag: 0 });
    }
    sparks(x, y, n) {
        n = this._n(n);
        for (let i = 0; i < n; i++) {
            const a = this.rng() * TAU, s = 60 + this.rng() * 90;
            this._push({ k: 'spark', layer: 1, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.18 + this.rng() * 0.12, size: 1, g: 0, drag: 3 });
        }
    }

    _updateParts(dt) {
        let pw = 0;
        for (let i = 0; i < this.parts.length; i++) {
            const q = this.parts[i];
            q.life += dt;
            if (q.life >= q.max) continue;
            q.vx *= Math.max(0, 1 - q.drag * dt);
            q.vy = q.vy * Math.max(0, 1 - q.drag * dt * (q.k === 'dust' ? 1 : 0.3)) + q.g * dt;
            if (q.k === 'confetti') q.vx += Math.sin(q.life * 7 + q.ph) * 40 * dt;
            q.x += q.vx * dt;
            q.y += q.vy * dt;
            if (q.rot !== undefined && q.vr) q.rot += q.vr * dt;
            this.parts[pw++] = q;
        }
        this.parts.length = pw;
    }

    // ---------- dibujo ----------
    drawUnder(ctx) { if (this.enabled) try { this._draw(ctx, 0); } catch (e) { this._fail(e); } }
    drawOver(ctx) { if (this.enabled) try { this._draw(ctx, 1); } catch (e) { this._fail(e); } }

    _draw(ctx, layer) {
        if (!this.parts.length) return;
        ctx.save();
        for (const q of this.parts) {
            if (q.layer !== layer) continue;
            const a = 1 - q.life / q.max;
            ctx.globalAlpha = clamp(a, 0, 1);
            switch (q.k) {
                case 'dust':
                    ctx.fillStyle = 'rgb(222,214,190)';
                    ctx.globalAlpha = clamp(a * 0.4, 0, 1);
                    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.size * (1 + (1 - a) * 1.2)), 0, TAU); ctx.fill();
                    break;
                case 'grass':
                    ctx.fillStyle = '#3f9a3a';
                    ctx.fillRect(q.x, q.y, q.size * 1.4, q.size);
                    break;
                case 'sweat':
                    ctx.fillStyle = '#8fd3ff';
                    ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, TAU); ctx.fill();
                    break;
                case 'star': this._drawStar(ctx, q); break;
                case 'confetti':
                    ctx.save();
                    ctx.translate(q.x, q.y);
                    ctx.rotate(q.rot);
                    ctx.fillStyle = q.color;
                    ctx.fillRect(-1.5, -2.5, 3, 5 * Math.abs(Math.cos(q.life * 9 + q.ph)) + 1);
                    ctx.restore();
                    break;
                case 'ring':
                    ctx.strokeStyle = '#fff2a8';
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, q.size * easeOut(1 - a)), 0, TAU); ctx.stroke();
                    break;
                case 'flash': {
                    const r = q.size * (0.65 + 0.55 * (1 - a));
                    ctx.save();
                    ctx.translate(q.x, q.y);
                    ctx.rotate(q.rot);
                    ctx.fillStyle = q.color;
                    ctx.globalAlpha = clamp(a * 0.85, 0, 1);
                    ctx.beginPath();
                    for (let i = 0; i < 8; i++) {
                        const rad = i % 2 === 0 ? r : r * 0.28;
                        const ang = i * Math.PI / 4;
                        const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
                        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                    break;
                }
                case 'spark':
                    ctx.strokeStyle = '#ffe27a';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke();
                    break;
            }
        }
        ctx.restore();
    }

    _drawStar(ctx, q) {
        const r = q.size, r2 = r * 0.4;
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = '#ffd83a';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const rad = i % 2 === 0 ? r : r2;
            const ang = i * Math.PI / 4;
            const x = Math.cos(ang) * rad, y = Math.sin(ang) * rad;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawBallTrail(ctx) {
        if (!this.enabled || !this.trail.length) return;
        try {
            const b = this.game.ball;
            const r = b ? b.radius : 9;
            ctx.save();
            for (const q of this.trail) {
                ctx.globalAlpha = clamp(q.a * 0.28, 0, 1);
                ctx.fillStyle = q.hot ? '#ffe9a0' : '#ffffff';
                ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, r * 0.75 * q.a), 0, TAU); ctx.fill();
            }
            ctx.restore();
        } catch (e) { this._fail(e); }
    }

    // Pelota rápida = se estira en el sentido del movimiento (solo dibujo)
    ballStretch() {
        if (!this.enabled) return null;
        const b = this.game.ball;
        if (!b || b.owner) return null;
        const sp = b.vel.length();
        if (sp < 7.5) return null;
        const k = Math.min(0.32, (sp - 7.5) * 0.032) * this.calma;
        return { angle: Math.atan2(b.vel.y, b.vel.x), sx: 1 + k, sy: 1 - k * 0.58 };
    }

    beginShake(ctx) {
        if (!this.enabled || this.shakeAmp < 0.08) return false;
        const a = this.shakeAmp * this.G.sacudida * this.calma;
        if (a < 0.05) return false;
        ctx.save();
        ctx.translate((this.rng() - 0.5) * 2 * a, (this.rng() - 0.5) * 2 * a);
        return true;
    }
    endShake(ctx) { ctx.restore(); }

    // ---------- consultas desde game.js ----------
    playerPose(p) {
        if (!this.enabled) return null;
        const st = this.states.get(p);
        return st ? st.pose : null;
    }
    indicatorBounce(p) {
        if (!this.enabled) return 0;
        const st = this.states.get(p);
        return st ? Math.sin(st.t * 6) * 1.2 * this.calma : 0;
    }
    drawIndicatorExtras(ctx, p) {
        if (!this.enabled) return;
        const st = this.states.get(p);
        if (!st || st.tm.pop <= 0) return;
        try {
            const k = 1 - st.tm.pop / st.du.pop;
            ctx.save();
            ctx.globalAlpha = clamp(0.85 * (1 - k), 0, 1);
            ctx.strokeStyle = '#ffe36b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(p.pos.x, p.pos.y + 12, 10 + 26 * easeOut(k), 4 + 10 * easeOut(k), 0, 0, TAU);
            ctx.stroke();
            ctx.restore();
        } catch (e) { this._fail(e); }
    }
}

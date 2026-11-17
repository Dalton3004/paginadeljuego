import { CONFIG, EstadoPartido } from './config.js';
import { Vector2D } from './vector.js';
import { Jugador } from './jugador.js';
import './jugador_ia.js'; // mezcla IA en Jugador.prototype

// ============================================================
// GESTOR DE PARTIDO
// ============================================================
export class GestorPartido {
    constructor(ball, players) {
        this.ball = ball;
        this.players = players;

        this.estado = EstadoPartido.PREPARANDO;
        this.pausado = false;
        this.pauseMenuSelection = 0; // índice en _pauseOptions()
        this.framesRestantes = CONFIG.MATCH_SECONDS * CONFIG.TARGET_FPS;
        this.timerFestejo = 0;
        this.prematchTimer = CONFIG.PREMATCH_LOAD_SEC;
        this.countdownTimer = CONFIG.KICKOFF_COUNTDOWN_SEC;
        this.countdownNumber = 3;

        this.golesLocal = 0;
        this.golesRival = 0;

        this.cartel = null;
        this.cartelAlpha = 0;
        this.cartelScale = 1;
        this.goalScoredThisFrame = false;

        // Menú de fin de partido
        this.endMenuSelection = 0; // 0 = REVANCHA, 1 = MENÚ PRINCIPAL

        // Congelar jugadores durante la preparación
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
    }

    update(dt) {
        if (this.pausado) return;
        switch (this.estado) {
            case EstadoPartido.PREPARANDO:
                this._updatePrematch(dt);
                break;
            case EstadoPartido.CUENTA_REGRESIVA:
                this._updateCountdown(dt);
                break;
            case EstadoPartido.EN_JUEGO:
                this._updatePlaying(dt);
                break;
            case EstadoPartido.CELEBRANDO_GOL:
                this._updateCelebration(dt);
                break;
            case EstadoPartido.FINALIZADO:
                // animación suave del cartel
                if (this.cartelAlpha < 1) this.cartelAlpha = Math.min(1, this.cartelAlpha + dt * 1.8);
                if (this.cartelScale < 1.05) this.cartelScale = Math.min(1.05, this.cartelScale + dt * 1.2);
                break;
        }
    }

    _updatePrematch(dt) {
        this.prematchTimer -= dt;
        // Jugadores quietos en sus posiciones
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
        if (this.ball) this.ball.vel.set(0, 0);
        if (this.prematchTimer <= 0) {
            this.estado = EstadoPartido.CUENTA_REGRESIVA;
            this.countdownTimer = CONFIG.KICKOFF_COUNTDOWN_SEC;
            this.countdownNumber = 3;
        }
    }

    _updateCountdown(dt) {
        this.countdownTimer -= dt;
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
        }
        if (this.ball) this.ball.vel.set(0, 0);
        // Número visible: 3, 2, 1
        const left = Math.max(0, this.countdownTimer);
        this.countdownNumber = left > 2 ? 3 : (left > 1 ? 2 : (left > 0 ? 1 : 0));
        if (this.countdownTimer <= 0) {
            this.estado = EstadoPartido.EN_JUEGO;
            for (const p of this.players) p.frozen = false;
            if (typeof this.onAudio === 'function') this.onAudio('whistle');
        }
    }

    _updatePlaying(dt) {
        this.framesRestantes--;
        if (this.framesRestantes <= 0) {
            this.framesRestantes = 0;
            this._finalizarPartido();
            return;
        }

        for (const p of this.players) p.update(dt, this.ball, this.players);
        this._resolvePlayerCollisions();
        // Las colisiones pueden empujar fuera de la cancha; reaplicar límites.
        for (const p of this.players) p._clampToField();
        this.ball.update(dt);
        this._verificarGoles();
    }

    _resolvePlayerCollisions() {
        const list = this.players;
        const n = list.length;
        const iterations = CONFIG.COLLISION_SOLVER_ITERATIONS;

        // Resolver varias veces una penetración pequeña es más estable que
        // aplicar un empujón grande y dejar que el siguiente frame lo revierta.
        for (let iteration = 0; iteration < iterations; iteration++) {
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    const a = list[i], b = list[j];

                    // Solo colisionan rivales; compañeros del mismo equipo se atraviesan.
                    if (a.team === b.team) continue;
                    if (a.isSliding && b.isSliding) continue;

                    const dx = b.pos.x - a.pos.x;
                    const dy = b.pos.y - a.pos.y;
                    const distSq = dx * dx + dy * dy;
                    const minDist = a.radius + b.radius;

                    // Tolerancia: evita que una diferencia microscópica de posición
                    // active el solver continuamente.
                    if (distSq >= (minDist - CONFIG.COLLISION_SLOP) ** 2) continue;

                    let dist = Math.sqrt(distSq);
                    let nx, ny;

                    if (dist > 0.0001) {
                        nx = dx / dist;
                        ny = dy / dist;
                    } else {
                        // Posiciones idénticas: dirección determinista, sin dividir
                        // por cero ni introducir ruido aleatorio.
                        const parity = (i + j) & 1;
                        nx = parity ? 1 : 0;
                        ny = parity ? 0 : 1;
                        dist = 0;
                    }

                    const overlap = minDist - dist;
                    if (overlap <= CONFIG.COLLISION_SLOP) continue;

                    // Corrección proporcional y limitada. El reparto 50/50 evita que
                    // un jugador quede "pegado" mientras el otro recibe todo el ajuste.
                    const correction = Math.min(
                        CONFIG.COLLISION_MAX_CORRECTION,
                        overlap * CONFIG.COLLISION_CORRECTION_PERCENT
                    );
                    const halfCorrection = correction * 0.5;

                    a.pos.x -= nx * halfCorrection;
                    a.pos.y -= ny * halfCorrection;
                    b.pos.x += nx * halfCorrection;
                    b.pos.y += ny * halfCorrection;

                    // No aplicar un knockback constante: era la principal fuente de
                    // oscilación cuando dos jugadores volvían a entrar en contacto.
                    // Solo modificamos la componente normal si realmente se acercan.
                    const relativeNormalSpeed =
                        (b.vel.x - a.vel.x) * nx +
                        (b.vel.y - a.vel.y) * ny;

                    if (relativeNormalSpeed < -CONFIG.COLLISION_MIN_APPROACH_SPEED) {
                        // Determinamos primero quién recibe el impacto. Esto permite
                        // aplicar un cooldown SOLO al receptor, en lugar de bloquear
                        // a ambos jugadores.
                        const av = Math.hypot(a.vel.x, a.vel.y);
                        const bv = Math.hypot(b.vel.x, b.vel.y);
                        const victim = av < bv ? a : b;
                        const hitter = av < bv ? b : a;

                        // Si la víctima acaba de recibir un impacto, NO se vuelve a
                        // impulsar ni a aturdir durante este pequeño período. La
                        // separación de posiciones de arriba sí continúa, evitando
                        // que quede atrapada contra una pared u otro jugador.
                        if (victim.collisionCooldown > 0) continue;

                        const impulse = Math.min(
                            CONFIG.COLLISION_MAX_IMPULSE,
                            -relativeNormalSpeed * (1 + CONFIG.COLLISION_RESTITUTION) * 0.5
                        );

                        a.vel.x -= nx * impulse;
                        a.vel.y -= ny * impulse;
                        b.vel.x += nx * impulse;
                        b.vel.y += ny * impulse;

                        // El feedback de choque solo se dispara ante un impacto real,
                        // no mientras permanecen en contacto.
                        const impact = Math.min(
                            1.2,
                            (av + bv) * 0.22 + overlap * 0.08
                        );

                        if (impact >= 0.12) {
                            // Bloqueamos nuevas colisiones sobre ESTA víctima hasta
                            // que expire el cooldown. Esto corta el spam de impactos
                            // que hacía vibrar a los jugadores en esquinas.
                            victim.collisionCooldown = Math.max(
                                victim.collisionCooldown,
                                CONFIG.COLLISION_RECEIVER_COOLDOWN
                            );

                            if (!victim.isSliding) {
                                victim.hitStun = Math.max(
                                    victim.hitStun,
                                    CONFIG.HIT_STUN * (0.55 + impact * 0.5)
                                );
                                victim.hitSlow = Math.max(
                                    victim.hitSlow,
                                    CONFIG.HIT_SLOW * (0.7 + impact * 0.4)
                                );
                                victim.hitFlash = Math.max(victim.hitFlash, 0.10);
                                victim.hitSquash = Math.max(victim.hitSquash, 0.14);
                            }

                            if (!hitter.isSliding) {
                                hitter.hitSlow = Math.max(
                                    hitter.hitSlow,
                                    CONFIG.HIT_SLOW * 0.35
                                );
                                hitter.hitFlash = Math.max(hitter.hitFlash, 0.05);
                            }

                            // Si la víctima tenía la pelota y el impacto fue fuerte,
                            // conserva la lógica original de pérdida de posesión.
                            if (
                                victim.hasBall &&
                                this.ball &&
                                this.ball.owner === victim &&
                                impact > 0.55
                            ) {
                                victim.hasBall = false;
                                this.ball.owner = null;
                                const direction = victim === a ? -1 : 1;
                                this.ball.vel.x += nx * direction * 2.2;
                                this.ball.vel.y += ny * direction * 2.2;
                            }
                        }
                    }
                }
            }
        }
    }

    _verificarGoles() {
        if (this.goalScoredThisFrame) return;
        const b = this.ball;
        const gn = CONFIG.GOAL_NORTH;
        const gs = CONFIG.GOAL_SOUTH;

        if ((b.z || 0) <= CONFIG.BAR_HEIGHT && b.pos.y < gn.lineY &&
            b.pos.x > gn.x + b.radius * 0.85 && b.pos.x < gn.x + gn.w - b.radius * 0.85 &&
            b.pos.y > gn.backY - b.radius) {
            this.golesLocal++;
            this._registrarGol();
            return;
        }

        if ((b.z || 0) <= CONFIG.BAR_HEIGHT && b.pos.y > gs.lineY &&
            b.pos.x > gs.x + b.radius * 0.85 && b.pos.x < gs.x + gs.w - b.radius * 0.85 &&
            b.pos.y < gs.backY + b.radius) {
            this.golesRival++;
            this._registrarGol();
        }
    }

    _registrarGol() {
        this.goalScoredThisFrame = true;
        this.estado = EstadoPartido.CELEBRANDO_GOL;
        if (typeof this.onAudio === 'function') this.onAudio('goal');
        this.cartel = 'GOL';
        this.cartelAlpha = 0;
        this.cartelScale = 0.4;
        this.timerFestejo = CONFIG.GOAL_CELEBRATION_SEC;

        this.ball.owner = null;
        for (const p of this.players) {
            p.frozen = true;
            p.hasBall = false;
            p.isSliding = false;
            p.vel.set(0, 0);
        }
    }

    _updateCelebration(dt) {
        this.timerFestejo -= dt;
        if (this.cartelAlpha < 1) this.cartelAlpha = Math.min(1, this.cartelAlpha + dt * 3);
        if (this.cartelScale < 1) this.cartelScale = Math.min(1, this.cartelScale + dt * 2.2);

        if (this.timerFestejo <= 0) {
            this._resetearCancha();
            this.cartel = null;
            this.estado = EstadoPartido.EN_JUEGO;
            this.goalScoredThisFrame = false;
            for (const p of this.players) p.frozen = false;
            if (typeof this.onAudio === 'function') this.onAudio('whistle');
        }
    }

    _resetearCancha() {
        const cx = CONFIG.WIDTH / 2;
        const cy = CONFIG.HEIGHT / 2;
        this.ball.reset(cx, cy);
        for (const p of this.players) p.resetToHome();
    }

    _finalizarPartido() {
        this.estado = EstadoPartido.FINALIZADO;
        if (typeof this.onAudio === 'function') this.onAudio('whistle');
        this.ball.owner = null;
        this.ball.vel.set(0, 0);
        for (const p of this.players) {
            p.frozen = true;
            p.vel.set(0, 0);
            p.isSliding = false;
        }

        if (this.golesLocal > this.golesRival) this.cartel = 'VICTORIA';
        else if (this.golesRival > this.golesLocal) this.cartel = 'DERROTA';
        else this.cartel = 'EMPATE';

        this.cartelAlpha = 0;
        this.cartelScale = 0.5;
        this.endMenuSelection = 0;
    }

    getTiempoFormateado() {
        const totalSec = Math.ceil(this.framesRestantes / CONFIG.TARGET_FPS);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    isPlaying() {
        return this.estado === EstadoPartido.EN_JUEGO;
    }

    getLocalTeammates(human) {
        return this.players.filter(p => p.team === 'local' && p !== human);
    }
}

if (typeof globalThis !== 'undefined') globalThis.GestorPartido = GestorPartido;

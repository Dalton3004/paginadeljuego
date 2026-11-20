import { CONFIG } from './config.js';
import { Vector2D } from './vector.js';
import { MOVILIDAD_JUGADORES } from './movilidad.js';

// ============================================================
// JUGADOR
// ============================================================
export class Jugador {
    constructor(x, y, opts = {}) {
        this.pos = new Vector2D(x, y);
        this.homePos = new Vector2D(x, y);
        this.aiTarget = new Vector2D(x, y);
        this.tacticalState = 'balanced';
        this.tacticalBlend = 0;
        // Impulso táctico: sprint coordinado al cambiar entre ataque y defensa.
        this.tacticalBurstTimer = 0;
        this.tacticalBurstDuration = 1.45;
        this.vel = new Vector2D(0, 0);
        this.facing = new Vector2D(0, opts.team === 'rival' ? 1 : -1);
        this.radius = CONFIG.PLAYER_RADIUS;
        this.isHuman = !!opts.isHuman;
        this.team = opts.team || 'local'; // 'local' | 'rival'
        this.hasBall = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.hitStun = 0;       // no puede moverse
        this.hitSlow = 0;
        this.collisionCooldown = 0; // inmunidad breve tras recibir una colisión       // movimiento reducido
        this.hitFlash = 0;      // feedback visual del choque
        this.hitSquash = 0;     // animación de aplastamiento
        this.animFrame = 0;
        this.animTimer = 0;
        this.keys = { up: false, down: false, left: false, right: false, shift: false };
        this.frozen = false;
        this.tint = opts.tint || null;
        this.isGK = !!opts.isGK;
        // Estado propio del arquero: lectura del tiro, estirada y recuperación.
        this.gkAction = 'stand';
        this.gkActionTimer = 0;
        this.gkDiveCooldown = 0;
        this.gkDiveDir = 0;
        this.gkTargetX = x;
        this.gkSalida = false;   // true mientras el arquero sale del arco a buscar la pelota (y vuelve): ensancha su límite en X
        this.aiSafeDepth = CONFIG.DEFENSOR_PROF_NORMAL;   // hasta dónde puede bajar la IA de campo (ver _actualizarProfundidadDefensiva)
        this.gkReaction = 0.12 + ((this.aiSeed || 0) % 9) * 0.012;
        // Perfil individual ajustable desde tools/configurar_movilidad.py
        // Perfil de dificultad (solo el equipo rival lo recibe desde Game._initMatch).
        this.diff = null;
        this.aiActTimer = 0;
        this.aiTackleTimer = 0;
        this.aiBarridaEspera = 0;   // pausa entre barridas automáticas de compañeros de IA
        this.mobilityId = opts.mobilityId || (this.isGK ? (this.team + '_gk') : this.team);
        const mobility = MOVILIDAD_JUGADORES[this.mobilityId] || {};
        this.mobilityMultiplier = Number(mobility.velocidad) || (this.isGK ? 0.78 : (this.team === 'rival' ? 1.0 : 1.08));
        this.sprintMultiplier = Number(mobility.sprint) || 1.0;

        // Animación
        this.moving = false;
        this.sprinting = false;
        this.stamina = CONFIG.STAMINA_MAX;
        // IA: alterna sprint y recuperación con histéresis para evitar spam.
        this.aiSprintResting = false;
        this.animClock = Math.random() * 10;   // desfasa el "respirar" entre jugadores
        this.animDir = this.team === 'rival' ? 'down' : 'up';  // 'up' | 'down' | 'side'
        this.flipX = false;                    // mirar a la izquierda en vista lateral
        this.kickTimer = 0;
        this.tacticaAvance = 1;   // >1 sube más al atacar, <1 se replega más (ver TACTICAS)
        this.headTimer = 0;       // > 0 mientras salta a cabecear (animación)
        this.headCooldown = 0;    // evita cabecear dos veces seguidas
        // Carga del disparo: se acumula mientras se mantiene ESPACIO.
        this.shotCharging = false;
        this.shotCharge = 0;
        this.shotChargeMax = 1.25;

        // Ritmo, fase y deriva propios para evitar movimientos sincronizados.
        const seedText = String(this.mobilityId);
        let seed = 0;
        for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
        this.aiSeed = seed;
        this.aiPhase = (seed % 997) / 997 * Math.PI * 2;
        this.aiThinkTimer = (seed % 7) * 0.075;
        this.aiDriftX = Math.sin(this.aiPhase) * 5;
        this.aiDriftY = Math.cos(this.aiPhase * 1.37) * 4;
        this.aiSpeedFactor = 0.72 + ((seed >>> 4) % 29) / 100;
    }

    update(dt, ball, allPlayers) {
        if (this.frozen) { this.moving = false; this.sprinting = false; this.animFrame = 0; return; }

        if (this.slideCooldown > 0) this.slideCooldown -= dt;
        if (this.aiBarridaEspera > 0) this.aiBarridaEspera -= dt;
        if (this.headTimer > 0) this.headTimer = Math.max(0, this.headTimer - dt);
        if (this.headCooldown > 0) this.headCooldown = Math.max(0, this.headCooldown - dt);
        if (this.hitStun > 0) this.hitStun = Math.max(0, this.hitStun - dt);
        if (this.hitSlow > 0) this.hitSlow = Math.max(0, this.hitSlow - dt);
        if (this.collisionCooldown > 0) {
            this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
        }
        if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
        if (this.hitSquash > 0) this.hitSquash = Math.max(0, this.hitSquash - dt);
        if (this.shotCharging && this.hasBall) {
            this.shotCharge = Math.min(this.shotChargeMax, this.shotCharge + dt);
        } else if (this.shotCharging && !this.hasBall) {
            this.shotCharging = false;
            this.shotCharge = 0;
        }
        if (this.gkDiveCooldown > 0) this.gkDiveCooldown = Math.max(0, this.gkDiveCooldown - dt);
        if (this.gkActionTimer > 0) {
            this.gkActionTimer = Math.max(0, this.gkActionTimer - dt);
            if (this.gkActionTimer === 0 && this.isGK) this.gkAction = 'ready';
        }

        // Aturdido por choque o recuperación de barrida: no controla
        if (this.hitStun > 0) {
            this.vel.x *= 0.82;
            this.vel.y *= 0.82;
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
            this.moving = false;
            this.sprinting = false;
        } else if (this.isHuman) {
            if (this.isSliding) this._updateSlide(dt, ball);
            else this._updateMovement(dt);
        } else {
            if (this.isSliding) this._updateSlide(dt, ball);
            else this._updateSimpleAI(dt, ball, allPlayers);
        }

        this._updateStamina(dt);
        this._clampToField();

        this._updateAnimation(dt);

        this._handlePossession(ball);
    }

    // Decide qué animación mostrar: dirección visual (con histéresis para que no
    // parpadee en diagonales), si corre y a qué ritmo mueve las piernas.
    _updateAnimation(dt) {
        const speed = this.vel.length();
        // Histeresis para evitar que la animación de caminar entre/salga de
        // "moving" cuando la velocidad oscila alrededor del umbral (algo muy
        // frecuente al frenar, colisionar o quedar contra una pared).
        // Sin esto el frame se reinicia continuamente y visualmente parece
        // que el jugador vibra aunque su posición sea estable.
        const wasMoving = !!this.moving;
        const startMoveSpeed = 0.30;
        const keepMoveSpeed = 0.12;
        this.moving = !this.isSliding && (wasMoving ? speed > keepMoveSpeed : speed > startMoveSpeed);
        this.animClock += dt;
        if (this.kickTimer > 0) this.kickTimer = Math.max(0, this.kickTimer - dt);

        const ax = Math.abs(this.facing.x), ay = Math.abs(this.facing.y);
        if (this.animDir === 'side') {
            if (ay > ax * 1.35) this.animDir = this.facing.y < 0 ? 'up' : 'down';
        } else if (ax > ay * 1.35) {
            this.animDir = 'side';
        } else if (ay > 0.01) {
            this.animDir = this.facing.y < 0 ? 'up' : 'down';
        }
        if (this.animDir === 'side' && ax > 0.05) this.flipX = this.facing.x < 0;

        if (this.moving) {
            // más rápido el paso cuanto más rápido corre
            const period = 0.30 / Math.max(speed, 0.8);
            this.animTimer += dt;
            while (this.animTimer >= period) {
                this.animTimer -= period;
                this.animFrame = (this.animFrame + 1) % 4;
            }
        } else {
            this.animFrame = 0;
            this.animTimer = 0;
        }
    }

    _updateStamina(dt) {
        if (this.isGK) return; // el arquero no participa del sprint de campo
        if (this.sprinting) {
            this.stamina = Math.max(0, this.stamina - CONFIG.STAMINA_SPRINT_DRAIN * dt * (this.diff ? this.diff.staminaDrain : 1));
        } else if (!this.isHuman) {
            // Los compañeros de IA trotan sin gastar sprint y recuperan energía
            // hasta el 75%; el sprint vuelve a habilitarse recién allí.
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * dt * (this.diff ? this.diff.staminaRecover : 1));
            if (this.stamina >= (this.diff ? Math.min(75, this.diff.restBelow + 25) : 75)) this.aiSprintResting = false;
        } else if (!this.moving || this.vel.length() < CONFIG.PLAYER_SPEED * 0.8) {
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * dt);
        } else {
            this.stamina = Math.min(CONFIG.STAMINA_MAX, this.stamina + CONFIG.STAMINA_RECOVERY * 0.12 * dt);
        }
    }

    _updateMovement(dt) {
        let dx = 0, dy = 0;
        if (this.keys.up)    dy -= 1;
        if (this.keys.down)  dy += 1;
        if (this.keys.left)  dx -= 1;
        if (this.keys.right) dx += 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            dx /= len; dy /= len;
            const canSprint = this.keys.shift && this.stamina > 1;
            const fatigue = 0.70 + 0.30 * (this.stamina / CONFIG.STAMINA_MAX);
            const possessionSlowdown = this.hasBall ? 0.78 : 1.0;
            const sprintScale = Math.min(1.0, this.sprintMultiplier) * 0.96;
            let speed = (canSprint ? CONFIG.PLAYER_SPRINT * sprintScale : CONFIG.PLAYER_SPEED) * this.mobilityMultiplier * fatigue * possessionSlowdown;
            if (this.hitSlow > 0) speed *= 0.48;
            this.sprinting = canSprint && this.hitSlow <= 0;
            const desiredX = dx * speed;
            const desiredY = dy * speed;
            // Si la orden va contra la inercia (frenar o girar), responder mucho más rápido.
            // Antes el lerp era tan lento que contra la línea de fondo parecía que no frenaba.
            const reversing = this.vel.x * desiredX + this.vel.y * desiredY < 0;
            const response = reversing ? 0.62 : (canSprint ? 0.34 : 0.28);
            this.vel.x += (desiredX - this.vel.x) * response;
            this.vel.y += (desiredY - this.vel.y) * response;
            this.facing.set(dx, dy);
        } else {
            this.vel.x *= 0.55;
            this.vel.y *= 0.55;
            if (Math.abs(this.vel.x) < 0.12) this.vel.x = 0;
            if (Math.abs(this.vel.y) < 0.12) this.vel.y = 0;
            this.sprinting = false;
        }
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
    }

    _updateSlide(dt, ball) {
        this.slideTimer -= dt;
        this.pos.x += this.facing.x * CONFIG.SLIDE_SPEED;
        this.pos.y += this.facing.y * CONFIG.SLIDE_SPEED;
        // Evita que la barrida termine en la tribuna (fuera de la cancha).
        this._clampToField();

        // Si la barrida toca la pelota en cualquier momento del recorrido, se la sacás al rival
        // (o la recuperás si estaba suelta). Ya no hay azar ni hay que esperar al final.
        if (ball && !this.hasBall && ball.kickCooldown <= 0 && (ball.z || 0) <= CONFIG.CONTROL_Z &&
            this.pos.distanceTo(ball.pos) <= CONFIG.SLIDE_HIT_RANGE) {
            const dueno = ball.owner;
            // Al arquero con la pelota en las manos no se le quita.
            if (!dueno || (dueno !== this && dueno.team !== this.team && !dueno.isGK)) {
                if (dueno) {
                    dueno.hasBall = false;
                    // El dueño anterior recibe un pequeño empujón
                    const away = dueno.pos.directionTo(this.pos).normalize();
                    dueno.vel.x -= away.x * 1.8;
                    dueno.vel.y -= away.y * 1.8;
                    dueno.hitSlow = Math.max(dueno.hitSlow, 0.28);
                }
                ball.owner = this;
                this.hasBall = true;
                ball.vel.set(0, 0);
                ball.passDrag = null;
                ball.passTeam = null;
            }
        }

        if (this.slideTimer <= 0) {
            this.isSliding = false;
            this.slideCooldown = CONFIG.SLIDE_COOLDOWN;
            this.vel.set(0, 0);
            this.hitStun = Math.max(this.hitStun, CONFIG.SLIDE_RECOVERY);
        }
    }

    _clampToField() {
        const f = CONFIG.FIELD;
        const r = this.radius;
        const gn = CONFIG.GOAL_NORTH;
        const gs = CONFIG.GOAL_SOUTH;
        const ox = this.pos.x, oy = this.pos.y;

        // Bandas laterales: nunca salir a la tribuna por los costados.
        this.pos.x = Math.max(f.LEFT + r, Math.min(f.RIGHT - r, this.pos.x));

        if (this.isGK) {
            // El arquero puede moverse en su área / boca, sin cruzar a la tribuna.
            const northLimit = gn.lineY - 36;
            const southLimit = gs.lineY + 36;
            this.pos.y = Math.max(northLimit, Math.min(southLimit, this.pos.y));
            // No atraviesa los postes hacia afuera de la boca.
            const goal = this.team === 'local' ? gs : gn;
            const margin = 10;
            let minX = goal.x - margin, maxX = goal.x + goal.w + margin;
            if (this.gkSalida) {   // saliendo a buscar la pelota (o volviendo): puede cubrir todo el ancho del área
                const cx = goal.x + goal.w / 2;
                minX = Math.min(minX, cx - CONFIG.AREA_MITAD_ANCHO);
                maxX = Math.max(maxX, cx + CONFIG.AREA_MITAD_ANCHO);
            }
            this.pos.x = Math.max(minX, Math.min(maxX, this.pos.x));
            this._frenarSiChocoBorde(ox, oy);
            return;
        }

        // Jugadores de campo: se quedan dentro de las líneas blancas.
        // Solo en la boca del arco se permite un poco más allá de la línea de gol
        // (para disputar la pelota), pero NUNCA hasta la tribuna / fondo de red.
        const mouthPad = 10;
        const inNorthMouth = this.pos.x > gn.x + mouthPad && this.pos.x < gn.x + gn.w - mouthPad;
        const inSouthMouth = this.pos.x > gs.x + mouthPad && this.pos.x < gs.x + gs.w - mouthPad;

        // Máximo ~18 px pasado de la línea de gol, lejos de backY (tribuna).
        const overshoot = 18;
        let minY = f.TOP + r;
        let maxY = f.BOTTOM - r;
        if (inNorthMouth) minY = f.TOP - overshoot;
        if (inSouthMouth) maxY = f.BOTTOM + overshoot;

        this.pos.y = Math.max(minY, Math.min(maxY, this.pos.y));

        // La IA de campo no se mete en su propia red, tampoco en barrida.
        if (!this.isHuman) {
            const prof = this.aiSafeDepth;
            const safeY = this.team === 'local' ? f.BOTTOM - prof : f.TOP + prof;
            this.pos.y = this.team === 'local' ? Math.min(this.pos.y, safeY) : Math.max(this.pos.y, safeY);
        }
        this._frenarSiChocoBorde(ox, oy);
    }

    // Si el límite de la cancha nos devolvió adentro, la velocidad que empujaba
    // hacia afuera se anula. Si no, el jugador queda "corriendo" contra la línea
    // y parece que el control no frena.
    _frenarSiChocoBorde(ox, oy) {
        if (this.pos.x < ox - 0.01 && this.vel.x > 0) this.vel.x = 0;
        else if (this.pos.x > ox + 0.01 && this.vel.x < 0) this.vel.x = 0;
        if (this.pos.y < oy - 0.01 && this.vel.y > 0) this.vel.y = 0;
        else if (this.pos.y > oy + 0.01 && this.vel.y < 0) this.vel.y = 0;
    }

    _handlePossession(ball) {
        if (ball.owner === this) {
            this.hasBall = true;
            return;
        }
        this.hasBall = false;

        // El área de contacto del arquero cubre el cuerpo completo del sprite,
        // también durante las estiradas. Los tiros rápidos se desvían o se atrapan.
        if (this.isGK) {
            const diving = this.gkAction.startsWith('dive');
            const reach = this.diff ? this.diff.gk.reach : 1;
            const rx = (diving ? 21 : 16) * reach;
            const ry = (diving ? 16 : 13) * reach;
            // El centro de contacto se alinea con el torso del sprite (anclado en los pies).
            const nx = (ball.pos.x - this.pos.x) / rx;
            const ny = ((ball.pos.y - (ball.z || 0)) - (this.pos.y - 27)) / ry;   // altura incluida: un globito pasa por encima
            if (nx * nx + ny * ny <= 1.0) {
                const speed = ball.vel.length();
                // Tiro lento (≤ GK_ATAJA_VEL) con la pelota ya "libre": se ataja más abajo, no se rebota.
                if (speed > 0.8 && (speed > CONFIG.GK_ATAJA_VEL || ball.kickCooldown > 0)) {
                    const toward = this.team === 'local' ? ball.vel.y > 0 : ball.vel.y < 0;
                    if (toward || diving) {
                        const saveDir = new Vector2D(
                            Math.sign(ball.pos.x - this.pos.x) * 0.34 + (this.gkDiveDir || 0) * 0.22,
                            this.team === 'local' ? -1 : 1
                        ).normalize();
                        ball.owner = null;
                        // Rebote proporcional a la potencia del tiro que está atacando (velocidad al momento del contacto).
                        const rebote = speed * CONFIG.GK_REBOTE_FACTOR;
                        ball.vel.set(saveDir.x * rebote, saveDir.y * rebote);
                        ball.kickCooldown = 10;
                        this.gkAction = 'catch';
                        this.gkActionTimer = 0.34;
                        this.gkDiveCooldown = Math.max(this.gkDiveCooldown, 0.38);
                        return;
                    }
                }
                if (ball.kickCooldown <= 0 && ball.vel.length() <= CONFIG.GK_ATAJA_VEL && (ball.z || 0) <= CONFIG.CONTROL_Z + 6) {
                    ball.owner = this;
                    this.hasBall = true;
                    this.gkAction = 'catch';
                    this.gkActionTimer = 0.34;
                    return;
                }
            }
        }

        // Intercepción: un pase rival en vuelo que pasa por donde estoy parado (o por donde
        // barro) me lo quedo. Se mira el tramo recorrido en el cuadro para que un pase
        // rápido no "atraviese" al jugador. Los primeros cuadros después del pase no cuentan.
        if (!this.isGK && this.hitStun <= 0 && ball.kickCooldown <= 14 && (ball.z || 0) <= CONFIG.CONTROL_Z && ball.esPaseRival(this.team)) {
            const alcance = this.isSliding ? Math.max(CONFIG.INTERCEPT_RANGE, CONFIG.SLIDE_HIT_RANGE) : CONFIG.INTERCEPT_RANGE;
            if (ball.distanciaATramo(this.pos) <= alcance) {
                ball.owner = this;
                this.hasBall = true;
                ball.vel.set(0, 0);
                ball.passDrag = null;
                ball.passTeam = null;
                return;
            }
        }

        if (ball.kickCooldown > 0) return;
        if (this.isSliding) return;

        // Pelota por el aire: a la altura de la cabeza se cabecea; recién baja (CONTROL_Z) se controla.
        if (!this.isGK && this._cabecear(ball)) return;

        const dist = this.pos.distanceTo(ball.pos);
        const ballSpeed = ball.vel.length();
        const z = ball.z || 0;
        // Un pase elevado que baja llega con más velocidad que una pelota rodando: se amortigua con el pecho.
        const bajando = z > 0 && ball.vz <= 0 && ballSpeed < 7.5;
        if (z <= CONFIG.CONTROL_Z && dist < CONFIG.POSSESSION_RANGE && (ballSpeed < 4.0 || bajando)) {
            if (ball.owner) {
                const ownerDist = ball.owner.pos.distanceTo(ball.pos);
                if (dist >= ownerDist - 2) return;
                ball.owner.hasBall = false;
            }
            ball.owner = this;
            this.hasBall = true;
        }
    }

    // Cabezazo: la pelota pasa a la altura de la cabeza (HEAD_Z_MIN..HEAD_Z_MAX) y el jugador está debajo.
    // El pase elevado de un compañero NO se cabecea: se deja bajar para controlarlo. Devuelve true si cabeceó.
    _cabecear(ball) {
        const z = ball.z || 0;
        if (z < CONFIG.HEAD_Z_MIN || z > CONFIG.HEAD_Z_MAX) return false;
        if (this.headCooldown > 0 || this.hitStun > 0 || this.frozen) return false;
        if (ball.owner) return false;
        if (ball.lastTeam === this.team) return false;          // pelota propia en el aire: se controla, no se cabecea
        if (this.pos.distanceTo(ball.pos) > CONFIG.HEAD_RANGE) return false;
        const attackDir = this.team === 'local' ? -1 : 1;
        // Siempre hacia adelante (nadie se la mete en contra cabeceando): el humano elige el costado con su mirada.
        let dx = this.isHuman ? this.facing.x * 0.55 : (Math.random() - 0.5) * 0.9;
        const dir = new Vector2D(dx, attackDir).normalize();
        ball.kick(dir, CONFIG.HEAD_POWER * (0.9 + Math.random() * 0.2), CONFIG.HEAD_VZ, this.team);
        ball.kickCooldown = 8;
        this.facing.copy(dir);
        this.headTimer = 0.30;
        this.headCooldown = CONFIG.HEAD_COOLDOWN;
        return true;
    }

    // ESPACIO: mantener para cargar el tiro; sin pelota, barrer.
    actionSpace(ball) {
        if (this.frozen || !this.isHuman) return;
        if (this.hasBall && ball.owner === this) {
            if (!this.shotCharging) { this.shotCharging = true; this.shotCharge = 0; }
        } else if (this.puedeBarrer()) {
            this.barrida();
        }
    }

    // Botón TIRO (táctil): solo carga/dispara. Sin pelota no hace nada (no barre).
    actionShoot(ball) {
        if (this.frozen || !this.isHuman) return;
        if (this.hasBall && ball.owner === this && !this.shotCharging) {
            this.shotCharging = true;
            this.shotCharge = 0;
        }
    }

    // Botón BARRER (táctil): solo barre (gasta resistencia). Con pelota no hace nada (no tira).
    actionSlide(ball) {
        if (this.frozen || !this.isHuman) return;
        if (this.puedeBarrer()) this.barrida();
    }

    releaseShotCharge(ball) {
        if (!this.shotCharging) return;
        const charge = Math.max(0, Math.min(1, this.shotCharge / this.shotChargeMax));
        this.shotCharging = false;
        this.shotCharge = 0;
        if (!this.frozen && this.hasBall && ball.owner === this) {
            // Un toque rápido da un tiro controlado; mantener hasta el máximo
            // aumenta progresivamente la potencia hasta un 35%.
            this.patear(ball, 0.65 + charge * 0.70, charge);
        }
    }

    // E: pase automático al compañero más cercano, sin filtros de distancia
    // ni de orientación. La dirección apunta directamente a su posición actual.
    actionPass(ball, teammates) {
        if (this.frozen || !this.isHuman) return;
        if (!this.hasBall || ball.owner !== this) return;

        const target = this._findNearestPassTarget(teammates);
        if (!target) return;

        // Apuntar desde la posición real de la pelota (no desde el centro del jugador)
        // y anticipar ligeramente el movimiento del receptor.
        const predictedTarget = target.pos.clone().add(target.vel || new Vector2D(0, 0), 4);
        const dir = ball.pos.directionTo(predictedTarget).normalize();
        const distance = ball.pos.distanceTo(predictedTarget);
        // La fricción se aplica por frame: esta potencia aproxima el alcance
        // necesario para que el pase llegue al compañero sin salir disparado.
        const needed = Math.max(1.8, Math.min(10.0, distance * (1 - CONFIG.BALL_FRICTION) * 1.12));
        // Pase más fuerte (PASS_POWER_BOOST): sale más rápido y frena para llegar justo al compañero.
        const power = Math.min(CONFIG.PASS_POWER_MAX, needed * CONFIG.PASS_POWER_BOOST);
        ball.kick(dir, power, 0, this.team);
        ball.setPassDrag(power, distance * 1.12, this);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
        this.facing.copy(dir);
    }

    // R: pase elevado / centro. La pelota va POR EL AIRE (pasa por encima de los rivales) y pica en el
    // compañero que está en la línea de la mirada; si no hay ninguno, cae unos 260 px más adelante.
    actionLongPass(ball, teammates) {
        if (this.frozen || !this.isHuman) return;
        if (!this.hasBall || ball.owner !== this) return;

        const dir = this.facing.clone();
        if (dir.length() < 0.1) dir.set(0, this.team === 'local' ? -1 : 1);
        dir.normalize();
        let distancia = 260;
        let objetivo = null, mejorDot = 0.82;
        for (const m of (teammates || [])) {
            if (!m || m === this || m.isGK || m.team !== this.team) continue;
            const d = this.pos.distanceTo(m.pos);
            if (d < 80 || d > 430) continue;
            const to = this.pos.directionTo(m.pos);
            const dot = dir.x * to.x + dir.y * to.y;
            if (dot > mejorDot) { mejorDot = dot; objetivo = m; }
        }
        if (objetivo) {
            const lead = objetivo.pos.clone().add(objetivo.vel || new Vector2D(0, 0), 10);   // pica donde va a estar
            dir.copy(ball.pos.directionTo(lead).normalize());
            distancia = ball.pos.distanceTo(lead);
        }
        const vz = Math.min(6.2, CONFIG.LOB_VZ + distancia / 260);
        ball.lanzarElevado(dir, distancia, this.team, vz);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
        this.facing.copy(dir);
    }

    // Compañero más alineado con la mirada. La distancia solo desempata.
    _findNearestPassTarget(teammates) {
        if (!teammates || teammates.length === 0) return null;
        const face = this.facing ? this.facing.clone() : new Vector2D(0, 0);
        const mirando = face.length() >= 0.1;
        if (mirando) face.normalize();
        let best = null;
        let bestDot = -Infinity;
        let bestDist = Infinity;
        for (const teammate of teammates) {
            if (!teammate || teammate === this || teammate.isGK || teammate.team !== this.team) continue;
            const distance = this.pos.distanceTo(teammate.pos);
            if (distance < 1) continue;
            if (!mirando) {
                if (distance < bestDist) { bestDist = distance; best = teammate; }
                continue;
            }
            const to = this.pos.directionTo(teammate.pos);
            const dot = face.x * to.x + face.y * to.y;
            if (dot > bestDot + 0.02 || (Math.abs(dot - bestDot) <= 0.02 && distance < bestDist)) {
                bestDot = dot;
                bestDist = distance;
                best = teammate;
            }
        }
        return best;
    }

    patear(ball, powerMultiplier = 1, charge = 0) {
        if (!this.hasBall || ball.owner !== this) return;
        // Asistencia suave de puntería: corrige tiros muy desviados hacia el arco rival
        // sin quitarle al jugador el control de la dirección elegida.
        const goal = new Vector2D(CONFIG.WIDTH / 2,
            this.team === 'local' ? CONFIG.GOAL_NORTH.y + CONFIG.GOAL_NORTH.h / 2
                                  : CONFIG.GOAL_SOUTH.y + CONFIG.GOAL_SOUTH.h / 2);
        const goalDir = this.pos.directionTo(goal).normalize();
        const aimDir = this.facing.clone();
        if (aimDir.length() < 0.1) aimDir.copy(goalDir);
        aimDir.normalize();
        const assistedDir = aimDir.scale(0.32).add(goalDir, 0.68).normalize();
        // Cuanto más cargado el tiro, más se eleva: al máximo puede pasar por encima del travesaño.
        const vz = CONFIG.SHOT_VZ_MIN + (CONFIG.SHOT_VZ_MAX - CONFIG.SHOT_VZ_MIN) * charge;
        ball.kick(assistedDir, CONFIG.KICK_POWER * powerMultiplier, vz, this.team);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
    }

    // Gasto de resistencia de una barrida (la IA rival lo paga según su perfil de dificultad).
    costoBarrida() {
        return CONFIG.SLIDE_STAMINA_COST * (this.diff ? this.diff.staminaDrain : 1);
    }

    // ¿Una barrida lanzada ahora llega a la pelota del rival, y rápido? Simula el recorrido del barredor
    // (rumbo fijo) contra el de la pelota (va pegada al rival, que sigue con su velocidad actual). Solo
    // se acepta si el contacto ocurre en pocos cuadros (ALIADO_BARRIDA_MAX_FRAMES): cuanto más tarda,
    // más tiempo tiene el rival de pasar, tirar o cambiar de rumbo (medido: ≤8 cuadros ≈ 85 % de acierto,
    // 13+ cuadros ≈ 11 %). Devuelve el rumbo {x, y} o null si no hay una chance clara. Solo lo usan los
    // compañeros de IA.
    rumboBarridaSegura(owner, ball, dt) {
        const frames = Math.min(
            Math.max(1, Math.round(CONFIG.SLIDE_DURATION / Math.max(dt, 1e-3))),
            CONFIG.ALIADO_BARRIDA_MAX_FRAMES);
        const golpe = CONFIG.SLIDE_HIT_RANGE * CONFIG.ALIADO_BARRIDA_MARGEN;
        const ov = owner.vel || { x: 0, y: 0 };
        let mejor = null, mejorF = Infinity;
        // Prueba el rumbo directo a la pelota y apuntando adelante de ella (según hacia dónde corre el rival).
        for (const lead of [0, 6, 12]) {
            const ax = ball.pos.x + ov.x * lead - this.pos.x;
            const ay = ball.pos.y + ov.y * lead - this.pos.y;
            const m = Math.hypot(ax, ay) || 1;
            const dx = ax / m, dy = ay / m;
            let px = this.pos.x, py = this.pos.y;
            for (let f = 1; f <= frames && f < mejorF; f++) {
                px += dx * CONFIG.SLIDE_SPEED; py += dy * CONFIG.SLIDE_SPEED;
                const d = Math.hypot(px - (ball.pos.x + ov.x * f), py - (ball.pos.y + ov.y * f));
                if (d <= golpe) { mejorF = f; mejor = { x: dx, y: dy }; break; }
            }
        }
        return mejor;
    }

    puedeBarrer() {
        return !this.hasBall && !this.isSliding && this.slideCooldown <= 0 &&
            this.stamina >= this.costoBarrida();
    }

    barrida() {
        if (!this.puedeBarrer()) return;
        this.stamina = Math.max(0, this.stamina - this.costoBarrida());
        this.isSliding = true;
        this.slideTimer = CONFIG.SLIDE_DURATION;
        this.vel.set(0, 0);
    }

    resetToHome() {
        this.pos.copy(this.homePos);
        this.vel.set(0, 0);
        this.hasBall = false;
        this.isSliding = false;
        this.slideTimer = 0;
        this.gkAction = 'stand';
        this.gkActionTimer = 0;
        this.gkDiveCooldown = 0;
        this.gkDiveDir = 0;
        this.gkTargetX = this.homePos.x;
        this.facing.set(0, this.team === 'rival' ? 1 : -1);
        this.animDir = this.team === 'rival' ? 'down' : 'up';
        this.kickTimer = 0;
        this.moving = false;
    }
}

if (typeof globalThis !== 'undefined') globalThis.Jugador = Jugador;

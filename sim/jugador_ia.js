import { CONFIG } from './config.js';
import { Vector2D } from './vector.js';
import { Jugador } from './jugador.js';
import { esTiroAlArcoProyectado } from './estadisticas.js';

// Jugador — inteligencia artificial de compañeros, rivales y arqueros.
// Mixin de Jugador: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Jugador.prototype, {

    _updateSimpleAI(dt, ball, allPlayers) {
        const owner = ball ? ball.owner : null;
        const attackDir = this.team === 'local' ? -1 : 1;
        const goalY = this.team === 'local' ? CONFIG.FIELD.BOTTOM - 24 : CONFIG.FIELD.TOP + 24;

        if (this.isGK) {
            this._updateGoalkeeperAI(dt, ball, goalY, attackDir, allPlayers);
            return;
        }
        this._actualizarProfundidadDefensiva(ball, owner, allPlayers);

        let target = this.pos.clone();
        {
            const fieldPlayers = allPlayers.filter(p => p.team === this.team && !p.isGK);
            const nearest = fieldPlayers.reduce((best, p) =>
                !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
            if (!owner) {
                if (nearest === this) {
                    if (this.diff && this.diff.predict > 0) {
                        // Anticipa la trayectoria: va al punto donde la pelota va a estar, no a donde estaba.
                        const lead = Math.min(18, this.pos.distanceTo(ball.pos) / 3.0) * this.diff.predict;
                        target.set(ball.pos.x + ball.vel.x * lead, ball.pos.y + ball.vel.y * lead + attackDir * 6);
                    } else {
                        target.set(ball.pos.x + this.aiDriftX * 0.55, ball.pos.y + attackDir * 8 + this.aiDriftY * 0.45);
                    }
                } else {
                    target.set(this.homePos.x + this.aiDriftX + Math.sin(this.aiPhase + this.animClock * 0.55) * 2.5,
                               this.homePos.y + this.aiDriftY + Math.cos(this.aiPhase + this.animClock * 0.43) * 2);
                }
            } else if (owner.team === this.team) {
                if (owner === this) {
                    if (this.diff) {
                        const carry = this._aiCarry(dt, ball, allPlayers, attackDir);
                        if (carry === 'kicked') return;
                        target.copy(carry);
                    } else {
                        target.set(this.pos.x + this.aiDriftX * 0.18, this.pos.y + attackDir * 28);
                    }
                }
                else target.set(this.homePos.x + (owner.pos.x - this.homePos.x) * 0.12 + this.aiDriftX,
                                this.homePos.y + (owner.pos.y - this.homePos.y) * 0.10 + this.aiDriftY);
            } else if (this.diff && this.diff.doublePress && this._isSecondNearest(ball, allPlayers) &&
                       owner.pos.distanceTo(this.pos) < 150) {
                // Presión doble: el segundo defensor cierra por el costado del poseedor y le quita el pase.
                const side = owner.pos.x >= this.pos.x ? -1 : 1;
                target.set(owner.pos.x + side * 24, owner.pos.y - attackDir * 20);
            } else if (nearest === this) {
                // Solo el defensor más cercano presiona al poseedor. Se coloca
                // delante de su trayectoria para cerrar el avance, sin perseguirlo
                // hasta la boca del arco.
                target.set(owner.pos.x + this.aiDriftX * 0.18,
                           owner.pos.y - attackDir * 13 + this.aiDriftY * 0.12);
            } else {
                // Marcaje zonal: los otros defensores toman referencias sobre los
                // atacantes rivales cercanos a su carril y protegen el espacio
                // entre la pelota y el arco propio, en vez de amontonarse atrás.
                const opponents = allPlayers.filter(p => p.team !== this.team && !p.isGK);
                const marked = opponents.reduce((best, p) => {
                    const score = Math.abs(p.pos.x - this.homePos.x) + Math.abs(p.pos.y - owner.pos.y) * 0.22;
                    return !best || score < best.score ? { player: p, score } : best;
                }, null);
                const markX = marked ? marked.player.pos.x : owner.pos.x;
                const markY = marked ? marked.player.pos.y : owner.pos.y;
                target.set(this.homePos.x + (markX - this.homePos.x) * 0.38 + this.aiDriftX * 0.25,
                           markY - attackDir * 54 + this.aiDriftY * 0.2);
            }
        }

        // Estado táctico con histéresis: evita que el equipo cambie de plan
        // en cada frame cuando la pelota queda dividida cerca de mitad de cancha.
        const possessionState = owner && owner.team === this.team ? 'attack' :
            (owner && owner.team !== this.team ? 'defend' : null);
        const looseAttacking = !owner && (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir < -18;
        const looseDefending = !owner && (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir > 18;
        const desiredState = possessionState || (looseAttacking ? 'attack' : (looseDefending ? 'defend' : this.tacticalState));
        if (desiredState !== this.tacticalState) {
            const previousState = this.tacticalState;
            this.tacticalState = desiredState;
            this.tacticalBlend = 0;
            if (previousState !== 'balanced' && desiredState !== 'balanced') {
                this.tacticalBurstTimer = this.tacticalBurstDuration;
            } else if (desiredState === 'attack' || desiredState === 'defend') {
                this.tacticalBurstTimer = this.tacticalBurstDuration;
            }
        }
        this.tacticalBlend = Math.min(1, this.tacticalBlend + dt * 3.2);
        this.tacticalBurstTimer = Math.max(0, this.tacticalBurstTimer - dt);

        // Transiciones tácticas: bloque alto al atacar y repliegue compacto al
        // defender. Los objetivos se interpolan para que los desplazamientos
        // sean progresivos, sin teletransportes ni zigzags bruscos.
        if (!this.isGK) {
            this._enDesmarque = false;
            const closestFieldPlayer = allPlayers.filter(p => p.team === this.team && !p.isGK)
                .reduce((best, p) => !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
            const chasing = (!owner && closestFieldPlayer === this) || (owner && owner.team !== this.team && closestFieldPlayer === this);
            const carrying = owner === this;
            if (!chasing && !carrying) {
                const teammates = allPlayers.filter(p => p.team === this.team && !p.isGK);
                const laneOrder = [...teammates].sort((a, b) => a.homePos.x - b.homePos.x);
                const lane = laneOrder.indexOf(this) - 1; // -1 izquierda, 0 centro, +1 derecha
                const hasPossession = !!owner && owner.team === this.team;
                const opponentPossession = !!owner && owner.team !== this.team;
                const ballInAttackingHalf = (ball.pos.y - CONFIG.HEIGHT / 2) * attackDir < 0;
                const attacking = hasPossession || (!owner && ballInAttackingHalf);

                if (attacking) {
                    // Subida escalonada: los extremos abren la cancha y el
                    // compañero central ofrece una línea de pase por delante.
                    const av = this.tacticaAvance || 1;
                    const advance = (hasPossession ? CONFIG.ATTACK_ADVANCE * 1.72 : CONFIG.ATTACK_ADVANCE * 1.28) * av;
                    const laneSpread = lane * 39;
                    target.x += laneSpread + (ball.pos.x - CONFIG.WIDTH / 2) * 0.06;
                    target.y += attackDir * advance;
                    if (hasPossession) {
                        target.y += attackDir * (lane === 0 ? 30 : 14);
                        this._desmarcar(target, owner, allPlayers);
                    }
                } else if (opponentPossession) {
                    // Repliegue: los no presionantes protegen el centro y
                    // retroceden hacia su propio arco sin amontonarse.
                    target.x += (ball.pos.x - this.homePos.x) * 0.16 + lane * 13;
                    target.y -= attackDir * 58 * (2 - (this.tacticaAvance || 1));
                    // Los defensores de campo protegen el frente del área, no se
                    // meten dentro de la boca del arco ni se amontonan sobre el arquero.
                    const ownGoalLine = this.team === 'local' ? CONFIG.FIELD.BOTTOM - 72 : CONFIG.FIELD.TOP + 72;
                    target.y = this.team === 'local'
                        ? Math.min(target.y, ownGoalLine)
                        : Math.max(target.y, ownGoalLine);
                } else {
                    // Pelota dividida: el equipo acompaña la jugada con una
                    // línea compacta, lista para atacar o defender.
                    target.x += (ball.pos.x - this.homePos.x) * 0.08 + lane * 7;
                    const avT = this.tacticaAvance || 1;
                    target.y += attackDir * (ballInAttackingHalf ? 58 * avT : -52 * (2 - avT));
                }
                target.x = Math.max(CONFIG.FIELD.LEFT + 20, Math.min(CONFIG.FIELD.RIGHT - 20, target.x));
                target.y = Math.max(CONFIG.FIELD.TOP + 12, Math.min(CONFIG.FIELD.BOTTOM - 12, target.y));
            }
        }

        // Barrida inteligente de recuperación: únicamente el perseguidor más
        // cercano intenta el quite, con la pelota delante y sin barrer a distancia
        // absurda. El resto mantiene el marcaje zonal para no abrir huecos.
        const tackleCandidates = allPlayers.filter(p => p.team === this.team && !p.isGK);
        const closestTackler = tackleCandidates.reduce((best, p) =>
            !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
        if (owner && owner.team !== this.team && !owner.isGK && closestTackler === this &&
            this.puedeBarrer()) {
            const tackleDistance = this.pos.distanceTo(owner.pos);
            const toOwner = this.pos.directionTo(owner.pos);
            const ballInFront = (toOwner.x * this.facing.x + toOwner.y * this.facing.y) > -0.15;
            const dTackle = this.diff;
            if (dTackle) {
                // Rival de IA: barrida con probabilidad según dificultad.
                this.aiTackleTimer -= dt;
                let tackleOk = false;
                if (this.aiTackleTimer <= 0) { this.aiTackleTimer = 0.2; tackleOk = Math.random() < dTackle.tackleProb; }
                if (tackleOk && tackleDistance >= dTackle.tackleMin && tackleDistance <= dTackle.tackleMax && ballInFront) {
                    this.facing.copy(this.pos.directionTo(owner.pos));
                    this.barrida();
                    return;
                }
            } else if (this.aiBarridaEspera <= 0 && ball.kickCooldown <= 0 && (ball.z || 0) <= CONFIG.CONTROL_Z &&
                this.stamina >= this.costoBarrida() + CONFIG.ALIADO_BARRIDA_STAMINA_EXTRA &&
                tackleDistance >= 18 && tackleDistance <= 52 && ballInFront) {
                // Compañero de IA (equipo del jugador): solo se tira si la trayectoria prevista le da una
                // chance clara de llegar a la pelota; si no, sigue marcando de pie. Pausa larga entre intentos.
                this.aiTackleTimer -= dt;
                if (this.aiTackleTimer <= 0) {
                    this.aiTackleTimer = 0.2;
                    const rumbo = Math.random() < CONFIG.ALIADO_BARRIDA_PROB ? this.rumboBarridaSegura(owner, ball, dt) : null;
                    if (rumbo) {
                        this.facing.set(rumbo.x, rumbo.y);
                        this.aiBarridaEspera = CONFIG.ALIADO_BARRIDA_ESPERA;
                        this.barrida();
                        return;
                    }
                }
            }
        }

        // Suavizado exponencial de destino: reduce vibraciones de la IA y hace
        // que los cambios ataque/defensa se vean como una transición continua.
        const kStar = this.kEstrellas || 1;
        const targetAlpha = 1 - Math.exp(-CONFIG.AI_TARGET_SMOOTHING * 60 * dt * kStar);
        this.aiTarget.x += (target.x - this.aiTarget.x) * targetAlpha;
        this.aiTarget.y += (target.y - this.aiTarget.y) * targetAlpha;
        target.copy(this.aiTarget);

        // Cada jugador decide en un intervalo distinto y tiene una velocidad propia.
        this.aiThinkTimer -= dt;
        if (this.aiThinkTimer <= 0) {
            this.aiThinkTimer = (0.12 + ((this.aiSeed >>> 7) % 11) * 0.025) / kStar;
            this.aiPhase += 0.13 + ((this.aiSeed >>> 12) % 9) * 0.017;
        }
        const dir = this.pos.directionTo(target);
        const dist = this.pos.distanceTo(target);
        const fatigue = 0.58 + 0.42 * (this.stamina / CONFIG.STAMINA_MAX);
        const possessionSlowdown = this.hasBall ? 0.76 : 1.0;
        const fieldPlayers = allPlayers.filter(p => p.team === this.team && !p.isGK);
        const nearest = fieldPlayers.reduce((best, p) =>
            !best || p.pos.distanceTo(ball.pos) < best.pos.distanceTo(ball.pos) ? p : best, null);
        // Los tres jugadores salen en sprint coordinado al cambiar de fase.
        // El más cercano también puede gastar energía para presionar o atacar el balón.
        // Histeresis de resistencia para IA no controlada: sprint hasta 50%,
        // luego desplazamiento normal y recuperación hasta 75%.
        const dp = this.diff;
        const restBelow = dp ? dp.restBelow : 50;
        if (this.stamina <= restBelow) this.aiSprintResting = true;
        if (this.stamina >= (dp ? Math.min(75, restBelow + 25) : 75)) this.aiSprintResting = false;
        const sprintReady = !this.aiSprintResting && this.stamina > restBelow;
        const tacticalSprint = sprintReady && this.tacticalBurstTimer > 0 && dist > 12;
        const chaseSprint = sprintReady && nearest === this && dist > (dp ? dp.sprintDist : 48);
        const carrySprint = !!dp && sprintReady && owner === this && dist > 10;
        const supportSprint = sprintReady && this._enDesmarque && dist > 30;
        this.sprinting = !!(tacticalSprint || chaseSprint || carrySprint || supportSprint);
        const sprintBoost = this.sprinting ? 1.62 : 1.0;
        let speed = CONFIG.PLAYER_SPEED * 0.58 * this.mobilityMultiplier * (dp ? 1 : this.aiSpeedFactor) * fatigue * possessionSlowdown * sprintBoost;
        let maxStep = this.isGK ? 0.75 : (this.sprinting ? 1.32 : ((!owner && nearest === this && dist > 35) ? 0.92 : 0.52));
        if (dp && !this.isGK) {
            // Equipos con dificultad: velocidades propias del perfil (el humano corre a ~2.6, esprinta a ~3.4).
            const pursuing = nearest === this && (!owner || owner.team !== this.team) && dist > 30;
            let cap = this.sprinting ? dp.sprintStep : (pursuing ? dp.chaseStep : dp.walkStep);
            cap *= (0.9 + 0.1 * (this.stamina / CONFIG.STAMINA_MAX)) * (this.hasBall ? dp.carryFactor : 1);
            maxStep = cap;
            speed = cap * 1.2 * Math.min(1, dist / 18);   // frena al llegar para no vibrar alrededor del destino
        }
        if (dist > 2.5) {
            const factor = (!dp && this.aiThinkTimer < 0.08) ? 0.82 : 1;
            const steering = dp && dp.sprintStep > 2 ? (this.sprinting ? 0.34 : 0.24)
                           : (this.sprinting ? Math.min(0.30, CONFIG.AI_STEERING * 1.65) : CONFIG.AI_STEERING);
            this.vel.x += (dir.x * speed * factor - this.vel.x) * steering;
            this.vel.y += (dir.y * speed * factor - this.vel.y) * steering;
            const v = this.vel.length();
            if (v > maxStep) this.vel.scale(maxStep / v);
            if (this.vel.length() > 0.08) this.facing.copy(this.vel.clone().normalize());
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
            if (!this.isGK) {
                const ownGoalSafeY = this.team === 'local' ? CONFIG.FIELD.BOTTOM - this.aiSafeDepth : CONFIG.FIELD.TOP + this.aiSafeDepth;
                this.pos.y = this.team === 'local'
                    ? Math.min(this.pos.y, ownGoalSafeY)
                    : Math.max(this.pos.y, ownGoalSafeY);
            }
        } else {
            this.vel.scale(0.55);
            if (this.vel.length() < 0.04) this.vel.set(0, 0);
        }
    },

    // Desmarque: parte del puesto que marca la táctica y, si está cubierto,
    // elige entre varios apoyos el que deja más espacio y línea de pase.
    _desmarcar(target, owner, allPlayers) {
        const attackDir = this.team === 'local' ? -1 : 1;
        const f = CONFIG.FIELD;
        const clampX = (x) => Math.max(f.LEFT + 20, Math.min(f.RIGHT - 20, x));
        const clampY = (y) => Math.max(f.TOP + 12, Math.min(f.BOTTOM - 12, y));
        const ox = owner.pos.x, oy = owner.pos.y;
        const bx = target.x, by = target.y;
        const lado = Math.sign(bx - ox) || ((this.aiSeed & 1) ? 1 : -1);
        const apoyo = owner.isHuman ? 1 : 0;
        const spots = [
            { x: bx, y: by, peso: 1.25 },
            { x: bx + lado * 34, y: by + attackDir * 22, peso: 1.0 },
            { x: bx - lado * 46, y: by + attackDir * 8, peso: 0.96 },
            { x: ox + lado * 78, y: oy + attackDir * 92, peso: 0.92 },
            { x: ox + lado * 36, y: oy - attackDir * 34, peso: 0.70 + apoyo * 0.40 }
        ];
        const rivales = [];
        const mates = [];
        for (let i = 0; i < allPlayers.length; i++) {
            const p = allPlayers[i];
            if (!p || p.isGK) continue;
            if (p.team !== this.team) rivales.push(p);
            else if (p !== this && p !== owner) mates.push(p);
        }
        const libre = (sx, sy) => {
            const dx = sx - ox, dy = sy - oy;
            const len2 = dx * dx + dy * dy;
            if (len2 < 400) return false;
            for (let i = 0; i < rivales.length; i++) {
                const e = rivales[i];
                const t = ((e.pos.x - ox) * dx + (e.pos.y - oy) * dy) / len2;
                if (t < 0.12 || t > 0.92) continue;
                const px = ox + dx * t, py = oy + dy * t;
                const ex = e.pos.x - px, ey = e.pos.y - py;
                if (ex * ex + ey * ey < 22 * 22) return false;
            }
            return true;
        };
        let best = null, bestScore = -Infinity, keep = -Infinity;
        const prevX = this.aiRunX, prevY = this.aiRunY;
        for (let i = 0; i < spots.length; i++) {
            const sx = clampX(spots[i].x), sy = clampY(spots[i].y);
            let space = 999;
            for (let k = 0; k < rivales.length; k++) {
                space = Math.min(space, Math.hypot(rivales[k].pos.x - sx, rivales[k].pos.y - sy));
            }
            let score = spots[i].peso * 16 + Math.min(space, 120) * 0.55;
            score += Math.max(-20, Math.min(70, (sy - oy) * attackDir)) * 0.22;
            const dist = Math.hypot(sx - ox, sy - oy);
            if (dist < 48) score -= 40;
            else if (dist > 240) score -= (dist - 240) * 0.4;
            if (libre(sx, sy)) score += 22 + apoyo * 14;
            else score -= 26 + apoyo * 12;
            for (let m = 0; m < mates.length; m++) {
                if (Math.hypot(mates[m].pos.x - sx, mates[m].pos.y - sy) < 36) score -= 30;
            }
            score -= Math.hypot(sx - bx, sy - by) * 0.08;
            if (prevX != null && Math.hypot(sx - prevX, sy - prevY) < 20) keep = score;
            if (score > bestScore) { bestScore = score; best = { x: sx, y: sy }; }
        }
        if (!best) return;
        if (prevX != null && keep > bestScore - 10) best = { x: prevX, y: prevY };
        this.aiRunX = best.x;
        this.aiRunY = best.y;
        target.x = best.x;
        target.y = best.y;
        this._enDesmarque = Math.hypot(best.x - bx, best.y - by) > 16;
    },

    // Hasta dónde puede bajar este jugador de campo hacia su propia línea de gol. Normalmente se queda
    // delante del área (no se mete en la red), pero si la pelota está en su área, suelta o en poder del rival,
    // y él es el compañero de campo más cercano, baja hasta ella: antes el tope fijo de 68 px dejaba pelotas
    // inalcanzables para el defensor y el arquero no salía, así que nadie las agarraba.
    _actualizarProfundidadDefensiva(ball, owner, allPlayers) {
        let prof = CONFIG.DEFENSOR_PROF_NORMAL;
        const lineY = this.team === 'local' ? CONFIG.FIELD.BOTTOM : CONFIG.FIELD.TOP;
        if (ball && Math.abs(ball.pos.y - lineY) < CONFIG.AREA_PROFUNDIDAD && (!owner || owner.team !== this.team)) {
            let nearest = null, nd = Infinity;
            for (const p of allPlayers) {
                if (p.team !== this.team || p.isGK) continue;
                const d = p.pos.distanceTo(ball.pos);
                if (d < nd) { nd = d; nearest = p; }
            }
            if (nearest === this) prof = CONFIG.DEFENSOR_PROF_MIN;
        }
        this.aiSafeDepth = prof;
    },

    // Salida del arquero: devuelve {tx, ty, sp, parcial} (adónde ir y a qué velocidad) o null si se queda en su línea.
    // (a) Pelota SUELTA y lenta en su área y nadie la alcanza antes que él: sale a buscarla (ancho de toda el área).
    // (b) Un rival entró con la pelota y está cerca: solo "achica el ángulo" (adelanta un poco su línea sobre los
    //     tres palos, sin tirarse a quitársela: de eso se ocupa el defensor), para no desbalancear la dificultad.
    // Con un tiro en camino no sale: ataja.
    _salidaArquero(ball, allPlayers, danger) {
        if (danger || !allPlayers || ball.owner === this) return null;
        const owner = ball.owner;
        const lineY = this.team === 'local' ? CONFIG.FIELD.BOTTOM : CONFIG.FIELD.TOP;
        const goal = this.team === 'local' ? CONFIG.GOAL_SOUTH : CONFIG.GOAL_NORTH;
        const cx = goal.x + goal.w / 2;
        if (Math.abs(ball.pos.y - lineY) > CONFIG.AREA_PROFUNDIDAD) return null;
        if (Math.abs(ball.pos.x - cx) > CONFIG.AREA_MITAD_ANCHO) return null;
        if ((ball.z || 0) > CONFIG.CONTROL_Z + 6) return null;          // pelota alta: no sale
        const dGK = this.pos.distanceTo(ball.pos);
        if (owner) {
            if (owner.team === this.team) return null;
            if (dGK > 70) return null;                                   // el rival todavía está lejos
        } else {
            if (ball.vel.length() > 3.0) return null;                    // pelota rápida: se queda en su línea
            for (const p of allPlayers) {                                // solo sale si llega primero
                if (p === this || p.isGK) continue;
                const d = p.pos.distanceTo(ball.pos);
                if (p.team === this.team ? d + 6 < dGK : d + 2 < dGK) return null;
            }
        }
        const gkp = this.diff ? this.diff.gk : null;
        if (owner) {
            const depth = Math.abs(ball.pos.y - lineY);
            const profObj = Math.max(24, Math.min(52, depth * 0.6));          // su línea normal está a 24 px del fondo
            const ty = this.team === 'local' ? lineY - profObj : lineY + profObj;
            const tx = Math.max(goal.x - 10, Math.min(goal.x + goal.w + 10, cx + (ball.pos.x - cx) * 0.7));
            return { tx, ty, sp: (gkp ? gkp.speed : 0.92) * 1.2, parcial: true };
        }
        // El contacto del arquero está a la altura del torso (27 px sobre los pies): se para 27 px "detrás" de la pelota.
        const lead = owner ? 0 : 6;
        let tx = ball.pos.x + ball.vel.x * lead;
        let ty = ball.pos.y + ball.vel.y * lead + 27;
        const f = CONFIG.FIELD;
        tx = Math.max(f.LEFT + 14, Math.min(f.RIGHT - 14, tx));
        if (this.team === 'local') ty = Math.min(ty, f.BOTTOM + 14);
        return { tx, ty, sp: (gkp ? gkp.speed : 0.92) * 1.5 };
    },

    _isSecondNearest(ball, allPlayers) {
        const mates = allPlayers.filter(p => p.team === this.team && !p.isGK)
            .sort((a, b) => a.pos.distanceTo(ball.pos) - b.pos.distanceTo(ball.pos));
        return mates[1] === this;
    },

    // Jugador con la pelota (solo equipos con dificultad): decide entre rematar, pasar o seguir conduciendo.
    // Devuelve 'kicked' si pateó, o el punto hacia el que sigue conduciendo.
    _aiCarry(dt, ball, players, attackDir) {
        const d = this.diff;
        const goal = this.team === 'local' ? CONFIG.GOAL_NORTH : CONFIG.GOAL_SOUTH;
        const goalCx = goal.x + goal.w / 2;
        const lineY = goal.lineY;
        const enemies = players.filter(p => p.team !== this.team && !p.isGK);
        const enemyGK = players.find(p => p.team !== this.team && p.isGK);
        let nearOpp = null, nearOppDist = Infinity;
        for (const e of enemies) {
            const dd = e.pos.distanceTo(this.pos);
            if (dd < nearOppDist) { nearOppDist = dd; nearOpp = e; }
        }
        const dGoal = Math.hypot(goalCx - this.pos.x, lineY - this.pos.y);

        this.aiActTimer -= dt;
        if (this.aiActTimer <= 0) {
            this.aiActTimer = d.react * (0.8 + Math.random() * 0.4);
            const pressured = nearOpp && nearOppDist < d.pressureDist;

            // 1) REMATE: a la esquina contraria al arquero, con el error propio del nivel.
            const ahead = (lineY - this.pos.y) * attackDir > 0;
            if (ahead && dGoal < d.shootDist) {
                const forced = dGoal < 120 || (pressured && dGoal < d.shootDist * 0.8);
                if (forced || Math.random() < d.shootProb) {
                    const postL = goal.x + 17, postR = goal.x + goal.w - 17;
                    let aimX;
                    if (enemyGK) aimX = enemyGK.pos.x > goalCx ? postL : postR;
                    else aimX = Math.random() < 0.5 ? postL : postR;
                    if (Math.abs(this.pos.x - goalCx) > 75) aimX = this.pos.x < goalCx ? postR : postL; // desde el costado, al palo lejano
                    const aim = new Vector2D(aimX, lineY + attackDir * 18);
                    const dir = this.pos.directionTo(aim).normalize();
                    const ang = (Math.random() - 0.5) * 2 * d.aimErr;
                    const c = Math.cos(ang), s = Math.sin(ang);
                    const shot = new Vector2D(dir.x * c - dir.y * s, dir.x * s + dir.y * c);
                    // Elevación: de cerca va casi pegado al piso; de lejos se levanta un poco (y a veces se va alto).
                    const vzTiro = CONFIG.SHOT_VZ_MIN + Math.min(1, dGoal / 260) * 1.1 + Math.random() * 0.5;
                    const shotPow = CONFIG.KICK_POWER * d.shotPower * (0.92 + Math.random() * 0.16);
                    this._aiKick(ball, shot, shotPow, vzTiro);
                    (this._stats || ball._stats)?.registrarTiro({
                        jugador: this,
                        alArco: esTiroAlArcoProyectado(ball.pos, shot, shotPow, vzTiro, this.team),
                        tipo: 'pie',
                    });
                    return 'kicked';
                }
            }

            // 2) PASE: si lo presionan y hay un compañero libre y mejor ubicado.
            if (pressured && Math.random() < d.passProb) {
                let best = null, bestScore = -Infinity;
                for (const m of players) {
                    if (m === this || m.isGK || m.team !== this.team) continue;
                    let free = Infinity;
                    for (const e of enemies) free = Math.min(free, e.pos.distanceTo(m.pos));
                    const progress = (m.pos.y - this.pos.y) * attackDir;
                    const dist = m.pos.distanceTo(this.pos);
                    if (free < 42 || dist < 40 || dist > 260) continue;
                    const score = progress * 0.9 + free * 0.6 - dist * 0.15;
                    if (score > bestScore) { bestScore = score; best = m; }
                }
                if (best && bestScore > -30) {
                    const predicted = best.pos.clone().add(best.vel || new Vector2D(0, 0), 4);
                    const dir = ball.pos.directionTo(predicted).normalize();
                    const distance = ball.pos.distanceTo(predicted);
                    // Si un rival cierra la línea de pase, el pase va por arriba (pica en el compañero).
                    let cerrado = false;
                    for (const e of enemies) {
                        const t = Math.max(0, Math.min(1, ((e.pos.x - ball.pos.x) * dir.x + (e.pos.y - ball.pos.y) * dir.y) / Math.max(1, distance)));
                        const px = ball.pos.x + dir.x * distance * t, py = ball.pos.y + dir.y * distance * t;
                        if (Math.hypot(e.pos.x - px, e.pos.y - py) < 20) { cerrado = true; break; }
                    }
                    if (cerrado && distance > 70) {
                        this.facing.copy(dir);
                        ball.lanzarElevado(dir, distance, this.team, Math.min(6.0, CONFIG.LOB_VZ + distance / 300));
                        this.hasBall = false;
                        this.kickTimer = CONFIG.KICK_ANIM_SEC;
                        (this._stats || ball._stats)?.registrarPase({ jugador: this, elevado: true });
                        return 'kicked';
                    }
                    const needed = Math.max(1.8, Math.min(10.0, distance * (1 - CONFIG.BALL_FRICTION) * 1.12));
                    const power = Math.min(CONFIG.PASS_POWER_MAX, needed * CONFIG.PASS_POWER_BOOST);
                    this._aiKick(ball, dir, power);
                    ball.setPassDrag(power, distance * 1.12, this);
                    (this._stats || ball._stats)?.registrarPase({ jugador: this, elevado: false });
                    return 'kicked';
                }
            }
        }

        // 3) CONDUCCIÓN: hacia el arco, esquivando al defensor que tiene delante.
        let tx = this.pos.x + (goalCx - this.pos.x) * (dGoal < d.shootDist ? 0.35 : 0.06);
        let ty = this.pos.y + attackDir * 60;
        if (nearOpp && nearOppDist < 90 && (nearOpp.pos.y - this.pos.y) * attackDir > -14) {
            const side = this.pos.x >= nearOpp.pos.x ? 1 : -1;
            tx += side * (d.react < 0.12 ? 62 : 44);
        }
        tx = Math.max(CONFIG.FIELD.LEFT + 24, Math.min(CONFIG.FIELD.RIGHT - 24, tx));
        ty = Math.max(CONFIG.FIELD.TOP + 12, Math.min(CONFIG.FIELD.BOTTOM - 14, ty));
        return new Vector2D(tx, ty);
    },

    _aiKick(ball, dir, power, vz = 0) {
        this.facing.copy(dir);
        ball.kick(dir, power, vz, this.team);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
    },

    // Saque del arquero. Antes despejaba siempre ~300 px al centro: la pelota
    // caía en el área rival, el otro arquero la atajaba y se la devolvían.
    _gkSacarPelota(ball, allPlayers, attackDir) {
        const enemies = (allPlayers || []).filter(p => p.team !== this.team && !p.isGK);
        const mates = (allPlayers || []).filter(p => p.team === this.team && !p.isGK);
        let pressured = false;
        for (const e of enemies) {
            if (e.pos.distanceTo(this.pos) < 90) { pressured = true; break; }
        }
        let best = null, bestScore = -Infinity;
        for (const m of mates) {
            const dist = m.pos.distanceTo(this.pos);
            if (dist < 70 || dist > 230) continue;
            const progress = (m.pos.y - this.pos.y) * attackDir;
            if (progress < 20) continue;
            let free = Infinity;
            for (const e of enemies) free = Math.min(free, e.pos.distanceTo(m.pos));
            if (free < 36) continue;
            const lateral = Math.abs(m.pos.x - CONFIG.WIDTH / 2);
            const score = progress * 1.1 + free * 0.7 - dist * 0.12 - Math.max(0, lateral - 90) * 0.08;
            if (score > bestScore) { bestScore = score; best = m; }
        }
        if (best && bestScore > -20 && (!pressured || Math.random() < 0.72)) {
            const predicted = best.pos.clone().add(best.vel || new Vector2D(0, 0), 3);
            const dir = ball.pos.directionTo(predicted).normalize();
            const distance = Math.max(60, Math.min(220, ball.pos.distanceTo(predicted)));
            let cerrado = false;
            for (const e of enemies) {
                const t = Math.max(0, Math.min(1,
                    ((e.pos.x - ball.pos.x) * dir.x + (e.pos.y - ball.pos.y) * dir.y) / Math.max(1, distance)));
                const px = ball.pos.x + dir.x * distance * t;
                const py = ball.pos.y + dir.y * distance * t;
                if (Math.hypot(e.pos.x - px, e.pos.y - py) < 22) { cerrado = true; break; }
            }
            this.facing.copy(dir);
            const esElevado = cerrado || distance > 140 || pressured;
            if (esElevado) {
                ball.lanzarElevado(dir, distance, this.team, Math.min(5.4, CONFIG.LOB_VZ + distance / 280));
            } else {
                const needed = Math.max(1.8, Math.min(9.5, distance * (1 - CONFIG.BALL_FRICTION) * 1.15));
                const power = Math.min(CONFIG.PASS_POWER_MAX, needed * CONFIG.PASS_POWER_BOOST);
                ball.kick(dir, power, 0, this.team);
                ball.setPassDrag(power, distance * 1.1, this);
            }
            this.hasBall = false;
            this.kickTimer = CONFIG.KICK_ANIM_SEC;
            this.gkAction = 'ready';
            this.gkDiveCooldown = 0.55;
            (this._stats || ball._stats)?.registrarPase({ jugador: this, elevado: esElevado });
            return;
        }
        const sideBias = (Math.random() < 0.5 ? -1 : 1) * (0.42 + Math.random() * 0.38);
        const towardCenter = Math.max(-0.18, Math.min(0.18, (CONFIG.WIDTH / 2 - this.pos.x) / 220));
        const clearance = new Vector2D(sideBias + towardCenter, attackDir).normalize();
        this.facing.copy(clearance);
        ball.lanzarElevado(clearance, 150 + Math.random() * 70, this.team, 4.4 + Math.random() * 0.9);
        this.hasBall = false;
        this.kickTimer = CONFIG.KICK_ANIM_SEC;
        this.gkAction = 'ready';
        this.gkDiveCooldown = 0.55;
        (this._stats || ball._stats)?.registrarDespeje({ jugador: this });
    },

    _updateGoalkeeperAI(dt, ball, goalY, attackDir, allPlayers) {
        if (!ball) return;
        if (ball.owner === this) {
            this.hasBall = true;
            if (this.gkActionTimer <= 0) this._gkSacarPelota(ball, allPlayers, attackDir);
            return;
        }
        const goal = this.team === 'local' ? CONFIG.GOAL_SOUTH : CONFIG.GOAL_NORTH;
        const goalCenter = goal.x + goal.w / 2;
        const ownGoalDir = this.team === 'local' ? 1 : -1;
        const incoming = ball.vel.y * ownGoalDir > 0.65;
        const towardGoal = (ball.pos.y - goalY) * ownGoalDir < 0;
        let predictedX = ball.pos.x;
        let eta = 99;
        if (incoming) {
            eta = (goalY - ball.pos.y) / (ball.vel.y || 0.001);
            const gk = this.diff ? this.diff.gk : null;
            if (eta >= 0 && eta < (gk ? gk.look : 1.15)) predictedX = ball.pos.x + ball.vel.x * Math.min(eta, gk ? gk.cap : 0.85);
        }
        const gkp = this.diff ? this.diff.gk : null;

        const insideGoalMouth = predictedX > goal.x + 5 && predictedX < goal.x + goal.w - 5;
        const danger = incoming && towardGoal && eta >= 0 && eta < (gkp ? gkp.eta : 0.30) && insideGoalMouth;
        const lateral = predictedX - this.pos.x;
        const diveThreshold = 23; // reservado para ajustes de dificultad

        // Anticipa el disparo y se arroja en dirección al punto de cruce.
        if (danger && this.gkDiveCooldown <= 0 && this.gkAction !== 'dive' && this.gkAction !== 'catch') {
            this.gkDiveDir = Math.abs(lateral) > 7 ? Math.sign(lateral) : (ball.vel.x >= 0 ? 1 : -1);
            const height = Math.abs(ball.pos.y - goalY);
            this.gkAction = height < 30 ? 'dive_low' : (height < 68 ? 'dive_mid' : 'dive_up');
            this.gkActionTimer = 0.30;
            this.gkDiveCooldown = gkp ? gkp.cooldown : 2.05;
            this.gkTargetX = Math.max(goal.x - 5, Math.min(goal.x + goal.w + 5, predictedX));
        }

        // Pelota suelta (o rival que entra con ella) en su área: sale a buscarla en vez de mirar.
        const salida = (this.gkAction.startsWith('dive') || this.gkAction === 'catch') ? null : this._salidaArquero(ball, allPlayers, danger);
        if (salida) {
            this.gkSalida = !salida.parcial;
            const ddx = salida.tx - this.pos.x, ddy = salida.ty - this.pos.y;
            const dd = Math.hypot(ddx, ddy) || 1;
            const k = Math.min(1, dd / 14);   // frena al llegar para no vibrar sobre la pelota pero sin perder alcance
            this.vel.x = ddx / dd * salida.sp * k;
            this.vel.y = ddy / dd * salida.sp * k;
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;
            this.facing.set(Math.sign(ball.pos.x - this.pos.x) * 0.3, -ownGoalDir);
            if (this.gkActionTimer <= 0 && !danger) this.gkAction = 'ready';
            return;
        }
        const volviendo = this.gkSalida;   // terminó la salida: vuelve a su línea más rápido que su paso normal

        // El arquero acompaña horizontalmente la pelota, sin abandonar el área.
        const readX = ball.pos.x + (incoming ? ball.vel.x * (gkp ? gkp.readLead : 0.18) : 0);
        const homeX = goalCenter + Math.max(-48, Math.min(48, (readX - goalCenter) * (gkp ? gkp.follow : 0.58)));
        let targetX = homeX;
        if (this.gkAction.startsWith('dive')) targetX = this.gkTargetX;
        const maxX = goalCenter + goal.w * 0.5 + 12;
        targetX = Math.max(goalCenter - goal.w * 0.5 - 12, Math.min(maxX, targetX));
        const diving = this.gkAction.startsWith('dive');
        const maxSpeed = (diving ? (gkp ? gkp.diveSpeed : 1.85) : (gkp ? gkp.speed : 0.92)) * (volviendo ? 1.6 : 1);
        const dx = targetX - this.pos.x;
        this.vel.x = Math.max(-maxSpeed, Math.min(maxSpeed, dx * (diving ? (gkp ? gkp.diveResp : 0.13) : (gkp ? 0.060 * gkp.speed / 0.92 : 0.060))));
        const targetY = goalY + (this.gkAction.startsWith('dive') ? -ownGoalDir * 4 : 0);
        const maxVY = volviendo ? 1.6 : 0.9;
        this.vel.y = Math.max(-maxVY, Math.min(maxVY, (targetY - this.pos.y) * 0.08));
        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;
        if (volviendo) {   // ya está otra vez en su línea y dentro de los postes: se acaba el límite ensanchado
            const gx0 = goal.x - 10, gx1 = goal.x + goal.w + 10;
            if (this.pos.x >= gx0 && this.pos.x <= gx1 && Math.abs(this.pos.y - goalY) <= 8) this.gkSalida = false;
        }
        if (Math.abs(this.vel.x) + Math.abs(this.vel.y) > 0.08) this.facing.set(Math.sign(this.vel.x) || 0, -ownGoalDir * 0.12);
        else this.facing.set((ball.pos.x >= this.pos.x ? 1 : -1) * 0.15, -ownGoalDir);

        if (this.gkActionTimer <= 0 && !danger) this.gkAction = 'ready';
    },
});

export { Jugador };

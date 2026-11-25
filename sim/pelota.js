import { CONFIG } from './config.js';
import { Vector2D } from './vector.js';

// ============================================================
// PELOTA
// ============================================================
export class Pelota {
    constructor(x, y) {
        this.pos = new Vector2D(x, y);
        this.vel = new Vector2D(0, 0);
        this.radius = CONFIG.BALL_RADIUS;
        this.z = 0;             // altura sobre el piso (px)
        this.vz = 0;            // velocidad vertical (px por cuadro)
        this.lastTeam = null;   // equipo que la tocó por última vez ('local' | 'rival' | null)
        this.owner = null;
        this.kickCooldown = 0;
        this.passDrag = null;   // freno especial de un pase fuerte (null = fricción normal)
        this.passTeam = null;   // equipo que hizo el pase en vuelo (para poder interceptarlo)
        this.prevPos = new Vector2D(x, y);   // posición del cuadro anterior (tramo recorrido, para interceptar sin "atravesar" jugadores)
    }

    // Un pase sale más fuerte pero frena antes, de modo que alcanza 'range' px y se detiene
    // junto al compañero en vez de pasarse de largo. Con BOOST 1.0 equivale a la fricción original.
    setPassDrag(power, range, kicker = null) {
        this.passTeam = kicker ? kicker.team : null;
        this.passDrag = Math.max(0.80, Math.min(CONFIG.BALL_FRICTION, 1 - power / Math.max(1, range)));
    }

    update(dt) {
        if (this.kickCooldown > 0) this.kickCooldown--;

        this.prevPos.copy(this.pos);
        if (this.owner) {
            this.passDrag = null;
            this.passTeam = null;
            const offset = 18;
            let fx = this.owner.facing.x, fy = this.owner.facing.y;
            if (Math.abs(fx) + Math.abs(fy) < 0.1) {
                fx = 0;
                fy = this.owner.team === 'local' ? -1 : 1;
            }
            this.pos.x = this.owner.pos.x + fx * offset;
            this.pos.y = this.owner.pos.y + fy * offset;
            this.vel.set(0, 0);
            this.z = 0;
            this.vz = 0;
            return;
        }

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        if (this.z > 0 || this.vz > 0) {
            // EN EL AIRE: gravedad, casi sin fricción horizontal. Al caer pica (y pierde velocidad) o rueda.
            this.z += this.vz;
            this.vz -= CONFIG.BALL_GRAVITY;
            this.vel.x *= CONFIG.BALL_AIR_FRICTION;
            this.vel.y *= CONFIG.BALL_AIR_FRICTION;
            if (this.z <= 0) {
                this.z = 0;
                if (this.vz < -CONFIG.BALL_Z_MIN_BOUNCE) {
                    this.vz = -this.vz * CONFIG.BALL_Z_BOUNCE;
                    this.vel.x *= CONFIG.BALL_LANDING_DAMP;
                    this.vel.y *= CONFIG.BALL_LANDING_DAMP;
                    this.bounceFrame = true;          // lo lee fx.js (polvo en el pique)
                } else {
                    this.vz = 0;
                }
            }
            this._bounceWalls();
            return;
        }

        let friction = CONFIG.BALL_FRICTION;
        if (this.passDrag !== null) {
            if (this.vel.length() < 2.2) this.passDrag = null;   // ya casi llegó: vuelve la fricción normal
            else friction = this.passDrag;
        }
        this.vel.x *= friction;
        this.vel.y *= friction;
        if (Math.abs(this.vel.x) < CONFIG.BALL_STOP_THRESHOLD) this.vel.x = 0;
        if (Math.abs(this.vel.y) < CONFIG.BALL_STOP_THRESHOLD) this.vel.y = 0;
        this._bounceWalls();
    }

    _bounceWalls() {
        const f = CONFIG.FIELD;
        const r = this.radius;
        const gn = CONFIG.GOAL_NORTH;
        const gs = CONFIG.GOAL_SOUTH;
        // La pelota solo entra si pasa completamente entre los postes.
        // Además, tiene que pasar por debajo del travesaño: un tiro por arriba rebota como si diera en el fondo.
        const underBar = this.z <= CONFIG.BAR_HEIGHT;
        const inNorthMouth = underBar && this.pos.x > gn.x + r * 0.85 && this.pos.x < gn.x + gn.w - r * 0.85;
        const inSouthMouth = underBar && this.pos.x > gs.x + r * 0.85 && this.pos.x < gs.x + gs.w - r * 0.85;

        if (this.pos.x - r < f.LEFT) {
            this.pos.x = f.LEFT + r;
            this.vel.x = -this.vel.x * CONFIG.BALL_BOUNCE;
        }
        if (this.pos.x + r > f.RIGHT) {
            this.pos.x = f.RIGHT - r;
            this.vel.x = -this.vel.x * CONFIG.BALL_BOUNCE;
        }

        // Línea de fondo norte: rebota fuera de los postes, entra al arco
        // dentro de la boca y se detiene/rebota suavemente contra la red.
        if (this.pos.y - r < f.TOP) {
            if (!inNorthMouth) {
                const sp = Math.hypot(this.vel.x, this.vel.y);
                const cercaPaloN =
                    Math.abs(this.pos.x - gn.x) <= 16 || Math.abs(this.pos.x - (gn.x + gn.w)) <= 16;
                const dioTravesanoN =
                    this.pos.x > gn.x - r && this.pos.x < gn.x + gn.w + r && this.z > CONFIG.BAR_HEIGHT;
                if (sp >= 3.2 && (cercaPaloN || dioTravesanoN)) {
                    this._hitWoodwork = {
                        arco: 'north',
                        tipo: dioTravesanoN ? 'travesano' : 'palo',
                        x: this.pos.x,
                        y: f.TOP,
                    };
                }
                this.pos.y = f.TOP + r;
                this.vel.y = Math.abs(this.vel.y) * CONFIG.BALL_BOUNCE;
            } else if (this.pos.y - r < gn.backY) {
                this.pos.y = gn.backY + r;
                this.vel.y = Math.abs(this.vel.y) * 0.38;
            }
        }
        // Línea de fondo sur.
        if (this.pos.y + r > f.BOTTOM) {
            if (!inSouthMouth) {
                const sp = Math.hypot(this.vel.x, this.vel.y);
                const cercaPaloS =
                    Math.abs(this.pos.x - gs.x) <= 16 || Math.abs(this.pos.x - (gs.x + gs.w)) <= 16;
                const dioTravesanoS =
                    this.pos.x > gs.x - r && this.pos.x < gs.x + gs.w + r && this.z > CONFIG.BAR_HEIGHT;
                if (sp >= 3.2 && (cercaPaloS || dioTravesanoS)) {
                    this._hitWoodwork = {
                        arco: 'south',
                        tipo: dioTravesanoS ? 'travesano' : 'palo',
                        x: this.pos.x,
                        y: f.BOTTOM,
                    };
                }
                this.pos.y = f.BOTTOM - r;
                this.vel.y = -Math.abs(this.vel.y) * CONFIG.BALL_BOUNCE;
            } else if (this.pos.y + r > gs.backY) {
                this.pos.y = gs.backY - r;
                this.vel.y = -Math.abs(this.vel.y) * 0.38;
            }
        }
    }

    // vz > 0 la manda por el aire (pase elevado, tiro cargado, cabezazo). 'team' = quién la tocó.
    kick(direction, power, vz = 0, team = null) {
        this.owner = null;
        this.passDrag = null;
        this.passTeam = null;
        this.lastTeam = team;
        this.vz = vz;
        this.z = vz > 0 ? 0.01 : 0;
        this.kickCooldown = 14;       // respuesta más rápida tras patear / pasar
        this._justKicked = true;
        // El golpe suena en este mismo instante (toque, pase o tiro), no en el frame siguiente.
        if (typeof this.onKick === 'function') this.onKick();
        const dir = direction.clone().normalize();
        if (dir.length() < 0.01) dir.set(0, -1);
        const effPower = power * (this.arcadePowerMult || 1);
        this.vel.x = dir.x * effPower;
        this.vel.y = dir.y * effPower;
    }

    // Pase elevado: sale con impulso vertical 'vz' y pica por primera vez 'distancia' px más adelante.
    lanzarElevado(direction, distancia, team, vz = CONFIG.LOB_VZ) {
        const T = Math.max(8, Math.round(2 * vz / CONFIG.BALL_GRAVITY) + 1);   // cuadros en el aire
        const f = CONFIG.BALL_AIR_FRICTION;
        const recorrido = (1 - Math.pow(f, T)) / (1 - f);                       // distancia con velocidad inicial 1
        this.kick(direction, Math.max(1.5, distancia / recorrido), vz, team);
    }

    enAire() { return this.z > 0.5 || this.vz > 0.5; }

    reset(x, y) {
        this.z = 0;
        this.vz = 0;
        this.lastTeam = null;
        this.pos.set(x, y);
        this.vel.set(0, 0);
        this.owner = null;
        this.passDrag = null;
        this.passTeam = null;
        this.prevPos.set(x, y);
    }

    // ¿Es un pase en vuelo (libre y con freno de pase) que hizo el equipo contrario a 'team'?
    esPaseRival(team) {
        return !this.owner && this.passDrag !== null && !!this.passTeam && this.passTeam !== team;
    }

    // Distancia mínima entre un punto y el tramo que recorrió la pelota en el último cuadro.
    distanciaATramo(p) {
        const ax = this.prevPos.x, ay = this.prevPos.y;
        const bx = this.pos.x - ax, by = this.pos.y - ay;
        const len2 = bx * bx + by * by;
        let t = len2 > 0 ? ((p.x - ax) * bx + (p.y - ay) * by) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (ax + bx * t), p.y - (ay + by * t));
    }
}

if (typeof globalThis !== 'undefined') globalThis.Pelota = Pelota;

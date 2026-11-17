/**
 * Liga Chaquito F8 — NetSync: suavizado del modo EN LÍNEA.
 *
 * El servidor es la autoridad y manda el estado del partido ~30 veces por segundo. Si el cliente dibujara
 * cada snapshot apenas llega, todo se vería a tirones (wifi, datos móviles) y el jugador propio respondería
 * con el retraso de ida y vuelta. Este módulo arregla las dos cosas, sin tocar las reglas del partido:
 *
 *   1) SnapshotBuffer: guarda los últimos snapshots y dibuja el partido ~80 ms "en el pasado", interpolando
 *      entre dos snapshots reales. Si falta uno, extrapola un poco (máx. 100 ms) en vez de congelar.
 *   2) OwnPredictor: el jugador que manejás se mueve YA con tus teclas (misma fórmula de movimiento que el
 *      servidor) y se corrige suavemente hacia lo que dice el servidor. Si el servidor lo frena (choque,
 *      barrida, pared), se alinea sin teletransportes.
 *
 * Es un script clásico (index.html) y también un módulo de CommonJS para los tests en Node.
 */
(function (root) {
    'use strict';

    const SERVER_HZ = 60;                 // ticks por segundo de la simulación del servidor
    const MS_POR_TICK = 1000 / SERVER_HZ;

    const NET = {
        INTERP_MS: 80,                    // cuánto "en el pasado" se dibuja (≈ 2 snapshots a 30 Hz)
        EXTRAPOLAR_MAX_MS: 100,           // si falta un snapshot, se extrapola como máximo esto
        SALTO_JUGADOR: 70,                // más que esto entre dos snapshots = teletransporte (gol, saque): no se interpola
        SALTO_PELOTA: 110,
        PRED_SNAP: 48,                    // error de predicción a partir del cual se salta directo al servidor
        PRED_ZONA_MUERTA: 1.2,            // por debajo de esto no se corrige (evita temblores)
        PRED_CORRECCION: 0.14,            // fracción del error que se corrige por cuadro
        PRED_MAX_ADELANTO: 20,            // cuadros máximos de adelanto al extrapolar el estado del servidor
    };

    const lerp = (a, b, t) => a + (b - a) * t;
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

    // ------------------------------------------------------------------
    // Mezcla de dos snapshots (A anterior, B posterior) con t en [0, 1]
    // ------------------------------------------------------------------
    function mezclarJugador(a, b, t, base) {
        const j = Object.assign({}, base);
        const salto = Math.hypot(num(b.x) - num(a.x), num(b.y) - num(a.y));
        if (salto <= NET.SALTO_JUGADOR) {
            j.x = lerp(num(a.x), num(b.x), t);
            j.y = lerp(num(a.y), num(b.y), t);
            j.vx = lerp(num(a.vx), num(b.vx), t);
            j.vy = lerp(num(a.vy), num(b.vy), t);
            const dx = lerp(num(a.dirX), num(b.dirX), t), dy = lerp(num(a.dirY), num(b.dirY), t);
            const m = Math.hypot(dx, dy);
            if (m > 0.05) { j.dirX = dx / m; j.dirY = dy / m; }
        }
        return j;
    }

    function mezclarPelota(a, b, t) {
        const base = t >= 0.5 ? b : a;
        const p = Object.assign({}, base);
        const salto = Math.hypot(num(b.x) - num(a.x), num(b.y) - num(a.y));
        if (salto <= NET.SALTO_PELOTA) {
            p.x = lerp(num(a.x), num(b.x), t);
            p.y = lerp(num(a.y), num(b.y), t);
            p.z = lerp(num(a.z), num(b.z), t);
            p.vx = lerp(num(a.vx), num(b.vx), t);
            p.vy = lerp(num(a.vy), num(b.vy), t);
        }
        return p;
    }

    function mezclar(A, B, t) {
        const base = t >= 0.5 ? B : A;            // campos discretos (estado, marcador, flags): del snapshot más cercano
        const out = Object.assign({}, base);
        if (A.pelota && B.pelota) out.pelota = mezclarPelota(A.pelota, B.pelota, t);
        if (Array.isArray(A.jugadores) && Array.isArray(B.jugadores) && A.jugadores.length === B.jugadores.length) {
            out.jugadores = B.jugadores.map((jb, i) => mezclarJugador(A.jugadores[i], jb, t, base.jugadores[i]));
        }
        return out;
    }

    // Último snapshot empujado 'ms' hacia adelante con las velocidades (solo posiciones, nunca estados).
    function extrapolar(S, ms) {
        const cuadros = Math.min(ms, NET.EXTRAPOLAR_MAX_MS) / MS_POR_TICK;
        const out = Object.assign({}, S.data);
        if (S.data.pelota) {
            const p = Object.assign({}, S.data.pelota);
            p.x = num(p.x) + num(p.vx) * cuadros;
            p.y = num(p.y) + num(p.vy) * cuadros;
            out.pelota = p;
        }
        if (Array.isArray(S.data.jugadores)) {
            out.jugadores = S.data.jugadores.map((j) => Object.assign({}, j, {
                x: num(j.x) + num(j.vx) * cuadros,
                y: num(j.y) + num(j.vy) * cuadros,
            }));
        }
        return out;
    }

    // ------------------------------------------------------------------
    // Buffer de snapshots
    // ------------------------------------------------------------------
    class SnapshotBuffer {
        constructor(opts = {}) {
            this.delayMs = num(opts.delayMs, NET.INTERP_MS);
            this.maxSnaps = 40;
            this.reset();
        }

        reset() {
            this.snaps = [];
            this.offset = null;      // reloj_local − reloj_servidor (ms), con filtro de mínimo para seguir la mejor latencia
            this.ultimaRecepcion = 0;
        }

        push(data, nowMs) {
            if (!data) return;
            const tick = num(data.tick, 0);
            const last = this.snaps[this.snaps.length - 1];
            if (last && tick === last.tick) return;                 // repetido
            if (last && tick < last.tick - 5) this.reset();         // el reloj del servidor retrocedió: partido nuevo
            const ms = tick * MS_POR_TICK;
            const muestra = nowMs - ms;
            if (this.offset === null) this.offset = muestra;
            else if (muestra < this.offset) this.offset += (muestra - this.offset) * 0.5;   // llegó antes: lo sigo rápido
            else this.offset += (muestra - this.offset) * 0.02;                              // llegó tarde (jitter): subo despacio
            this.snaps.push({ tick, ms, recv: nowMs, data });
            this.ultimaRecepcion = nowMs;
            while (this.snaps.length > this.maxSnaps) this.snaps.shift();
        }

        ultimo() {
            const s = this.snaps[this.snaps.length - 1];
            return s ? s.data : null;
        }

        // Snapshot interpolado para el instante 'nowMs' (con el retraso de dibujo). null si todavía no hay nada.
        sample(nowMs) {
            const n = this.snaps.length;
            if (!n) return null;
            if (n === 1 || this.offset === null) return this.snaps[n - 1].data;
            const r = nowMs - this.offset - this.delayMs;           // instante del servidor que toca dibujar
            const primero = this.snaps[0], ultimo = this.snaps[n - 1];
            if (r <= primero.ms) return primero.data;
            if (r >= ultimo.ms) return extrapolar(ultimo, r - ultimo.ms);
            let i = n - 1;
            while (i > 0 && this.snaps[i - 1].ms >= r) i--;
            const a = this.snaps[i - 1], b = this.snaps[i];
            const span = b.ms - a.ms;
            return mezclar(a.data, b.data, span > 0 ? (r - a.ms) / span : 1);
        }
    }

    // ------------------------------------------------------------------
    // Predicción del jugador propio
    // ------------------------------------------------------------------
    class OwnPredictor {
        constructor() { this.reset(); }

        reset() {
            this.sombra = null;
            this.clave = null;
            this.dx = 0;        // desplazamiento (predicho − servidor) que se le aplica a la pelota mientras la llevo
            this.dy = 0;
            this.predice = false;
        }

        /**
         * yo      : Jugador "vista" ya cargado con el snapshot interpolado (se modifica pos / vel / facing).
         * ctx     : { keys, dt, activo, servidor:{x,y,vx,vy}|null, edadMs, rttMs, crearSombra(yo) }
         * Devuelve true si el jugador quedó en la posición predicha.
         */
        actualizar(yo, ctx) {
            if (!yo) { this.reset(); return false; }
            if (!this.sombra || this.clave !== yo) {
                this.sombra = ctx.crearSombra(yo);
                this.clave = yo;
                this._copiar(this.sombra, yo);
                this.dx = this.dy = 0;
            }
            const s = this.sombra;
            const ix = yo.pos.x, iy = yo.pos.y;

            const quieto = !ctx.activo || yo.hitStun > 0 || yo.isSliding || yo.slideTimer > 0 || yo.frozen;
            s.stamina = yo.stamina;
            s.hasBall = yo.hasBall;
            s.hitSlow = yo.hitSlow;
            s.isSliding = false;

            if (quieto || !ctx.servidor) {
                // Sin predicción: choque, barrida, festejo, saque… manda el servidor.
                this._copiar(s, yo);
                this.predice = false;
                this._decaer();
                return false;
            }

            s.keys = ctx.keys;
            s._updateMovement(ctx.dt);
            s._clampToField();

            // El snapshot más nuevo llega con retraso (edad + ida y vuelta): se lo adelanta con su velocidad para comparar.
            const cuadros = Math.min(NET.PRED_MAX_ADELANTO, (num(ctx.edadMs) + num(ctx.rttMs)) / MS_POR_TICK);
            const tx = num(ctx.servidor.x) + num(ctx.servidor.vx) * cuadros;
            const ty = num(ctx.servidor.y) + num(ctx.servidor.vy) * cuadros;
            const ex = tx - s.pos.x, ey = ty - s.pos.y;
            const err = Math.hypot(ex, ey);
            if (err > NET.PRED_SNAP) {
                s.pos.set(tx, ty);
                s.vel.set(num(ctx.servidor.vx), num(ctx.servidor.vy));
            } else if (err > NET.PRED_ZONA_MUERTA) {
                s.pos.x += ex * NET.PRED_CORRECCION;
                s.pos.y += ey * NET.PRED_CORRECCION;
            }

            yo.pos.set(s.pos.x, s.pos.y);
            yo.vel.set(s.vel.x, s.vel.y);
            yo.facing.set(s.facing.x, s.facing.y);
            yo.sprinting = !!s.sprinting;
            this.predice = true;

            if (yo.hasBall) { this.dx = yo.pos.x - ix; this.dy = yo.pos.y - iy; }
            else this._decaer();
            return true;
        }

        _decaer() { this.dx *= 0.85; this.dy *= 0.85; if (Math.abs(this.dx) < 0.05) this.dx = 0; if (Math.abs(this.dy) < 0.05) this.dy = 0; }

        _copiar(s, yo) {
            s.pos.set(yo.pos.x, yo.pos.y);
            s.vel.set(yo.vel.x, yo.vel.y);
            s.facing.set(yo.facing.x, yo.facing.y);
        }

        // Cuánto hay que mover la pelota (en pantalla) para que siga pegada al jugador predicho.
        offsetPelota() { return { x: this.dx, y: this.dy }; }
    }

    const API = { NET, SnapshotBuffer, OwnPredictor, mezclar, extrapolar, SERVER_HZ, MS_POR_TICK };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.NetSync = API;
})(typeof window !== 'undefined' ? window : globalThis);

// ESM bridge
export const NetSync = globalThis.NetSync;

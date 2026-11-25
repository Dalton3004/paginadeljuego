/**
 * ETAPA 3 — Sistema de Replay de Goles (buffer temporal, multi-gol, interpolación y cámara).
 *
 * Totalmente desacoplado de la simulación real: graba copias inmutables de snapshots
 * visuales y los reproduce con seguimiento de pelota, zoom progresivo, pausa breve
 * de impacto, cámara lenta opcional y transiciones suaves de entrada/salida.
 */

function clonarJugador(j) {
    return { ...j };
}

function clonar(snap) {
    return {
        t: snap.t,
        pelota: { ...snap.pelota },
        jugadores: Array.isArray(snap.jugadores)
            ? snap.jugadores.map(clonarJugador)
            : [...snap.jugadores].map(([id, j]) => ({ id, x: j.x, y: j.y, lado: j.lado })),
    };
}

function lerp(a, b, k) {
    return a + (b - a) * k;
}

function interpolarFrame(a, b, alpha) {
    if (!b || alpha <= 0) return a;
    if (alpha >= 1) return b;
    const pelota = {
        ...b.pelota,
        x: lerp(a.pelota.x, b.pelota.x, alpha),
        y: lerp(a.pelota.y, b.pelota.y, alpha),
        z: lerp(a.pelota.z || 0, b.pelota.z || 0, alpha),
    };
    const jugadores = a.jugadores.map((ja, i) => {
        const jb = b.jugadores[i];
        if (!jb) return ja;
        return {
            ...jb,
            x: lerp(ja.x, jb.x, alpha),
            y: lerp(ja.y, jb.y, alpha),
        };
    });
    return {
        t: lerp(a.t, b.t, alpha),
        pelota,
        jugadores,
    };
}

export class CamaraReplay {
    constructor({ width = 480, height = 640, zoomBase = 1.16, zoomGol = 1.38 } = {}) {
        this.width = width;
        this.height = height;
        this.zoomBase = zoomBase;
        this.zoomGol = zoomGol;
        this.reset();
    }

    reset(x = this.width / 2, y = this.height / 2) {
        this.x = x;
        this.y = y;
        this.zoom = this.zoomBase;
        this._inicializada = false;
    }

    /**
     * Actualiza foco y zoom siguiendo la pelota y encuadrando dentro de [0..width, 0..height].
     */
    actualizar(frame, { dt = 1 / 60, momentoGolT = null, duracion = 1, cursor = 0 } = {}) {
        const bx = frame && frame.pelota && Number.isFinite(frame.pelota.x) ? frame.pelota.x : this.width / 2;
        const by = frame && frame.pelota && Number.isFinite(frame.pelota.y) ? frame.pelota.y : this.height / 2;

        if (!this._inicializada) {
            this.x = bx;
            this.y = by;
            this.zoom = this.zoomBase;
            this._inicializada = true;
        } else {
            const kSeguir = 1 - Math.exp(-8.5 * Math.max(0.001, dt));
            this.x = lerp(this.x, bx, kSeguir);
            this.y = lerp(this.y, by, kSeguir);
        }

        // Zoom más cercano a medida que se aproxima al gol o a los arcos
        let cercaniaGol = 0;
        if (momentoGolT != null && frame && Number.isFinite(frame.t)) {
            const falta = Math.abs(momentoGolT - frame.t);
            cercaniaGol = Math.max(0, Math.min(1, 1 - falta / 1.6));
        } else if (duracion > 0) {
            cercaniaGol = Math.max(0, Math.min(1, (cursor / duracion - 0.45) / 0.55));
        }
        const cercaArco = by < 165 || by > this.height - 165 ? 0.25 : 0;
        const zoomObjetivo = Math.min(
            this.zoomGol + 0.06,
            lerp(this.zoomBase, this.zoomGol, Math.min(1, cercaniaGol + cercaArco * 0.5))
        );
        const kZoom = 1 - Math.exp(-5.5 * Math.max(0.001, dt));
        this.zoom = lerp(this.zoom, zoomObjetivo, kZoom);

        // Limitar el centro de cámara para no mostrar área vacía fuera del estadio
        const halfVisW = this.width / (2 * this.zoom);
        const halfVisH = this.height / (2 * this.zoom);
        const clampedX = Math.max(halfVisW, Math.min(this.width - halfVisW, this.x));
        const clampedY = Math.max(halfVisH, Math.min(this.height - halfVisH, this.y));

        return {
            cx: clampedX,
            cy: clampedY,
            zoom: this.zoom,
            // Transformación lista para canvas: translate(W/2, H/2) -> scale(z,z) -> translate(-cx,-cy)
            offsetX: this.width / 2 - clampedX * this.zoom,
            offsetY: this.height / 2 - clampedY * this.zoom,
        };
    }
}

export class Replay {
    constructor({ duracionSeg = 5, hz = 30, maxGoles = 16 } = {}) {
        this.duracionSeg = duracionSeg;
        this.hz = hz;
        this.maxFrames = Math.ceil(duracionSeg * hz) + 2;
        this.maxGoles = maxGoles;
        this.camara = new CamaraReplay();
        this.reiniciar();
    }

    reiniciar() {
        this.buffer = [];
        this.clip = null; // copia congelada del gol activo
        this.metaActual = null;
        this.goles = []; // archivo de todos los goles capturados en el partido
        this.indiceGolActual = -1;
        this.cursor = 0; // segundos dentro del clip
        this.reproduciendo = false;
        this.velocidad = 1; // 1 = normal, 0.5 = cámara lenta
        this.camaraLentaAuto = true;
        this._pausaImpactoRestante = 0;
        this._pausaImpactoAplicada = false;
        this._transicionEntrada = 0;
        this.camara.reset();
    }

    /** Guarda un snapshot (clonado para que mutaciones posteriores no alteren el replay). */
    grabar(snap) {
        if (!snap || !snap.pelota) return;
        const f = clonar(snap);
        this.buffer.push(f);
        const minT = f.t - this.duracionSeg;
        while (
            this.buffer.length > this.maxFrames ||
            (this.buffer.length > 1 && this.buffer[0].t < minT)
        ) {
            this.buffer.shift();
        }
    }

    /**
     * Extiende brevemente el último gol capturado con unos cuadros posteriores
     * (pelota entrando en la red) sin exceder `colaMaxSeg`.
     */
    agregarColaGol(snap, colaMaxSeg = 0.45) {
        if (!snap || !this.goles.length) return false;
        const ult = this.goles[this.goles.length - 1];
        if (!ult || !ult.clip || !ult.clip.length) return false;
        if (snap.t - ult.momentoGolT > colaMaxSeg) return false;
        const f = clonar(snap);
        ult.clip.push(f);
        if (this.clip && this.indiceGolActual === ult.indice) {
            this.clip.push(clonar(f));
        }
        return true;
    }

    /** Congela los últimos ~5 s para reproducirlos tras un gol y lo archiva para el post-partido. */
    capturarGol(meta = null) {
        if (!this.buffer.length) return false;
        const copia = this.buffer.map(clonar);
        const momentoGolT = copia[copia.length - 1].t;
        const entrada = {
            indice: this.goles.length,
            momentoGolT,
            meta: meta ? { ...meta } : null,
            clip: copia,
        };
        if (this.goles.length < this.maxGoles) {
            this.goles.push(entrada);
        }
        this.indiceGolActual = entrada.indice;
        this.clip = copia.map(clonar);
        this.metaActual = entrada.meta;
        this.cursor = 0;
        this.reproduciendo = true;
        this._pausaImpactoRestante = 0;
        this._pausaImpactoAplicada = false;
        this._transicionEntrada = 0.22;
        const f0 = this.clip[0];
        this.camara.reset(f0.pelota.x, f0.pelota.y);
        return true;
    }

    /** Selecciona un gol archivado para reproducirlo (por ejemplo desde el post-partido). */
    reproducirGol(indice = 0, { velocidad = 1, camaraLentaAuto = true } = {}) {
        const g = this.goles[indice];
        if (!g || !g.clip || !g.clip.length) return false;
        this.indiceGolActual = indice;
        this.clip = g.clip.map(clonar);
        this.metaActual = g.meta ? { ...g.meta } : null;
        this.cursor = 0;
        this.velocidad = velocidad > 0 ? velocidad : 1;
        this.camaraLentaAuto = !!camaraLentaAuto;
        this.reproduciendo = true;
        this._pausaImpactoRestante = 0;
        this._pausaImpactoAplicada = false;
        this._transicionEntrada = 0.22;
        const f0 = this.clip[0];
        this.camara.reset(f0.pelota.x, f0.pelota.y);
        return true;
    }

    duracionClip() {
        if (!this.clip || this.clip.length < 2) return 0;
        return Math.max(0, this.clip[this.clip.length - 1].t - this.clip[0].t);
    }

    /** Avance clásico compatible con tests unitarios previos. */
    avanzar(dt) {
        if (!this.reproduciendo || !this.clip) return null;
        this.cursor += dt;
        const dur = this.clip[this.clip.length - 1].t - this.clip[0].t;
        if (this.cursor >= dur) {
            this.reproduciendo = false;
            return this.clip[this.clip.length - 1];
        }
        const objetivo = this.clip[0].t + this.cursor;
        return this.clip.find((f) => f.t >= objetivo) || this.clip[this.clip.length - 1];
    }

    /**
     * Avance enriquecido para render real: interpolación sub-cuadro, pausa breve en el impacto
     * del gol, cámara lenta opcional y encuadre de cámara con zoom.
     */
    avanzarConCamara(dt) {
        if (!this.reproduciendo || !this.clip || !this.clip.length) return null;
        const dur = this.duracionClip();
        const t0 = this.clip[0].t;
        const entradaGol = this.goles[this.indiceGolActual];
        const momentoGolT = entradaGol ? entradaGol.momentoGolT : t0 + dur;

        if (this._transicionEntrada > 0) {
            this._transicionEntrada = Math.max(0, this._transicionEntrada - dt);
        }

        let enPausaImpacto = false;
        let escalaVel = this.velocidad;

        if (this._pausaImpactoRestante > 0) {
            this._pausaImpactoRestante = Math.max(0, this._pausaImpactoRestante - dt);
            enPausaImpacto = true;
            escalaVel = 0;
        } else {
            const tActual = t0 + this.cursor;
            // Cámara lenta automática suave en el tramo final previo al gol
            if (this.camaraLentaAuto && this.velocidad === 1 && momentoGolT - tActual <= 0.85 && momentoGolT - tActual >= -0.25) {
                escalaVel = 0.52;
            }
            const tNuevo = tActual + dt * escalaVel;
            if (!this._pausaImpactoAplicada && tActual < momentoGolT && tNuevo >= momentoGolT && dur > 0.4) {
                this._pausaImpactoAplicada = true;
                this._pausaImpactoRestante = 0.14; // breve congelamiento dramático al cruzar la línea
                this.cursor = Math.max(0, momentoGolT - t0);
                enPausaImpacto = true;
            } else {
                this.cursor += dt * escalaVel;
            }
        }

        if (dur <= 0 || this.cursor >= dur) {
            this.cursor = dur;
            this.reproduciendo = false;
            const ultimo = this.clip[this.clip.length - 1];
            const cam = this.camara.actualizar(ultimo, { dt, momentoGolT, duracion: dur, cursor: dur });
            return {
                frame: ultimo,
                camara: cam,
                progreso: 1,
                enCamaraLenta: escalaVel < 0.9,
                enPausaImpacto: false,
                transicionAlpha: 0,
                finalizado: true,
            };
        }

        const objetivo = t0 + this.cursor;
        let idx = 0;
        while (idx < this.clip.length - 2 && this.clip[idx + 1].t < objetivo) {
            idx++;
        }
        const a = this.clip[idx];
        const b = this.clip[idx + 1] || a;
        const span = b.t - a.t;
        const alpha = span > 1e-5 ? Math.max(0, Math.min(1, (objetivo - a.t) / span)) : 0;
        const frame = interpolarFrame(a, b, alpha);
        const cam = this.camara.actualizar(frame, { dt, momentoGolT, duracion: dur, cursor: this.cursor });

        // Transición suave al entrar y salir
        const fadeEntrada = this._transicionEntrada / 0.22;
        const faltaSalida = dur - this.cursor;
        const fadeSalida = faltaSalida < 0.2 ? (0.2 - faltaSalida) / 0.2 : 0;

        return {
            frame,
            camara: cam,
            progreso: dur > 0 ? Math.max(0, Math.min(1, this.cursor / dur)) : 1,
            enCamaraLenta: !enPausaImpacto && escalaVel < 0.9,
            enPausaImpacto,
            transicionAlpha: Math.max(fadeEntrada, fadeSalida * 0.65),
            finalizado: false,
        };
    }

    alternarVelocidad() {
        this.velocidad = this.velocidad < 0.9 ? 1 : 0.5;
        return this.velocidad;
    }

    saltar() {
        this.reproduciendo = false;
        this._pausaImpactoRestante = 0;
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.Replay = Replay;
    globalThis.CamaraReplay = CamaraReplay;
}

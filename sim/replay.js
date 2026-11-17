/**
 * Replay del gol (F8 8.6): buffer circular de los últimos ~5 s de snapshots.
 * Se alimenta con los snapshots que el servidor YA manda (cero tráfico extra) y nunca toca la simulación.
 * Módulo listo para usar desde el cliente: grabar(snapshot) en cada estado_juego, capturarGol() al gol y
 * avanzar(dt) para reproducir. Todavía no está dibujado en pantalla (hay que conectarlo a render_world.js).
 */
function clonar(snap) {
    return {
        t: snap.t,
        pelota: { ...snap.pelota },
        jugadores: Array.isArray(snap.jugadores)
            ? snap.jugadores.map((j) => ({ ...j }))
            : [...snap.jugadores].map(([id, j]) => ({ id, x: j.x, y: j.y, lado: j.lado })),
    };
}

export class Replay {
    constructor({ duracionSeg = 5, hz = 30 } = {}) {
        this.duracionSeg = duracionSeg;
        this.maxFrames = Math.ceil(duracionSeg * hz) + 2;
        this.buffer = [];
        this.clip = null; // copia congelada al momento del gol
        this.cursor = 0; // segundos dentro del clip
        this.reproduciendo = false;
    }
    /** Guarda un snapshot (clonado para que mutaciones posteriores no alteren el replay). */
    grabar(snap) {
        const f = clonar(snap);
        this.buffer.push(f);
        const minT = f.t - this.duracionSeg;
        while (this.buffer.length > this.maxFrames || (this.buffer.length > 1 && this.buffer[0].t < minT)) this.buffer.shift();
    }
    /** Congela los últimos ~5 s para reproducirlos tras un gol. */
    capturarGol() {
        if (!this.buffer.length) return false;
        this.clip = this.buffer.map(clonar);
        this.cursor = 0;
        this.reproduciendo = true;
        return true;
    }
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
    saltar() {
        this.reproduciendo = false;
    }
}

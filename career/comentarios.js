/**
 * ETAPA 25 — RADIO / COMENTARIOS TEXTUALES CONTEXTUALES.
 *
 * Dispara frases cortas con identidad Chaquito por eventos reales del partido:
 *   - atajadas ("¡QUÉ ATAJADA!")
 *   - palos y travesaños ("¡AL TRAVESAÑO!")
 *   - ataques peligrosos ("¡SE VIENE LA RETONETA!")
 *   - goles y golazos ("¡QUÉ GOLAZO!")
 *   - tramos decisivos ("¡MINUTO 89!")
 *   - barridas salvadoras ("¡CRUCE SALVADOR!")
 *
 * ANTI-SATURACIÓN:
 * - Cooldown global entre comentarios comunes y prioridad inmediata solo para goles/palos/final.
 * - Evita repetir la misma frase seguida.
 *
 * PREPARADO PARA AUDIO FUTURO:
 * Cada comentario emitido incluye `{ id, categoria, texto, audioKey, prioridad, duracion }`.
 * Un reproductor futuro puede mapear `audioKey` a un banco de voces sin tocar el motor.
 */

const PLANTILLAS_RADIO = {
    golazo: [
        { id: 'golazo_1', texto: '¡QUÉ GOLAZO DE {EQUIPO}!', audioKey: 'vox_golazo_1' },
        { id: 'golazo_2', texto: '¡GOLAZO AL ÁNGULO! ¡LO GRITA {AUTOR}!', audioKey: 'vox_golazo_2' },
    ],
    gol_agonico: [
        { id: 'gol_ago_1', texto: '¡GOL AGÓNICO DE {AUTOR}! ¡SE CAE EL ESTADIO!', audioKey: 'vox_gol_agonico_1' },
        { id: 'gol_ago_2', texto: '¡EN EL FINAL! ¡LO HIZO {EQUIPO}!', audioKey: 'vox_gol_agonico_2' },
    ],
    gol: [
        { id: 'gol_1', texto: '¡GOOOL DE {EQUIPO}! ¡{AUTOR} LA MANDÓ A GUARDAR!', audioKey: 'vox_gol_1' },
        { id: 'gol_2', texto: '¡GOL CHAQUITO! ¡APARECIÓ {AUTOR}!', audioKey: 'vox_gol_2' },
    ],
    travesano: [
        { id: 'palo_1', texto: '¡AL TRAVESAÑO! ¡SE SALVÓ EL ARCO!', audioKey: 'vox_travesano_1' },
        { id: 'palo_2', texto: '¡TEMBLÓ EL PALO! ¡ERA UN GOLAZO!', audioKey: 'vox_palo_1' },
    ],
    atajada: [
        { id: 'ataj_1', texto: '¡QUÉ ATAJADA MONUMENTAL DE {AUTOR}!', audioKey: 'vox_atajada_1' },
        { id: 'ataj_2', texto: '¡VOLÓ EL ARQUERO! ¡QUÉ ATAJADA!', audioKey: 'vox_atajada_2' },
    ],
    ataque_equipo: [
        { id: 'atq_1', texto: '¡SE VIENE {EQUIPO}!', audioKey: 'vox_ataque_equipo_1' },
        { id: 'atq_2', texto: '¡CARGA {EQUIPO} CON TODO AL ÁREA!', audioKey: 'vox_ataque_equipo_2' },
    ],
    barrida: [
        { id: 'bar_1', texto: '¡CRUCE SALVADOR EN EL PISO!', audioKey: 'vox_barrida_1' },
        { id: 'bar_2', texto: '¡QUÉ QUITE LIMPIO DE {AUTOR}!', audioKey: 'vox_barrida_2' },
    ],
    minuto_89: [
        { id: 'min89_1', texto: '¡MINUTO 89! ¡FINAL NO APTO PARA CARDÍACOS!', audioKey: 'vox_min89_1' },
        { id: 'min89_2', texto: '¡ÚLTIMOS SEGUNDOS! ¡CADA PELOTA VALE ORO!', audioKey: 'vox_min89_2' },
    ],
    arcade_evento: [
        { id: 'arc_ev_1', texto: '⚡ ¡REGLA ARCADE ACTIVA: {DETALLE}!', audioKey: 'vox_arcade_evento' },
    ],
};

function formatearTexto(plantilla, vars = {}) {
    return String(plantilla || '')
        .replace(/\{EQUIPO\}/g, String(vars.equipo || 'EL EQUIPO').toUpperCase())
        .replace(/\{AUTOR\}/g, String(vars.autor || 'EL 9').toUpperCase())
        .replace(/\{DETALLE\}/g, String(vars.detalle || '').toUpperCase());
}

export class ControladorComentarios {
    constructor({
        nombreLocal = 'LA RETONETA',
        nombreRival = 'RIVAL',
        cooldownNormal = 5.5,
        onAudioHook = null,
    } = {}) {
        this.nombreLocal = String(nombreLocal || 'LOCAL').toUpperCase();
        this.nombreRival = String(nombreRival || 'RIVAL').toUpperCase();
        this.cooldownNormal = Math.max(2.0, Number(cooldownNormal) || 5.5);
        this.onAudioHook = typeof onAudioHook === 'function' ? onAudioHook : null;

        this.actual = null; // { id, categoria, texto, audioKey, prioridad, timer, duracion }
        this._cooldown = 0;
        this._eventosLeidos = 0;
        this._avisoMinuto89 = false;
        this._ultimoId = '';
        this._ataqueCooldown = 0;
        this.historial = [];
    }

    _elegirPlantilla(categoria) {
        const lista = PLANTILLAS_RADIO[categoria] || PLANTILLAS_RADIO.gol;
        if (lista.length === 1) return lista[0];
        const candidatas = lista.filter((x) => x.id !== this._ultimoId);
        const pick = candidatas[this.historial.length % candidatas.length] || lista[0];
        return pick;
    }

    disparar(categoria, { vars = {}, prioridad = 1, duracion = 2.6, forzar = false } = {}) {
        if (!forzar && prioridad <= 1 && this._cooldown > 0) return null;
        if (this.actual && this.actual.timer > 0.3 && prioridad < this.actual.prioridad && !forzar) {
            return null;
        }

        const tpl = this._elegirPlantilla(categoria);
        const item = {
            id: tpl.id,
            categoria,
            texto: formatearTexto(tpl.texto, vars),
            audioKey: tpl.audioKey,
            prioridad,
            duracion,
            timer: duracion,
        };
        this._ultimoId = tpl.id;
        this.actual = item;
        this._cooldown = prioridad >= 2 ? 2.4 : this.cooldownNormal;
        this.historial.push({ categoria, texto: item.texto, audioKey: item.audioKey });
        if (this.historial.length > 30) this.historial.shift();

        if (this.onAudioHook) {
            try {
                this.onAudioHook(item);
            } catch (_e) {
                /* hook de audio futuro opcional */
            }
        }
        return item;
    }

    /**
     * Procesa un tick real del partido y detecta eventos nuevos sin saturar.
     */
    actualizar(
        dt,
        {
            enJuego = true,
            segundosRestantes = 60,
            golesLocal = 0,
            golesRival = 0,
            woodwork = null, // { arco, tipo } si rebotó en palo/travesaño
            ball = null,
            statsEventos = [],
        } = {}
    ) {
        const step = Math.max(0, Number(dt) || 0);
        if (this._cooldown > 0) this._cooldown = Math.max(0, this._cooldown - step);
        if (this._ataqueCooldown > 0) this._ataqueCooldown = Math.max(0, this._ataqueCooldown - step);
        if (this.actual) {
            this.actual.timer -= step;
            if (this.actual.timer <= 0) this.actual = null;
        }

        // 1) Palo o travesaño detectado en el frame
        if (woodwork) {
            this.disparar('travesano', { prioridad: 2, duracion: 2.5 });
        }

        // 2) Eventos reales registrados en MatchStats (goles, atajadas, barridas)
        if (Array.isArray(statsEventos) && statsEventos.length < this._eventosLeidos) {
            this._eventosLeidos = 0;
        }
        while (Array.isArray(statsEventos) && this._eventosLeidos < statsEventos.length) {
            const ev = statsEventos[this._eventosLeidos++];
            if (!ev) continue;
            const eqNom = ev.team === 'rival' ? this.nombreRival : this.nombreLocal;
            if (ev.tipo === 'gol') {
                const esAgonico = Number(segundosRestantes) <= 14 || Number(ev.minuto) >= 85;
                const diff = Math.abs(golesLocal - golesRival);
                const cat = esAgonico ? 'gol_agonico' : diff >= 2 ? 'golazo' : 'gol';
                this.disparar(cat, {
                    vars: { equipo: eqNom, autor: ev.nombre || eqNom },
                    prioridad: 3,
                    duracion: 3.1,
                    forzar: true,
                });
            } else if (ev.tipo === 'atajada') {
                this.disparar('atajada', {
                    vars: { equipo: eqNom, autor: ev.nombre || 'EL ARQUERO' },
                    prioridad: 2,
                    duracion: 2.4,
                });
            } else if (ev.tipo === 'barrida') {
                this.disparar('barrida', {
                    vars: { equipo: eqNom, autor: ev.nombre || eqNom },
                    prioridad: 1,
                    duracion: 2.0,
                });
            }
        }

        if (!enJuego) return this.actual;

        // 3) "¡MINUTO 89!" en cierre apretado (1 sola vez por partido, sin pisar un gol recién gritado)
        if (
            !this._avisoMinuto89 &&
            segundosRestantes <= 10 &&
            segundosRestantes > 1 &&
            Math.abs(golesLocal - golesRival) <= 1 &&
            !(this.actual && this.actual.prioridad >= 3)
        ) {
            this._avisoMinuto89 = true;
            this.disparar('minuto_89', { prioridad: 2, duracion: 2.8, forzar: true });
            return this.actual;
        }

        // 4) "¡SE VIENE LA RETONETA!" cuando un jugador conduce con velocidad al tercio ofensivo
        if (ball && ball.owner && this._ataqueCooldown <= 0 && this._cooldown <= 0) {
            const dueno = ball.owner;
            const sp = dueno.vel ? Math.hypot(dueno.vel.x, dueno.vel.y) : 0;
            const atacaNorte = dueno.team === 'local' && dueno.pos && dueno.pos.y < 235 && sp > 2.2;
            const atacaSur = dueno.team === 'rival' && dueno.pos && dueno.pos.y > 405 && sp > 2.2;
            if (atacaNorte || atacaSur) {
                this._ataqueCooldown = 14;
                const eqNom = dueno.team === 'local' ? this.nombreLocal : this.nombreRival;
                this.disparar('ataque_equipo', {
                    vars: { equipo: eqNom },
                    prioridad: 1,
                    duracion: 2.2,
                });
            }
        }

        return this.actual;
    }
}

/**
 * ETAPA 20 — MODO CHAQUITO ARCADE.
 *
 * Modo experimental y festivo SEPARADO de las competiciones oficiales:
 * jamás altera tablas, copas, rachas oficiales ni récords de Liga/Copa/Supercopa.
 *
 * Reglas especiales configurables:
 *   - duracionSeg: 45 | 60 | 90 (partidos cortos o estándar)
 *   - velocidadJuego: 'normal' | 'turbo' | 'relampago'
 *   - pelotaRapida: boolean (potencia y rebote recargados)
 *   - golDoble: boolean (todos los goles valen x2)
 *   - golesEspeciales: 'normal' | 'larga_distancia' | 'gol_de_oro'
 *   - eventosTemporales: boolean (ruleta de eventos cada 16s en cancha)
 *   - modoFuria: boolean (sprint infinito y barridas recargadas)
 */

export const PRESETS_ARCADE = [
    {
        id: 'fiesta_chaquito',
        nombre: '🎉 FIESTA CHAQUITO',
        desc: 'Partido ágil de 60s con eventos sorpresa cada 16 segundos y golazos desde lejos x2.',
        reglas: {
            duracionSeg: 60,
            velocidadJuego: 'turbo',
            pelotaRapida: true,
            golDoble: false,
            golesEspeciales: 'larga_distancia',
            eventosTemporales: true,
            modoFuria: false,
        },
    },
    {
        id: 'furia_total',
        nombre: '🔥 MODO FURIA TOTAL',
        desc: '45 segundos a toda máquina: velocidad relámpago, sprint inagotable y goles dobles.',
        reglas: {
            duracionSeg: 45,
            velocidadJuego: 'relampago',
            pelotaRapida: true,
            golDoble: true,
            golesEspeciales: 'normal',
            eventosTemporales: true,
            modoFuria: true,
        },
    },
    {
        id: 'gol_de_oro',
        nombre: '⚡ GOL DE ORO',
        desc: 'Tensión pura: pelota rapidísima y el primero que la mete gana el partido en el acto.',
        reglas: {
            duracionSeg: 60,
            velocidadJuego: 'turbo',
            pelotaRapida: true,
            golDoble: false,
            golesEspeciales: 'gol_de_oro',
            eventosTemporales: false,
            modoFuria: true,
        },
    },
];

export const EVENTOS_TEMPORALES_ARCADE = [
    {
        id: 'gol_doble_temp',
        etiqueta: '2X ¡GOL DOBLE ACTIVO!',
        duracion: 10,
        color: '#ffcc00',
    },
    {
        id: 'pelota_fuego',
        etiqueta: '☄ ¡PELOTA DE FUEGO!',
        duracion: 10,
        color: '#ff626c',
    },
    {
        id: 'furia_relampago',
        etiqueta: '⚡ ¡SPRINT FURIA SIN FATIGA!',
        duracion: 10,
        color: '#48e078',
    },
];

export function crearReglasArcadeDefault() {
    return { ...PRESETS_ARCADE[0].reglas };
}

export function normalizarReglasArcade(raw) {
    const base = crearReglasArcadeDefault();
    if (!raw || typeof raw !== 'object') return base;
    const dur = [45, 60, 90].includes(Number(raw.duracionSeg)) ? Number(raw.duracionSeg) : 60;
    const vel = ['normal', 'turbo', 'relampago'].includes(raw.velocidadJuego) ? raw.velocidadJuego : 'turbo';
    const esp = ['normal', 'larga_distancia', 'gol_de_oro'].includes(raw.golesEspeciales)
        ? raw.golesEspeciales
        : 'normal';
    return {
        duracionSeg: dur,
        velocidadJuego: vel,
        pelotaRapida: !!raw.pelotaRapida,
        golDoble: !!raw.golDoble,
        golesEspeciales: esp,
        eventosTemporales: !!raw.eventosTemporales,
        modoFuria: !!raw.modoFuria,
    };
}

export function resumirReglasArcade(reglasRaw) {
    const r = normalizarReglasArcade(reglasRaw);
    const chips = [`${r.duracionSeg}s`];
    if (r.velocidadJuego === 'turbo') chips.push('TURBO');
    else if (r.velocidadJuego === 'relampago') chips.push('RELÁMPAGO');
    if (r.pelotaRapida) chips.push('PELOTA RÁPIDA');
    if (r.golDoble) chips.push('GOL X2');
    if (r.golesEspeciales === 'larga_distancia') chips.push('BOMBAZO +1');
    else if (r.golesEspeciales === 'gol_de_oro') chips.push('GOL DE ORO');
    if (r.modoFuria) chips.push('FURIA');
    if (r.eventosTemporales) chips.push('EVENTOS CAOS');
    return chips.join(' · ');
}

/**
 * Controlador en vivo de un partido Chaquito Arcade.
 */
export class ControladorArcade {
    constructor(reglasRaw) {
        this.reglas = normalizarReglasArcade(reglasRaw);
        this.eventoActivo = null; // { id, etiqueta, color, restante }
        this._timerProximoEvento = 12;
        this._indiceEvento = 0;
        this.ultimoBonusTexto = '';
        this._bonusTimer = 0;
        this.terminadoPorGolDeOro = false;
    }

    multiplicadoresActivos() {
        const r = this.reglas;
        const evId = this.eventoActivo && this.eventoActivo.id;

        let dtFactor = r.velocidadJuego === 'relampago' ? 1.32 : r.velocidadJuego === 'turbo' ? 1.18 : 1.0;
        if (evId === 'furia_relampago') dtFactor = Math.min(1.4, dtFactor * 1.1);

        const pelotaPotencia = (r.pelotaRapida ? 1.24 : 1.0) * (evId === 'pelota_fuego' ? 1.22 : 1.0);
        const furiaActiva = !!(r.modoFuria || evId === 'furia_relampago');

        return {
            dtFactor: Math.round(dtFactor * 100) / 100,
            pelotaPotencia: Math.round(pelotaPotencia * 100) / 100,
            furiaActiva,
            golDobleActivo: !!(r.golDoble || evId === 'gol_doble_temp'),
        };
    }

    actualizar(dt, { enJuego = true } = {}) {
        const step = Math.max(0, Number(dt) || 0);
        if (this._bonusTimer > 0) {
            this._bonusTimer = Math.max(0, this._bonusTimer - step);
            if (this._bonusTimer <= 0) this.ultimoBonusTexto = '';
        }
        if (!enJuego) return { nuevoEvento: null };

        if (this.eventoActivo) {
            this.eventoActivo.restante -= step;
            if (this.eventoActivo.restante <= 0) {
                this.eventoActivo = null;
                this._timerProximoEvento = 11;
            }
            return { nuevoEvento: null };
        }

        if (!this.reglas.eventosTemporales) return { nuevoEvento: null };

        this._timerProximoEvento -= step;
        if (this._timerProximoEvento <= 0) {
            const base = EVENTOS_TEMPORALES_ARCADE[this._indiceEvento % EVENTOS_TEMPORALES_ARCADE.length];
            this._indiceEvento += 1;
            this.eventoActivo = {
                ...base,
                restante: base.duracion,
            };
            return { nuevoEvento: this.eventoActivo };
        }
        return { nuevoEvento: null };
    }

    /**
     * Evalúa cuánto vale un gol recién anotado en modo Arcade y si corta el partido (Gol de Oro).
     * Devuelve `{ golesExtra, valorTotal, etiquetaEspecial, finalizarInmediato }`.
     */
    evaluarGol({ equipoAnotador = 'local', posPateadorY = null, mitadCanchaY = 320 } = {}) {
        const m = this.multiplicadoresActivos();
        let valorTotal = 1;
        const razones = [];

        if (m.golDobleActivo) {
            valorTotal *= 2;
            razones.push('GOL DOBLE X2');
        }

        if (this.reglas.golesEspeciales === 'larga_distancia' && Number.isFinite(posPateadorY)) {
            const desdeLejos =
                (equipoAnotador === 'local' && posPateadorY > mitadCanchaY - 35) ||
                (equipoAnotador === 'rival' && posPateadorY < mitadCanchaY + 35);
            if (desdeLejos) {
                valorTotal += 1;
                razones.push('¡BOMBAZO DE LEJOS +1!');
            }
        }

        let finalizarInmediato = false;
        if (this.reglas.golesEspeciales === 'gol_de_oro') {
            finalizarInmediato = true;
            this.terminadoPorGolDeOro = true;
            razones.push('⚡ ¡GOL DE ORO DEFINITORIO!');
        }

        const etiquetaEspecial = razones.join(' · ');
        if (etiquetaEspecial) {
            this.ultimoBonusTexto = etiquetaEspecial;
            this._bonusTimer = 3.2;
        }

        return {
            golesExtra: Math.max(0, valorTotal - 1),
            valorTotal,
            etiquetaEspecial,
            finalizarInmediato,
        };
    }
}

export const ArcadeStore = (() => {
    const KEY = 'chaquito_arcade_v1';
    let mem = { reglas: crearReglasArcadeDefault(), partidos: 0, victorias: 0, golesArcade: 0 };

    function leer() {
        try {
            if (typeof localStorage === 'undefined') return { ...mem, reglas: normalizarReglasArcade(mem.reglas) };
            const raw = localStorage.getItem(KEY);
            const p = raw ? JSON.parse(raw) : {};
            return {
                reglas: normalizarReglasArcade(p.reglas),
                partidos: Math.max(0, parseInt(p.partidos, 10) || 0),
                victorias: Math.max(0, parseInt(p.victorias, 10) || 0),
                golesArcade: Math.max(0, parseInt(p.golesArcade, 10) || 0),
            };
        } catch (_e) {
            return { ...mem, reglas: normalizarReglasArcade(mem.reglas) };
        }
    }

    function escribir(st) {
        const limpio = {
            reglas: normalizarReglasArcade(st && st.reglas),
            partidos: Math.max(0, parseInt(st && st.partidos, 10) || 0),
            victorias: Math.max(0, parseInt(st && st.victorias, 10) || 0),
            golesArcade: Math.max(0, parseInt(st && st.golesArcade, 10) || 0),
        };
        mem = limpio;
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(limpio));
            return true;
        } catch (_e) {
            return false;
        }
    }

    function guardarReglas(reglas) {
        const st = leer();
        st.reglas = normalizarReglasArcade(reglas);
        escribir(st);
        return st.reglas;
    }

    function registrarPartidoArcade({ gano = false, golesMios = 0 } = {}) {
        const st = leer();
        st.partidos += 1;
        if (gano) st.victorias += 1;
        st.golesArcade += Math.max(0, Number(golesMios) || 0);
        escribir(st);
        return st;
    }

    return { leer, escribir, guardarReglas, registrarPartidoArcade };
})();

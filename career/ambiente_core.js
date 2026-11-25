/**
 * FASE C (Etapas 14, 15 y 16) — Lógica pura de Ambiente, Clima, Hinchada Dinámica y Eventos Especiales.
 *
 * Módulo isomórfico sin dependencias del DOM ni de `window`, ejecutable tanto en el cliente como en tests Node.
 */

// ============================================================
// ETAPA 15 — Clima y Variantes de Estadio
// ============================================================
export const CLIMAS_ORDEN = ['auto', 'dia', 'noche', 'lluvia', 'lluvia_intensa', 'niebla'];

export const CLIMAS_CATALOGO = {
    dia: {
        id: 'dia',
        nombre: 'DÍA SOLEADO',
        icono: '☀',
        corto: 'DÍA',
        tintCancha: 'rgba(255, 224, 140, 0.05)',
        gotas: 0,
        reflectores: false,
        niebla: false,
        relampagos: false,
    },
    noche: {
        id: 'noche',
        nombre: 'NOCHE DE ESTADIO',
        icono: '🌙',
        corto: 'NOCHE',
        tintCancha: 'rgba(6, 18, 46, 0.20)',
        gotas: 0,
        reflectores: true,
        niebla: false,
        relampagos: false,
    },
    lluvia: {
        id: 'lluvia',
        nombre: 'LLUVIA',
        icono: '🌧',
        corto: 'LLUVIA',
        tintCancha: 'rgba(14, 34, 62, 0.17)',
        gotas: 42,
        reflectores: true,
        niebla: false,
        relampagos: false,
    },
    lluvia_intensa: {
        id: 'lluvia_intensa',
        nombre: 'TORMENTA INTENSA',
        icono: '⛈',
        corto: 'TORMENTA',
        tintCancha: 'rgba(8, 22, 48, 0.25)',
        gotas: 74,
        reflectores: true,
        niebla: false,
        relampagos: true,
    },
    niebla: {
        id: 'niebla',
        nombre: 'NIEBLA MATINAL',
        icono: '🌫',
        corto: 'NIEBLA',
        tintCancha: 'rgba(195, 214, 235, 0.10)',
        gotas: 0,
        reflectores: false,
        niebla: true,
        relampagos: false,
    },
};

export function elegirClimaPartido({
    preferencia = 'auto',
    esFinal = false,
    esSupercopa = false,
    esClasico = false,
    reduceMotion = false,
    azar = Math.random,
} = {}) {
    if (preferencia && preferencia !== 'auto' && CLIMAS_CATALOGO[preferencia]) {
        if (reduceMotion && preferencia === 'niebla') return CLIMAS_CATALOGO.dia;
        return CLIMAS_CATALOGO[preferencia];
    }

    const r = azar();
    if (esSupercopa || esFinal) {
        return r < 0.8 ? CLIMAS_CATALOGO.noche : CLIMAS_CATALOGO.lluvia;
    }
    if (esClasico) {
        if (r < 0.42) return CLIMAS_CATALOGO.dia;
        if (r < 0.8) return CLIMAS_CATALOGO.noche;
        return CLIMAS_CATALOGO.lluvia;
    }
    if (r < 0.46) return CLIMAS_CATALOGO.dia;
    if (r < 0.76) return CLIMAS_CATALOGO.noche;
    if (r < 0.9) return CLIMAS_CATALOGO.lluvia;
    if (r < 0.96) return CLIMAS_CATALOGO.lluvia_intensa;
    return reduceMotion ? CLIMAS_CATALOGO.dia : CLIMAS_CATALOGO.niebla;
}

// ============================================================
// ETAPA 16 — Estadio y Finales Especiales
// ============================================================
export function clasificarEventoEspecial({
    enLinea = false,
    modoSupercopa = null,
    modoCopa = null,
    modoLiga = null,
    ligaActual = null,
    LigaCoreRef = null,
    rivalidadInfo = null,
    rivalId = '',
} = {}) {
    if (enLinea) {
        return {
            tipo: 'normal',
            esEspecial: false,
            esFinal: false,
            etiqueta: '',
            color: '#ffcc00',
            mostrarTrofeo: false,
        };
    }

    if (modoSupercopa) {
        return {
            tipo: 'supercopa',
            esEspecial: true,
            esFinal: true,
            etiqueta: '★ SUPERCOPA CHAQUITO ★',
            subtitulo: 'GRAN FINAL DE CAMPEONES',
            color: '#ffcc00',
            mostrarTrofeo: true,
            intensidadBaseHinchada: 0.58,
            confetiInicial: true,
        };
    }

    if (modoCopa && modoCopa.esFinal) {
        return {
            tipo: 'final_copa',
            esEspecial: true,
            esFinal: true,
            etiqueta: '🏆 FINAL · COPA CHAQUITO',
            subtitulo: 'A TODO O NADA POR EL TROFEO',
            color: '#ffd43b',
            mostrarTrofeo: true,
            intensidadBaseHinchada: 0.55,
            confetiInicial: true,
        };
    }

    if (modoLiga && ligaActual && LigaCoreRef && typeof LigaCoreRef.tabla === 'function') {
        const totalFechas = (ligaActual.fixture && ligaActual.fixture.length) || 12;
        const fechasRestantes = totalFechas - (ligaActual.fechaActual || 0);
        if (fechasRestantes <= 2 && ligaActual.fechaActual >= Math.max(1, totalFechas - 2)) {
            const t = LigaCoreRef.tabla(ligaActual);
            const liderPts = t[0] ? t[0].pts : 0;
            const idxMio = t.findIndex((r) => r.id === ligaActual.miEquipo);
            const filaMia = idxMio >= 0 ? t[idxMio] : null;
            const idxRiv = t.findIndex((r) => r.id === rivalId);
            const peleaTituloMio = filaMia && idxMio <= 2 && liderPts - filaMia.pts <= 3;
            const dueloDirectoCima = peleaTituloMio && idxRiv >= 0 && idxRiv <= 2;

            if (peleaTituloMio) {
                return {
                    tipo: 'partido_decisivo_liga',
                    esEspecial: true,
                    esFinal: dueloDirectoCima || fechasRestantes === 1,
                    etiqueta: dueloDirectoCima ? '⚡ FINAL ANTICIPADA DE LIGA' : '⚡ DEFINICIÓN DE CAMPEONATO',
                    subtitulo: `FECHA ${(ligaActual.fechaActual || 0) + 1} DE ${totalFechas} · EL TÍTULO EN JUEGO`,
                    color: '#48e078',
                    mostrarTrofeo: fechasRestantes === 1 && idxMio === 0,
                    intensidadBaseHinchada: 0.48,
                    confetiInicial: fechasRestantes === 1,
                };
            }
        }
    }

    if (rivalidadInfo && rivalidadInfo.esClasico && rivalidadInfo.nivel >= 75) {
        return {
            tipo: 'clasico_alta_rivalidad',
            esEspecial: true,
            esFinal: false,
            etiqueta: `🔥 ${rivalidadInfo.etiqueta || 'SUPERCLÁSICO'}`,
            subtitulo: `${rivalidadInfo.textoNivel} · ESTADIO REPLETO`,
            color: '#ff626c',
            mostrarTrofeo: false,
            intensidadBaseHinchada: 0.5,
            confetiInicial: true,
        };
    }

    return {
        tipo: 'normal',
        esEspecial: false,
        esFinal: false,
        etiqueta: '',
        subtitulo: '',
        color: '#ffcc00',
        mostrarTrofeo: false,
        intensidadBaseHinchada: 0.12,
        confetiInicial: false,
    };
}

// ============================================================
// ETAPA 14 — Controlador de Hinchada Dinámica
// ============================================================
export const ESTADOS_HINCHADA = [
    'expectativa',
    'ataque',
    'gol',
    'gol_rival',
    'remontada',
    'tiro_palo',
    'atajada',
    'ultimo_minuto',
    'victoria',
    'derrota',
    'clasico',
    'final',
];

export class ControladorHinchada {
    constructor({ esClasico = false, esFinal = false, intensidadBase = 0.12 } = {}) {
        this.reiniciar({ esClasico, esFinal, intensidadBase });
    }

    reiniciar({ esClasico = false, esFinal = false, intensidadBase = 0.12 } = {}) {
        this.esClasico = !!esClasico;
        this.esFinal = !!esFinal;
        this.intensidadBase = Math.max(0.08, Math.min(0.65, Number(intensidadBase) || 0.12));
        this.estado = esFinal ? 'final' : esClasico ? 'clasico' : 'expectativa';
        this.estadoTimer = esFinal || esClasico ? 2.8 : 0;
        this.volumenMultiplicador = esFinal || esClasico ? 1.22 : 1.0;
        this.estuvoAbajoLocal = false;
        this.ultimoMinutoAnunciado = false;
        this.finAnunciado = false;
        this.eventosProcesados = 0;
        this.ataqueCooldown = 0;
        this.banner = esFinal
            ? { texto: '★ AMBIENTE DE GRAN FINAL ★', color: '#ffcc00', ttl: 2.6 }
            : esClasico
            ? { texto: '🔥 ¡LA TRIBUNA HIERVE EN EL CLÁSICO!', color: '#ff626c', ttl: 2.6 }
            : null;
    }

    _fijarEstado(nuevoEstado, durSeg, multVol, bannerTxt = '', bannerColor = '#ffcc00') {
        this.estado = nuevoEstado;
        this.estadoTimer = durSeg;
        this.volumenMultiplicador = multVol;
        if (bannerTxt) {
            this.banner = { texto: bannerTxt, color: bannerColor, ttl: Math.min(2.4, durSeg) };
        }
    }

    actualizar(
        dt,
        {
            estadoPartido,
            framesRestantes,
            fps = 60,
            golesLocal = 0,
            golesRival = 0,
            ball = null,
            statsEventos = [],
        } = {}
    ) {
        const acciones = [];
        if (this.ataqueCooldown > 0) this.ataqueCooldown -= dt;
        if (this.banner) {
            this.banner.ttl -= dt;
            if (this.banner.ttl <= 0) this.banner = null;
        }

        if (golesRival > golesLocal) {
            this.estuvoAbajoLocal = true;
        }

        if (ball && ball._hitWoodwork) {
            const hw = ball._hitWoodwork;
            ball._hitWoodwork = null;
            const label =
                hw.tipo === 'travesano' ? '¡UUUH! ¡REVENTÓ EL TRAVESAÑO!' : '¡UUUH! ¡DIO EN EL PALO!';
            this._fijarEstado('tiro_palo', 1.8, 1.28, label, '#ffd45a');
            acciones.push({ tipo: 'chance', power: 0.92, sfx: 'gasp' });
        }

        while (this.eventosProcesados < statsEventos.length) {
            const ev = statsEventos[this.eventosProcesados++];
            if (!ev) continue;
            if (ev.tipo === 'atajada') {
                const esLocalGK = ev.team === 'local';
                this._fijarEstado(
                    'atajada',
                    1.7,
                    esLocalGK ? 1.26 : 1.15,
                    esLocalGK
                        ? `🧤 ¡ATAJADÓN DE ${String(ev.nombre || 'ARQUERO').toUpperCase()}!`
                        : '¡UUUUH! ¡SALVÓ EL ARQUERO!',
                    esLocalGK ? '#48e078' : '#9ecbff'
                );
                acciones.push({ tipo: 'chance', power: esLocalGK ? 0.88 : 0.72, sfx: 'cheer_short' });
            } else if (ev.tipo === 'gol') {
                if (ev.team === 'local') {
                    const esRemontada = this.estuvoAbajoLocal && golesLocal > golesRival;
                    if (esRemontada) {
                        this._fijarEstado(
                            'remontada',
                            3.4,
                            1.45,
                            '🔥 ¡REMONTADA ÉPICA! ¡DELIRIO EN LA TRIBUNA!',
                            '#48e078'
                        );
                        acciones.push({ tipo: 'goal', side: 'north', fraction: 1, duration: 4.5 });
                    } else {
                        this._fijarEstado('gol', 2.8, 1.38, '⚽ ¡EXPLOTA LA HINCHADA LOCAL!', '#ffcc00');
                        acciones.push({ tipo: 'goal', side: 'north', fraction: 1, duration: 3.6 });
                    }
                } else {
                    this._fijarEstado('gol_rival', 2.4, 0.76, 'GOL VISITANTE · SILENCIO Y TENSIÓN', '#ff626c');
                    acciones.push({ tipo: 'goal', side: 'south', fraction: 0.42, duration: 2.6 });
                }
            }
        }

        const segRestantes = framesRestantes / Math.max(1, fps);
        if (
            estadoPartido === 'EN_JUEGO' &&
            segRestantes <= 15 &&
            segRestantes > 0 &&
            !this.ultimoMinutoAnunciado
        ) {
            this.ultimoMinutoAnunciado = true;
            const cerrado = Math.abs(golesLocal - golesRival) <= 1;
            if (cerrado || this.esFinal || this.esClasico) {
                this._fijarEstado(
                    'ultimo_minuto',
                    3.0,
                    1.34,
                    '⏱ ¡ÚLTIMOS SEGUNDOS! ¡EMPUJA TODA LA TRIBUNA!',
                    '#ffcc00'
                );
                acciones.push({ tipo: 'chance', power: 0.82 });
            }
        }

        if (estadoPartido === 'FINALIZADO' && !this.finAnunciado) {
            this.finAnunciado = true;
            if (golesLocal > golesRival) {
                this._fijarEstado('victoria', 4.0, 1.4, '🎉 ¡OVACIÓN DE PIE PARA EL GANADOR!', '#48e078');
                acciones.push({ tipo: 'goal', side: 'north', fraction: 1, duration: 4.2 });
            } else if (golesLocal < golesRival) {
                this._fijarEstado('derrota', 3.0, 0.72, '', '#ff626c');
            }
        }

        if (this.estadoTimer > 0) {
            this.estadoTimer -= dt;
        } else if (estadoPartido === 'EN_JUEGO' && ball) {
            const atacandoLocal =
                (ball.owner && ball.owner.team === 'local' && ball.pos.y < 235) ||
                (!ball.owner && ball.vel.y < -3.2 && ball.pos.y < 250);
            const atacandoRival =
                (ball.owner && ball.owner.team === 'rival' && ball.pos.y > 405) ||
                (!ball.owner && ball.vel.y > 3.2 && ball.pos.y > 390);

            if ((atacandoLocal || atacandoRival) && this.ataqueCooldown <= 0) {
                this.ataqueCooldown = 1.8;
                this.estado = 'ataque';
                this.estadoTimer = 1.1;
                this.volumenMultiplicador = 1.18;
                acciones.push({ tipo: 'chance', power: atacandoLocal ? 0.68 : 0.55 });
            } else {
                this.estado = this.esFinal ? 'final' : this.esClasico ? 'clasico' : 'expectativa';
                this.volumenMultiplicador = this.esFinal || this.esClasico ? 1.15 : 1.0;
            }
        }

        let intensidad = this.intensidadBase;
        if (this.estado === 'ataque') intensidad = Math.max(intensidad, 0.52);
        else if (this.estado === 'ultimo_minuto') intensidad = Math.max(intensidad, 0.76);
        else if (this.estado === 'tiro_palo' || this.estado === 'atajada') intensidad = Math.max(intensidad, 0.72);
        else if (this.estado === 'gol' || this.estado === 'remontada' || this.estado === 'victoria')
            intensidad = 0.95;
        else if (this.estado === 'derrota' || this.estado === 'gol_rival') intensidad = Math.min(intensidad, 0.18);

        return {
            estado: this.estado,
            intensidad,
            volumenMultiplicador: this.volumenMultiplicador,
            banner: this.banner,
            acciones,
        };
    }
}

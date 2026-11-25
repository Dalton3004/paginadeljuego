/**
 * ETAPA 10 — Motor Arcade de Tanda de Penales (`PenalesCore`).
 *
 * Mecánica arcade clara y determinista/configurable:
 *   - Dirección: 'izq' | 'centro' | 'der'
 *   - Potencia: 0..1 (zona óptima ~0.62..0.88; exceso > 0.94 con tiro alto puede ir al travesaño/afuera)
 *   - Efecto/Colocación: 'raso' | 'comba' | 'angulo'
 *   - Decisión del arquero: 'izq' | 'centro' | 'der'
 *
 * Incluye reglas completas de serie de 5 penales por lado, corte matemático
 * anticipado y muerte súbita 1 a 1.
 */

export const DIRECCIONES_PENAL = ['izq', 'centro', 'der'];
export const EFECTOS_PENAL = ['raso', 'comba', 'angulo'];

/**
 * Resuelve un único tiro penal combinando dirección, potencia, efecto y lectura del arquero.
 * `azar` inyectable (0..1) para tests deterministas.
 */
export function resolverEjecucionPenal(
    {
        direccion = 'izq', // 'izq' | 'centro' | 'der'
        potencia = 0.75, // 0..1
        efecto = 'comba', // 'raso' | 'comba' | 'angulo'
        decisionArquero = 'der', // 'izq' | 'centro' | 'der'
    } = {},
    azar = Math.random
) {
    const dir = DIRECCIONES_PENAL.includes(direccion) ? direccion : 'centro';
    const arq = DIRECCIONES_PENAL.includes(decisionArquero) ? decisionArquero : 'centro';
    const ef = EFECTOS_PENAL.includes(efecto) ? efecto : 'comba';
    const pot = Math.max(0.1, Math.min(1, Number(potencia) || 0.7));

    // 1) Riesgo de errar el arco si se patea demasiado fuerte o demasiado esquinado al ángulo
    let riesgoAfuera = 0;
    if (pot > 0.94) riesgoAfuera += (pot - 0.94) * 4.2; // hasta ~0.25
    if (ef === 'angulo') riesgoAfuera += pot > 0.86 ? 0.16 : 0.06;
    if (ef === 'comba' && pot > 0.92) riesgoAfuera += 0.06;

    const r1 = azar();
    if (r1 < riesgoAfuera) {
        const travesano = ef === 'angulo' || pot > 0.93;
        return {
            esGol: false,
            desenlace: travesano ? 'travesano' : 'afuera',
            mensaje: travesano ? '¡REVENTÓ EL TRAVESAÑO!' : '¡SE FUE AFUERA!',
            direccion: dir,
            decisionArquero: arq,
            potencia: pot,
            efecto: ef,
        };
    }

    // 2) ¿Adivinó el arquero la dirección?
    const adivinoLado = dir === arq;
    if (!adivinoLado) {
        // Si patea al centro muy despacio y el arquero voló a un costado, muy rara vez despeja con los pies
        if (dir === 'centro' && pot < 0.28 && azar() < 0.25) {
            return {
                esGol: false,
                desenlace: 'atajado',
                mensaje: '¡ATAJÓ CON LOS PIES!',
                direccion: dir,
                decisionArquero: arq,
                potencia: pot,
                efecto: ef,
            };
        }
        return {
            esGol: true,
            desenlace: ef === 'angulo' ? 'golazo' : 'gol',
            mensaje: ef === 'angulo' ? '¡GOLAZO AL ÁNGULO!' : '¡GOL!',
            direccion: dir,
            decisionArquero: arq,
            potencia: pot,
            efecto: ef,
        };
    }

    // 3) El arquero eligió la misma dirección: probabilidad de atajada según potencia y efecto
    let probAtajar = dir === 'centro' ? 0.88 : 0.74;
    // Más potencia reduce el margen del arquero
    probAtajar -= Math.max(0, pot - 0.55) * 0.42;
    // Comba y ángulo dificultan la atajada aun adivinando el palo
    if (ef === 'comba') probAtajar -= 0.14;
    else if (ef === 'angulo') probAtajar -= 0.28;
    else if (ef === 'raso') probAtajar += 0.04;

    probAtajar = Math.max(0.18, Math.min(0.92, probAtajar));
    const atajo = azar() < probAtajar;

    return {
        esGol: !atajo,
        desenlace: atajo ? 'atajado' : 'gol',
        mensaje: atajo ? '¡ATAJÓ EL ARQUERO!' : '¡GOL! ENTRÓ AJUSTADA',
        direccion: dir,
        decisionArquero: arq,
        potencia: pot,
        efecto: ef,
    };
}

/**
 * Elige decisión de IA (para patear o para atajar) según dificultad ('facil' | 'normal' | 'dificil').
 */
export function decisionPenalIA({ rol = 'patear', dificultad = 'normal', azar = Math.random } = {}) {
    const dir = DIRECCIONES_PENAL[Math.floor(azar() * DIRECCIONES_PENAL.length)];
    if (rol === 'atajar') {
        // En fácil se queda más al medio; en difícil reparte mejor hacia los palos
        if (dificultad === 'facil' && azar() < 0.45) return { decisionArquero: 'centro' };
        return { decisionArquero: dir };
    }
    let potencia;
    let efecto;
    if (dificultad === 'facil') {
        potencia = 0.45 + azar() * 0.35;
        efecto = azar() < 0.7 ? 'raso' : 'comba';
    } else if (dificultad === 'dificil') {
        potencia = 0.72 + azar() * 0.2;
        const r = azar();
        efecto = r < 0.45 ? 'comba' : (r < 0.8 ? 'angulo' : 'raso');
    } else {
        potencia = 0.62 + azar() * 0.26;
        const r = azar();
        efecto = r < 0.45 ? 'raso' : (r < 0.82 ? 'comba' : 'angulo');
    }
    return { direccion: dir, potencia, efecto };
}

/**
 * Estado y reglas de la serie oficial de penales (5 tiros por lado + muerte súbita).
 */
export class SeriePenales {
    constructor({ empiezaUsuario = true, tirosReglamentarios = 5 } = {}) {
        this.tirosReglamentarios = tirosReglamentarios;
        this.empiezaUsuario = !!empiezaUsuario;
        this.reiniciar();
    }

    reiniciar() {
        this.historialMio = []; // boolean[] (true = gol, false = errado/atajado)
        this.historialRival = [];
        this.golesMios = 0;
        this.golesOtro = 0;
        this.turno = this.empiezaUsuario ? 'mio' : 'rival'; // 'mio' = usuario patea, 'rival' = rival patea (usuario ataja)
        this.terminada = false;
        this.ganador = null; // 'mio' | 'rival' | null
        this.enMuerteSubita = false;
    }

    /**
     * Registra el resultado de un tiro y evalúa si la tanda ya tiene ganador matemático.
     */
    registrarTiro(esGol) {
        if (this.terminada) return this.estado();
        const gol = !!esGol;

        if (this.turno === 'mio') {
            this.historialMio.push(gol);
            if (gol) this.golesMios++;
            this.turno = 'rival';
        } else {
            this.historialRival.push(gol);
            if (gol) this.golesOtro++;
            this.turno = 'mio';
        }

        this._evaluarCierre();
        return this.estado();
    }

    _evaluarCierre() {
        const tM = this.historialMio.length;
        const tR = this.historialRival.length;
        const N = this.tirosReglamentarios;

        // Fase reglamentaria (primeros 5 tiros de cada uno)
        if (tM <= N && tR <= N) {
            const restM = N - tM;
            const restR = N - tR;
            if (this.golesMios > this.golesOtro + restR) {
                this.terminada = true;
                this.ganador = 'mio';
                return;
            }
            if (this.golesOtro > this.golesMios + restM) {
                this.terminada = true;
                this.ganador = 'rival';
                return;
            }
            if (tM === N && tR === N) {
                if (this.golesMios !== this.golesOtro) {
                    this.terminada = true;
                    this.ganador = this.golesMios > this.golesOtro ? 'mio' : 'rival';
                } else {
                    this.enMuerteSubita = true;
                }
            }
            return;
        }

        // Muerte súbita: se define apenas ambos hayan ejecutado la misma cantidad de penales y uno aventaje al otro
        this.enMuerteSubita = true;
        if (tM === tR && this.golesMios !== this.golesOtro) {
            this.terminada = true;
            this.ganador = this.golesMios > this.golesOtro ? 'mio' : 'rival';
        }
    }

    estado() {
        return {
            golesMios: this.golesMios,
            golesOtro: this.golesOtro,
            historialMio: this.historialMio.slice(),
            historialRival: this.historialRival.slice(),
            turno: this.turno,
            enMuerteSubita: this.enMuerteSubita,
            terminada: this.terminada,
            ganador: this.ganador,
        };
    }
}

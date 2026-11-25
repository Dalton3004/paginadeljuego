/**
 * ETAPA 19 — MODO DESAFÍOS.
 *
 * Desafíos cortos y rejugables que reutilizan el motor real de partido (`GestorPartido`)
 * y el motor real de penales (`SeriePenales`), completamente separados del modo Liga.
 *
 * Cada desafío define explícitamente:
 *   - objetivo
 *   - tiempo (segundos reales)
 *   - condición de victoria
 *   - condición de derrota
 *   - puntuación (con medalla Bronce / Plata / Oro)
 *   - resultado ('SUPERADO' | 'FALLIDO')
 */

export const DESAFIOS_CATALOGO = [
    {
        id: 'remontada',
        nombre: 'LA GRAN REMONTADA',
        icono: '🔥',
        objetivo: 'Arrancás perdiendo 0-2 en el segundo tiempo: dalo vuelta y ganá en tiempo reglamentario.',
        tiempo: 50,
        condicionVictoria: 'Terminar el partido con más goles que el rival (mínimo 3-2).',
        condicionDerrota: 'Empatar o perder cuando suena el silbatazo final.',
        tipoMotor: 'partido',
        golesLocalInicial: 0,
        golesRivalInicial: 2,
        dificultad: 'normal',
        clima: 'noche',
        equipoSugerido: 'retoneta',
        rivalSugerido: 'el_boguero',
        umbralOro: 1450,
        umbralPlata: 1150,
    },
    {
        id: 'muro',
        nombre: 'EL MURO DE CHAQUITO',
        icono: '🧱',
        objetivo: 'Protegé el 1-0 con el rival volcado al ataque. Si te meten un solo gol, perdés al instante.',
        tiempo: 45,
        condicionVictoria: 'Mantener la ventaja y no recibir ningún gol hasta el 00:00.',
        condicionDerrota: 'Recibir 1 gol en cualquier momento del desafío.',
        tipoMotor: 'partido',
        golesLocalInicial: 1,
        golesRivalInicial: 0,
        dificultad: 'dificil',
        tacticaRivalForzada: 'ofensiva',
        clima: 'lluvia',
        equipoSugerido: 'macabro',
        rivalSugerido: 'barranquineros',
        derrotaAlRecibirGol: true,
        umbralOro: 1400,
        umbralPlata: 1100,
    },
    {
        id: 'ultimo_minuto',
        nombre: 'AGÓNICO MINUTO 89',
        icono: '⏱',
        objetivo: 'Partido 1-1 a falta de 25 segundos: meté el gol del triunfo antes del pitazo.',
        tiempo: 25,
        condicionVictoria: 'Ganar el partido antes de que se agote el reloj.',
        condicionDerrota: 'Terminar empatado o abajo en el marcador.',
        tipoMotor: 'partido',
        golesLocalInicial: 1,
        golesRivalInicial: 1,
        dificultad: 'normal',
        clima: 'noche',
        equipoSugerido: 'retoneta',
        rivalSugerido: 'monarca',
        umbralOro: 1350,
        umbralPlata: 1050,
    },
    {
        id: 'penales',
        nombre: 'NERVIOS DE ACERO',
        icono: '🥅',
        objetivo: 'Definición directa por penales en cancha llena contra un arquero especialista.',
        tiempo: 60,
        condicionVictoria: 'Ganar la tanda oficial de penales.',
        condicionDerrota: 'Caer derrotado en la serie desde los doce pasos.',
        tipoMotor: 'penales',
        golesLocalInicial: 0,
        golesRivalInicial: 0,
        dificultad: 'dificil',
        clima: 'noche',
        equipoSugerido: 'la_tikineta',
        rivalSugerido: 'macabro',
        umbralOro: 1350,
        umbralPlata: 1050,
    },
    {
        id: 'supervivencia',
        nombre: 'SUPERVIVENCIA EN EL BARRO',
        icono: '⚡',
        objetivo: 'Marcá al menos 2 goles sin recibir ninguno. Cada gol tuyo suma +10s al reloj.',
        tiempo: 35,
        condicionVictoria: 'Anotar 2 o más goles con la valla invicta (0 goles recibidos).',
        condicionDerrota: 'Recibir 1 gol o cerrar el tiempo con menos de 2 goles a favor.',
        tipoMotor: 'partido',
        golesLocalInicial: 0,
        golesRivalInicial: 0,
        dificultad: 'normal',
        clima: 'lluvia_intensa',
        equipoSugerido: 'trotenham',
        rivalSugerido: 'agustintos',
        derrotaAlRecibirGol: true,
        bonusSegundosPorGol: 10,
        minGolesPropios: 2,
        umbralOro: 1550,
        umbralPlata: 1200,
    },
];

export function obtenerDesafio(id) {
    return DESAFIOS_CATALOGO.find((d) => d.id === id) || DESAFIOS_CATALOGO[0];
}

/**
 * Crea el estado en vivo mientras corre un desafío.
 */
export function crearEstadoActivoDesafio(desafioId) {
    const def = obtenerDesafio(desafioId);
    return {
        id: def.id,
        def,
        golesMiosAnotados: 0,
        golesRivalRecibidos: 0,
        ultimoGolesLocalVisto: def.golesLocalInicial || 0,
        ultimoGolesRivalVisto: def.golesRivalInicial || 0,
        abortadoPorDerrota: false,
        motivoFinTemprano: '',
        registrado: false,
        evaluacion: null,
    };
}

/**
 * Evalúa cada frame del desafío (p. ej. derrota instantánea en Muro/Supervivencia o tiempo extra por gol).
 * Devuelve `{ terminarAhora, segundosExtra }`.
 */
export function actualizarDesafioEnVivo(estadoActivo, { golesLocal = 0, golesRival = 0 } = {}) {
    if (!estadoActivo || !estadoActivo.def) return { terminarAhora: false, segundosExtra: 0 };
    const def = estadoActivo.def;
    let segundosExtra = 0;

    if (golesLocal > estadoActivo.ultimoGolesLocalVisto) {
        const nuevos = golesLocal - estadoActivo.ultimoGolesLocalVisto;
        estadoActivo.golesMiosAnotados += nuevos;
        estadoActivo.ultimoGolesLocalVisto = golesLocal;
        if (def.bonusSegundosPorGol) {
            segundosExtra += nuevos * def.bonusSegundosPorGol;
        }
    }
    if (golesRival > estadoActivo.ultimoGolesRivalVisto) {
        const recibidos = golesRival - estadoActivo.ultimoGolesRivalVisto;
        estadoActivo.golesRivalRecibidos += recibidos;
        estadoActivo.ultimoGolesRivalVisto = golesRival;
        if (def.derrotaAlRecibirGol) {
            estadoActivo.abortadoPorDerrota = true;
            estadoActivo.motivoFinTemprano = 'El rival convirtió y rompió la condición del desafío.';
            return { terminarAhora: true, segundosExtra: 0 };
        }
    }

    return { terminarAhora: false, segundosExtra };
}

/**
 * Calcula resultado, puntuación y medalla al terminar un desafío real.
 */
export function evaluarResultadoDesafio(
    desafioId,
    {
        golesLocal = 0,
        golesRival = 0,
        segundosSobrantes = 0,
        atajadas = 0,
        tirosAlArco = 0,
        penales = null, // { golesMios, golesOtro, ganador }
        abortadoPorDerrota = false,
    } = {}
) {
    const def = obtenerDesafio(desafioId);
    const glBase = def.golesLocalInicial || 0;
    const grBase = def.golesRivalInicial || 0;
    const golesAnotadosMios = Math.max(0, golesLocal - glBase);
    const golesRecibidos = Math.max(0, golesRival - grBase);

    let exito;
    let motivo;

    if (def.tipoMotor === 'penales') {
        exito = !!(penales && (penales.ganador === 'mio' || penales.golesMios > penales.golesOtro));
        motivo = exito
            ? `Ganaste la serie de penales (${penales.golesMios}-${penales.golesOtro}).`
            : `Caíste en los penales (${penales ? `${penales.golesMios}-${penales.golesOtro}` : '0-0'}).`;
    } else if (abortadoPorDerrota || (def.derrotaAlRecibirGol && golesRecibidos > 0)) {
        exito = false;
        motivo = 'Recibiste un gol que invalidó el desafío.';
    } else if (def.id === 'supervivencia') {
        exito = golesRecibidos === 0 && golesAnotadosMios >= (def.minGolesPropios || 2);
        motivo = exito
            ? `Sobreviviste invicto con ${golesAnotadosMios} goles convertidos.`
            : `Faltaron goles (convertiste ${golesAnotadosMios}/${def.minGolesPropios || 2}).`;
    } else if (def.id === 'muro') {
        exito = golesRecibidos === 0 && golesLocal > golesRival;
        motivo = exito ? '¡Valla invicta! Aguantaste el asedio rival.' : 'No pudiste sostener el 1-0.';
    } else {
        exito = golesLocal > golesRival;
        motivo = exito
            ? `Objetivo cumplido (${golesLocal}-${golesRival}).`
            : `Marcador insuficiente (${golesLocal}-${golesRival}).`;
    }

    let puntuacion;
    if (!exito) {
        puntuacion = Math.max(80, golesAnotadosMios * 140 + atajadas * 45 + tirosAlArco * 20);
    } else if (def.tipoMotor === 'penales' && penales) {
        const diffPen = Math.max(1, (penales.golesMios || 0) - (penales.golesOtro || 0));
        puntuacion = 950 + diffPen * 180 + (penales.golesMios || 0) * 45;
    } else {
        const diffFinal = Math.max(0, golesLocal - golesRival);
        puntuacion =
            900 +
            golesAnotadosMios * 180 +
            diffFinal * 90 +
            Math.round(Math.max(0, segundosSobrantes) * 10) +
            atajadas * 55 +
            tirosAlArco * 20 -
            golesRecibidos * 120;
    }
    puntuacion = Math.max(0, Math.round(puntuacion));

    let medalla = 'SIN MEDALLA';
    if (exito) {
        if (puntuacion >= (def.umbralOro || 1400)) medalla = 'ORO';
        else if (puntuacion >= (def.umbralPlata || 1100)) medalla = 'PLATA';
        else medalla = 'BRONCE';
    }

    return {
        desafioId: def.id,
        nombre: def.nombre,
        objetivo: def.objetivo,
        exito,
        resultado: exito ? 'SUPERADO' : 'FALLIDO',
        puntuacion,
        medalla,
        motivo,
    };
}

export const DesafiosStore = (() => {
    const KEY = 'chaquito_desafios_v1';
    let mem = { registros: {} };

    function leer() {
        try {
            if (typeof localStorage === 'undefined') return { registros: { ...mem.registros } };
            const raw = localStorage.getItem(KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed || typeof parsed !== 'object' || typeof parsed.registros !== 'object') {
                return { registros: {} };
            }
            return { registros: { ...parsed.registros } };
        } catch (_e) {
            return { registros: { ...mem.registros } };
        }
    }

    function escribir(st) {
        const limpio = { registros: (st && st.registros) || {} };
        mem = limpio;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(KEY, JSON.stringify(limpio));
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    function reiniciar() {
        const limpio = { registros: {} };
        escribir(limpio);
        return limpio;
    }

    function registrarIntento(evalRes) {
        if (!evalRes || !evalRes.desafioId) return null;
        const st = leer();
        const prev = st.registros[evalRes.desafioId] || {
            intentos: 0,
            completado: false,
            mejorPuntaje: 0,
            mejorMedalla: 'SIN MEDALLA',
        };
        const ordenMed = { 'SIN MEDALLA': 0, BRONCE: 1, PLATA: 2, ORO: 3 };
        const mejorMedalla =
            (ordenMed[evalRes.medalla] || 0) >= (ordenMed[prev.mejorMedalla] || 0)
                ? evalRes.medalla
                : prev.mejorMedalla;
        st.registros[evalRes.desafioId] = {
            intentos: (prev.intentos || 0) + 1,
            completado: !!(prev.completado || evalRes.exito),
            mejorPuntaje: Math.max(prev.mejorPuntaje || 0, evalRes.puntuacion || 0),
            mejorMedalla,
            ultimaFecha: Date.now(),
        };
        escribir(st);
        return st.registros[evalRes.desafioId];
    }

    function progresoDe(desafioId) {
        const st = leer();
        return (
            st.registros[desafioId] || {
                intentos: 0,
                completado: false,
                mejorPuntaje: 0,
                mejorMedalla: 'SIN MEDALLA',
            }
        );
    }

    function totalCompletados() {
        const regs = Object.values(leer().registros);
        return regs.filter((r) => r && r.completado).length;
    }

    return {
        leer,
        escribir,
        reiniciar,
        registrarIntento,
        progresoDe,
        totalCompletados,
    };
})();

if (typeof globalThis !== 'undefined') {
    globalThis.DesafiosStore = DesafiosStore;
}

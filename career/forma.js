/**
 * ETAPA 23 — FORMA Y CANSANCIO (sistema liviano de estado).
 *
 * Tres estados claros para decisiones de Liga y presentación:
 *   - excelente ("🔥 EXCELENTE")
 *   - normal    ("✓ NORMAL")
 *   - cansado   ("😮‍💨 CANSADO")
 *
 * Incluye métricas simples (forma 0..100, fatiga 0..100) y acciones de recuperación
 * (fecha libre, descanso táctico de plantel entre fechas, post-temporada).
 *
 * REGLAS DE DISEÑO:
 * - No es un sistema médico ni hiperrealista.
 * - NO introduce lesiones permanentes ni frustración excesiva.
 * - Sus efectos en cancha son sutiles y están acotados en `career/atributos.js`.
 */

export const ESTADOS_FORMA = {
    excelente: {
        id: 'excelente',
        etiqueta: 'excelente',
        icono: '🔥',
        nombre: 'EXCELENTE',
        color: '#48e078',
        resumen: 'Plantel encendido y con piernas frescas.',
        simFactor: 1.05,
    },
    normal: {
        id: 'normal',
        etiqueta: 'normal',
        icono: '✓',
        nombre: 'NORMAL',
        color: '#9ecbff',
        resumen: 'Ritmo competitivo estable.',
        simFactor: 1.0,
    },
    cansado: {
        id: 'cansado',
        etiqueta: 'cansado',
        icono: '😮‍💨',
        nombre: 'CANSADO',
        color: '#ffb347',
        resumen: 'Acumulación de partidos seguidos. Conviene rotar o dosificar el sprint.',
        simFactor: 0.96,
    },
};

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function clasificarEstadoFisico(forma = 65, fatiga = 18) {
    const f = clamp(Number(forma) || 65, 0, 100);
    const c = clamp(Number(fatiga) || 0, 0, 100);
    if (c >= 62) return ESTADOS_FORMA.cansado;
    if (f >= 74 && c <= 38) return ESTADOS_FORMA.excelente;
    return ESTADOS_FORMA.normal;
}

export function crearEstadoFormaEquipo() {
    return {
        forma: 66,
        fatiga: 14,
        partidosSeguidos: 0,
        descansosUsados: 0,
        etiqueta: 'normal',
    };
}

export function normalizarEstadoForma(raw) {
    const base = crearEstadoFormaEquipo();
    if (!raw || typeof raw !== 'object') return base;
    const forma = clamp(Math.round(Number(raw.forma ?? base.forma)), 0, 100);
    const fatiga = clamp(Math.round(Number(raw.fatiga ?? base.fatiga)), 0, 100);
    const info = clasificarEstadoFisico(forma, fatiga);
    return {
        forma,
        fatiga,
        partidosSeguidos: Math.max(0, parseInt(raw.partidosSeguidos, 10) || 0),
        descansosUsados: Math.max(0, parseInt(raw.descansosUsados, 10) || 0),
        etiqueta: info.etiqueta,
    };
}

/**
 * Actualiza forma y fatiga tras jugar o simular un partido oficial.
 */
export function registrarPartidoEnForma(
    estadoRaw,
    { resultado = 'draw', golesFavor = 0, golesContra = 0, clima = 'dia', intensidadExtra = false } = {}
) {
    const st = normalizarEstadoForma(estadoRaw);
    let deltaForma = 0;
    if (resultado === 'win') deltaForma += 8 + Math.min(4, Math.max(0, golesFavor - golesContra));
    else if (resultado === 'draw') deltaForma += 1;
    else deltaForma -= 6;

    // Fatiga moderada por partido; nunca punitiva (tope suave y recuperación natural parcial)
    let deltaFatiga = 16;
    if (clima === 'lluvia_intensa') deltaFatiga += 5;
    else if (clima === 'lluvia') deltaFatiga += 3;
    if (intensidadExtra) deltaFatiga += 4;

    // Recuperación metabólica base entre partidos para no obligar microgestión constante
    const recuperacionNatural = st.partidosSeguidos >= 3 ? 6 : 4;

    st.forma = clamp(st.forma + deltaForma, 28, 98);
    st.fatiga = clamp(st.fatiga + deltaFatiga - recuperacionNatural, 0, 88);
    st.partidosSeguidos += 1;
    st.etiqueta = clasificarEstadoFisico(st.forma, st.fatiga).etiqueta;
    return st;
}

/**
 * Recuperación por fecha libre o sesión liviana de descanso en Liga.
 * Baja el cansancio de forma importante y estabiliza la forma.
 */
export function aplicarRecuperacionPlantel(estadoRaw, { motivo = 'descanso' } = {}) {
    const st = normalizarEstadoForma(estadoRaw);
    const recFatiga = motivo === 'fecha_libre' ? 38 : motivo === 'nueva_temporada' ? 60 : 28;
    const bonusForma = motivo === 'charla_motivacional' ? 9 : 4;
    st.fatiga = clamp(st.fatiga - recFatiga, 0, 100);
    st.forma = clamp(st.forma + bonusForma, 40, 96);
    if (motivo === 'fecha_libre' || motivo === 'nueva_temporada') {
        st.partidosSeguidos = 0;
    } else {
        st.descansosUsados += 1;
        st.partidosSeguidos = Math.max(0, st.partidosSeguidos - 1);
    }
    st.etiqueta = clasificarEstadoFisico(st.forma, st.fatiga).etiqueta;
    return st;
}

/**
 * Devuelve información lista para UI (Liga, Mi Club, Pre-partido) e IA/Simulación.
 */
export function describirFormaEquipo(estadoRaw) {
    const st = normalizarEstadoForma(estadoRaw);
    const meta = clasificarEstadoFisico(st.forma, st.fatiga);
    return {
        ...st,
        icono: meta.icono,
        nombre: meta.nombre,
        color: meta.color,
        resumen: meta.resumen,
        simFactor: meta.simFactor,
        textoCorto: `${meta.icono} ${meta.nombre} (Forma ${st.forma} · Fatiga ${st.fatiga}%)`,
    };
}

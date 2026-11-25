/**
 * ETAPA 21 — SISTEMA DE CELEBRACIONES DE GOL DESBLOQUEABLES.
 *
 * Tipos cosméticos:
 *   - normal
 *   - acrobatica
 *   - baile
 *   - hinchada
 *   - grupal
 *   - especial
 *
 * Desbloqueo conectado al progreso real:
 *   - reputación
 *   - logros (racha / goleada)
 *   - títulos (Liga, Copa o Supercopa)
 *   - desafíos (Modo Desafíos)
 *   - temporadas (temporadas completadas)
 *
 * 100% cosmético: jamás altera atributos, física ni marcador.
 */

export const CELEBRACIONES_CATALOGO = [
    {
        id: 'normal',
        nombre: 'CLÁSICA DE POTRERO',
        icono: '✊',
        categoria: 'base',
        requisitoTipo: 'inicial',
        requisitoTexto: 'Disponible desde el inicio.',
        grito: '¡PUÑO APRETADO!',
    },
    {
        id: 'baile',
        nombre: 'PASITO CHAQUITO',
        icono: '🕺',
        categoria: 'baile',
        requisitoTipo: 'reputacion',
        requisitoTexto: 'Alcanzar Reputación General 52 o más.',
        grito: '¡BAILA TODO EL EQUIPO!',
    },
    {
        id: 'hinchada',
        nombre: 'DE CARA A LA POPULAR',
        icono: '📢',
        categoria: 'hinchada',
        requisitoTipo: 'temporadas',
        requisitoTexto: 'Completar 1 temporada de Liga (o 6 partidos de club).',
        grito: '¡EXPLOTA LA TRIBUNA!',
    },
    {
        id: 'grupal',
        nombre: 'ABRAZO DE CAMPEONES',
        icono: '🤝',
        categoria: 'grupal',
        requisitoTipo: 'logros',
        requisitoTexto: 'Lograr racha de 3 victorias seguidas o ganar por 3+ goles.',
        grito: '¡TODOS JUNTOS EN EL MEDIO!',
    },
    {
        id: 'acrobatica',
        nombre: 'MORTAL EN EL AIRE',
        icono: '🤸',
        categoria: 'acrobatica',
        requisitoTipo: 'desafios',
        requisitoTexto: 'Superar al menos 1 desafío en Modo Desafíos.',
        grito: '¡PIRUETA DE PELÍCULA!',
    },
    {
        id: 'especial',
        nombre: 'CORONA DORADA',
        icono: '👑',
        categoria: 'especial',
        requisitoTipo: 'titulos',
        requisitoTexto: 'Ganar Liga, Copa, Supercopa o completar el Modo Historia.',
        grito: '¡FESTEJO DE REY!',
    },
];

export const CELEBRACIONES_IDS = CELEBRACIONES_CATALOGO.map((c) => c.id);

export function obtenerCelebracion(id) {
    return CELEBRACIONES_CATALOGO.find((c) => c.id === id) || CELEBRACIONES_CATALOGO[0];
}

/**
 * Evalúa qué celebraciones están desbloqueadas a partir del estado real de Carrera + Desafíos + Historia.
 */
export function evaluarCelebracionesDesbloqueadas({
    carrera = null,
    desafiosCompletados = 0,
    historiaCompletada = false,
} = {}) {
    const st = carrera || {};
    const repGen = (st.reputacion && Number(st.reputacion.general)) || 40;
    const temporadas = Array.isArray(st.historialTemporadas) ? st.historialTemporadas.length : 0;
    const clubes = st.estadisticasClub && typeof st.estadisticasClub === 'object' ? Object.values(st.estadisticasClub) : [];
    const totalPjClub = clubes.reduce((acc, c) => acc + (Number(c && c.pj) || 0), 0);
    const huboGoleada3 = clubes.some((c) => c && c.mayorGoleada && Number(c.mayorGoleada.diff) >= 3);
    const mejorRacha = (st.rachas && Number(st.rachas.mejorRachaVictorias)) || 0;
    const rachaActual = (st.rachas && Number(st.rachas.victoriasConsecutivas)) || 0;
    const palmares = st.palmares || {};
    const totalTitulos =
        (Number(palmares.ligas) || 0) +
        (Number(palmares.copas) || 0) +
        (Number(palmares.supercopas) || 0);
    const manuales = Array.isArray(st.celebracionesDesbloqueadas) ? st.celebracionesDesbloqueadas : [];

    const desbloqueadas = new Set(['normal', ...manuales.filter((x) => CELEBRACIONES_IDS.includes(x))]);

    if (repGen >= 52) desbloqueadas.add('baile');
    if (temporadas >= 1 || totalPjClub >= 6) desbloqueadas.add('hinchada');
    if (mejorRacha >= 3 || rachaActual >= 3 || huboGoleada3) desbloqueadas.add('grupal');
    if (Number(desafiosCompletados) >= 1) desbloqueadas.add('acrobatica');
    if (totalTitulos >= 1 || historiaCompletada) desbloqueadas.add('especial');

    return CELEBRACIONES_CATALOGO.map((c) => ({
        ...c,
        desbloqueada: desbloqueadas.has(c.id),
    }));
}

/**
 * Resuelve qué celebración cosmética ejecutar cuando hay gol.
 * Si la elegida aún no está desbloqueada o es 'auto', elige de forma inteligente entre las disponibles.
 */
export function resolverCelebracionActiva({
    preferida = 'normal',
    desbloqueadasIds = ['normal'],
    esGolTardio = false,
    esFinal = false,
} = {}) {
    const disp = Array.isArray(desbloqueadasIds) && desbloqueadasIds.length ? desbloqueadasIds : ['normal'];
    if (preferida && preferida !== 'auto' && disp.includes(preferida)) {
        return obtenerCelebracion(preferida);
    }
    if (esFinal && disp.includes('especial')) return obtenerCelebracion('especial');
    if (esGolTardio && disp.includes('hinchada')) return obtenerCelebracion('hinchada');
    return obtenerCelebracion(disp[disp.length - 1] || 'normal');
}

/**
 * Calcula offsets puramente cosméticos (salto, giro, vaivén, partículas) para renderizar
 * a los jugadores del equipo anotador durante `EstadoPartido.CELEBRANDO_GOL`.
 * No modifica `p.pos` real del motor físico.
 */
export function calcularPoseCelebracion({
    tipo = 'normal',
    elapsed = 0,
    esAutor = false,
    indiceCompanero = 0,
    reduceMotion = false,
} = {}) {
    const t = Math.max(0, Number(elapsed) || 0);
    if (reduceMotion) {
        return { offsetX: 0, offsetY: esAutor ? -3 : 0, rotacion: 0, escala: 1, auraDorada: tipo === 'especial' };
    }

    switch (tipo) {
        case 'acrobatica': {
            if (esAutor) {
                // Salto alto + giro mortal en la primera mitad del festejo
                const fase = Math.min(1, (t % 1.1) / 0.75);
                const salto = fase < 1 ? Math.sin(fase * Math.PI) * 24 : 0;
                const rot = fase < 1 ? fase * Math.PI * 2 : 0;
                return { offsetX: 0, offsetY: -salto, rotacion: rot, escala: 1.06, auraDorada: false };
            }
            const saltoComp = Math.abs(Math.sin(t * 7 + indiceCompanero)) * 7;
            return { offsetX: 0, offsetY: -saltoComp, rotacion: 0, escala: 1, auraDorada: false };
        }
        case 'baile': {
            const paso = Math.sin(t * 11 + indiceCompanero * 0.6);
            const rebote = Math.abs(Math.cos(t * 11)) * (esAutor ? 9 : 6);
            return {
                offsetX: paso * (esAutor ? 7 : 5),
                offsetY: -rebote,
                rotacion: paso * 0.14,
                escala: 1,
                auraDorada: false,
            };
        }
        case 'hinchada': {
            // El autor corre/vibra mirando hacia la tribuna superior/lateral
            const emp = Math.min(1, t / 0.6);
            const salto = Math.abs(Math.sin(t * 9)) * (esAutor ? 11 : 5);
            return {
                offsetX: esAutor ? Math.sin(t * 6) * 6 : 0,
                offsetY: -(emp * (esAutor ? 12 : 4)) - salto,
                rotacion: 0,
                escala: esAutor ? 1.08 : 1,
                auraDorada: false,
            };
        }
        case 'grupal': {
            // Pequeña ronda rítmica conjunta
            const ang = t * 5 + indiceCompanero * 2.1;
            const r = esAutor ? 3 : 8;
            return {
                offsetX: Math.cos(ang) * r,
                offsetY: -Math.abs(Math.sin(t * 8 + indiceCompanero)) * 8,
                rotacion: 0,
                escala: esAutor ? 1.06 : 1.02,
                auraDorada: false,
            };
        }
        case 'especial': {
            const lev = Math.abs(Math.sin(t * 6.5)) * (esAutor ? 14 : 7);
            return {
                offsetX: esAutor ? Math.sin(t * 5) * 4 : 0,
                offsetY: -lev,
                rotacion: esAutor ? Math.sin(t * 8) * 0.08 : 0,
                escala: esAutor ? 1.12 : 1.03,
                auraDorada: true,
            };
        }
        default: {
            const salto = Math.abs(Math.sin(t * 7.5 + indiceCompanero)) * (esAutor ? 9 : 4);
            return { offsetX: 0, offsetY: -salto, rotacion: 0, escala: 1, auraDorada: false };
        }
    }
}

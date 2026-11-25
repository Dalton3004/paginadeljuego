/**
 * ETAPA 13 — Sistema de Rivalidades y Clásicos entre equipos.
 *
 * La rivalidad (0..100) parte de clásicos fundacionales de Liga Chaquito F8
 * y crece dinámicamente por enfrentamientos frecuentes, partidos importantes,
 * finales, remontadas, rachas de dominio, duelos cerrados y conferencias.
 * Nunca altera de forma injusta la física ni el resultado del partido.
 */

export const CLASICOS_FUNDACIONALES = [
    ['retoneta', 'el_boguero', 76, 'EL SUPERCLÁSICO CHAQUITO'],
    ['macabro', 'agustintos', 74, 'CLÁSICO DE LA NOCHE'],
    ['barranquineros', 'la_tikineta', 72, 'CLÁSICO DEL BUEN PIE'],
    ['barrio_fino', 'choborra', 72, 'CLÁSICO DE LA ESQUINA'],
    ['cattarino', 'norwhisky', 70, 'CLÁSICO DEL POTRERO'],
    ['trotenham', 'monarca', 70, 'CLÁSICO DE LA CORONA'],
];

export const UMBRAL_CLASICO = 70;
export const UMBRAL_ALTA_RIVALIDAD = 82;

export function claveParEquipos(eqA, eqB) {
    const a = String(eqA || '').trim();
    const b = String(eqB || '').trim();
    if (!a || !b || a === b) return '';
    return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function buscarFundacional(eqA, eqB) {
    for (const [a, b, base, nombreClasico] of CLASICOS_FUNDACIONALES) {
        if ((a === eqA && b === eqB) || (a === eqB && b === eqA)) {
            return { base, nombreClasico };
        }
    }
    return null;
}

export function crearEstadoRivalidades() {
    const pares = {};
    for (const [a, b, base, nombreClasico] of CLASICOS_FUNDACIONALES) {
        const k = claveParEquipos(a, b);
        const [primero, segundo] = a < b ? [a, b] : [b, a];
        pares[k] = {
            eq1: primero,
            eq2: segundo,
            nivel: base,
            fundacional: true,
            nombreClasico,
            pj: 0,
            g1: 0,
            g2: 0,
            empates: 0,
            rachaEquipo: '',
            rachaVictorias: 0,
            ultimoResultado: '',
        };
    }
    return { pares };
}

export function normalizarEstadoRivalidades(raw) {
    const base = crearEstadoRivalidades();
    if (!raw || typeof raw !== 'object' || !raw.pares || typeof raw.pares !== 'object') {
        return base;
    }
    for (const [k, v] of Object.entries(raw.pares)) {
        if (!v || typeof v !== 'object') continue;
        const previo = base.pares[k] || {};
        base.pares[k] = {
            eq1: String(v.eq1 || previo.eq1 || ''),
            eq2: String(v.eq2 || previo.eq2 || ''),
            nivel: Math.max(0, Math.min(100, Math.round(Number(v.nivel) || previo.nivel || 20))),
            fundacional: !!(v.fundacional || previo.fundacional),
            nombreClasico: String(v.nombreClasico || previo.nombreClasico || ''),
            pj: Math.max(0, parseInt(v.pj, 10) || 0),
            g1: Math.max(0, parseInt(v.g1, 10) || 0),
            g2: Math.max(0, parseInt(v.g2, 10) || 0),
            empates: Math.max(0, parseInt(v.empates, 10) || 0),
            rachaEquipo: String(v.rachaEquipo || ''),
            rachaVictorias: Math.max(0, parseInt(v.rachaVictorias, 10) || 0),
            ultimoResultado: String(v.ultimoResultado || ''),
        };
    }
    return base;
}

export function etiquetaRivalidad(nivel, esClasico, nombreClasico = '') {
    if (nombreClasico && nivel >= UMBRAL_CLASICO) return nombreClasico;
    if (nivel >= 88) return 'CLÁSICO CALIENTE';
    if (esClasico || nivel >= UMBRAL_CLASICO) return 'CLÁSICO CHAQUITO';
    if (nivel >= 52) return 'PIKA FUERTE';
    if (nivel >= 32) return 'DUELO CON HISTORIA';
    return 'CRUCE CORDIAL';
}

/**
 * Consulta la rivalidad entre `miEquipo` y `rival` orientada a `miEquipo`.
 */
export function consultarRivalidad(estadoRaw, miEquipo, rival) {
    const estado = normalizarEstadoRivalidades(estadoRaw);
    const k = claveParEquipos(miEquipo, rival);
    if (!k) {
        return {
            nivel: 0,
            textoNivel: 'RIVALIDAD 0/100',
            esClasico: false,
            altaTension: false,
            etiqueta: 'AMISTOSO',
            pj: 0,
            ganados: 0,
            empatados: 0,
            perdidos: 0,
            ultimoResultado: '',
        };
    }
    const fund = buscarFundacional(miEquipo, rival);
    const reg = estado.pares[k] || {
        eq1: miEquipo < rival ? miEquipo : rival,
        eq2: miEquipo < rival ? rival : miEquipo,
        nivel: fund ? fund.base : 18,
        fundacional: !!fund,
        nombreClasico: fund ? fund.nombreClasico : '',
        pj: 0,
        g1: 0,
        g2: 0,
        empates: 0,
        rachaEquipo: '',
        rachaVictorias: 0,
        ultimoResultado: '',
    };
    const soyPrimero = reg.eq1 === miEquipo;
    const nivel = Math.max(0, Math.min(100, Math.round(reg.nivel)));
    const esClasico = !!(reg.fundacional || nivel >= UMBRAL_CLASICO);
    return {
        nivel,
        textoNivel: `RIVALIDAD ${nivel}/100`,
        esClasico,
        altaTension: nivel >= UMBRAL_ALTA_RIVALIDAD,
        etiqueta: etiquetaRivalidad(nivel, esClasico, reg.nombreClasico),
        nombreClasico: reg.nombreClasico || '',
        pj: reg.pj,
        ganados: soyPrimero ? reg.g1 : reg.g2,
        empatados: reg.empates,
        perdidos: soyPrimero ? reg.g2 : reg.g1,
        rachaDominio: reg.rachaVictorias >= 2 ? { equipo: reg.rachaEquipo, victorias: reg.rachaVictorias } : null,
        ultimoResultado: reg.ultimoResultado || '',
    };
}

/**
 * Registra un enfrentamiento real y actualiza el nivel de rivalidad según lo ocurrido.
 */
export function registrarEnfrentamientoRivalidad(
    estadoRaw,
    {
        eqLocal,
        eqRival,
        golesLocal = 0,
        golesRival = 0,
        ganadorPenales = null, // 'local' | 'rival' | null
        remontada = false,
        esFinal = false,
        esEliminatoria = false,
        partidoImportante = false,
    } = {}
) {
    const estado = normalizarEstadoRivalidades(estadoRaw);
    const k = claveParEquipos(eqLocal, eqRival);
    if (!k) return { estado, cambio: 0, info: consultarRivalidad(estado, eqLocal, eqRival) };

    const fund = buscarFundacional(eqLocal, eqRival);
    const [primero, segundo] = eqLocal < eqRival ? [eqLocal, eqRival] : [eqRival, eqLocal];
    const reg = estado.pares[k]
        ? { ...estado.pares[k] }
        : {
              eq1: primero,
              eq2: segundo,
              nivel: fund ? fund.base : 18,
              fundacional: !!fund,
              nombreClasico: fund ? fund.nombreClasico : '',
              pj: 0,
              g1: 0,
              g2: 0,
              empates: 0,
              rachaEquipo: '',
              rachaVictorias: 0,
              ultimoResultado: '',
          };

    const nivelAntes = reg.nivel;
    reg.pj += 1;

    let ganadorId = '';
    if (golesLocal > golesRival || ganadorPenales === 'local') ganadorId = eqLocal;
    else if (golesRival > golesLocal || ganadorPenales === 'rival') ganadorId = eqRival;

    if (ganadorId === primero) reg.g1 += 1;
    else if (ganadorId === segundo) reg.g2 += 1;
    else reg.empates += 1;

    if (ganadorId) {
        if (reg.rachaEquipo === ganadorId) reg.rachaVictorias += 1;
        else {
            reg.rachaEquipo = ganadorId;
            reg.rachaVictorias = 1;
        }
    } else {
        reg.rachaEquipo = '';
        reg.rachaVictorias = 0;
    }

    const penTxt = ganadorPenales ? ' (PEN)' : '';
    reg.ultimoResultado = `${eqLocal}:${golesLocal}-${golesRival}:${eqRival}${penTxt}`;

    // Incremento orgánico de rivalidad según los factores del partido
    let delta = 4; // enfrentamiento frecuente base
    if (reg.pj >= 3) delta += 2;
    if (Math.abs(golesLocal - golesRival) <= 1) delta += 4; // partido cerrado
    if (ganadorPenales) delta += 5; // drama en penales
    if (remontada) delta += 9;
    if (partidoImportante) delta += 6;
    if (esEliminatoria) delta += 7;
    if (esFinal) delta += 14;
    if (reg.rachaVictorias >= 3) delta += 5; // pica por paternidad/dominio

    const nuevoClasico = nivelAntes < UMBRAL_CLASICO && nivelAntes + delta >= UMBRAL_CLASICO;
    reg.nivel = Math.max(0, Math.min(100, nivelAntes + delta));
    if (nuevoClasico && !reg.nombreClasico) {
        reg.nombreClasico = 'NUEVO CLÁSICO CHAQUITO';
    }

    estado.pares[k] = reg;
    const info = consultarRivalidad(estado, eqLocal, eqRival);
    return {
        estado,
        cambio: reg.nivel - nivelAntes,
        nuevoClasico,
        info,
    };
}

export function ajustarRivalidadPorDeclaracion(estadoRaw, eqA, eqB, delta = 0) {
    const estado = normalizarEstadoRivalidades(estadoRaw);
    const k = claveParEquipos(eqA, eqB);
    if (!k || !delta) return estado;
    const fund = buscarFundacional(eqA, eqB);
    const piso = fund ? Math.max(55, fund.base - 8) : 10;
    const [primero, segundo] = eqA < eqB ? [eqA, eqB] : [eqB, eqA];
    const reg = estado.pares[k]
        ? { ...estado.pares[k] }
        : {
              eq1: primero,
              eq2: segundo,
              nivel: fund ? fund.base : 18,
              fundacional: !!fund,
              nombreClasico: fund ? fund.nombreClasico : '',
              pj: 0,
              g1: 0,
              g2: 0,
              empates: 0,
              rachaEquipo: '',
              rachaVictorias: 0,
              ultimoResultado: '',
          };
    reg.nivel = Math.max(piso, Math.min(100, Math.round(reg.nivel + delta)));
    estado.pares[k] = reg;
    return estado;
}

/**
 * Devuelve las principales rivalidades de un equipo ordenadas de mayor a menor.
 */
export function rivalidadesDeEquipo(estadoRaw, equipoId) {
    const estado = normalizarEstadoRivalidades(estadoRaw);
    const id = String(equipoId || '').trim();
    if (!id) return [];
    const lista = [];
    for (const reg of Object.values(estado.pares)) {
        if (reg.eq1 !== id && reg.eq2 !== id) continue;
        const otro = reg.eq1 === id ? reg.eq2 : reg.eq1;
        lista.push({
            rivalId: otro,
            ...consultarRivalidad(estado, id, otro),
        });
    }
    lista.sort((a, b) => b.nivel - a.nivel || b.pj - a.pj);
    return lista;
}

/**
 * ETAPA 22 — CARACTERÍSTICAS DE JUGADORES (atributos + rasgos).
 *
 * Atributos simples (40..95) para los jugadores reales de cada plantel (sim/planteles.js):
 *   velocidad · tiro · regate · pase · fuerza · defensa · atajada
 *
 * Rasgos: CLUTCH · CEREBRO · CAÑÓN · VELOZ · MURO · GAMBETA · TANQUE · PULMÓN
 *
 * REGLA DE BALANCE: los atributos COMPLEMENTAN el gameplay arcade existente.
 * Cada modificador queda acotado a unos pocos puntos porcentuales (ver LIMITES_MODIFICADORES)
 * y por defecto todo vale 1.0, así que el modo Online (servidor autoritativo) no cambia.
 * Módulo puro: sin DOM, testeable en Node.
 */

import { PLANTELES } from '../sim/planteles.js';

export const ATRIBUTOS_ORDEN = ['velocidad', 'tiro', 'regate', 'pase', 'fuerza', 'defensa', 'atajada'];

export const ATRIBUTOS_ETIQUETA = {
    velocidad: 'VEL',
    tiro: 'TIR',
    regate: 'REG',
    pase: 'PAS',
    fuerza: 'FUE',
    defensa: 'DEF',
    atajada: 'ATA',
};

export const RASGOS = {
    CLUTCH: { id: 'CLUTCH', icono: '⏱', nombre: 'CLUTCH', desc: 'Remate un poco más fuerte en los últimos 20 segundos.' },
    CEREBRO: { id: 'CEREBRO', icono: '🧠', nombre: 'CEREBRO', desc: 'Pases un poco más tensos y precisos.' },
    'CAÑÓN': { id: 'CAÑÓN', icono: '💥', nombre: 'CAÑÓN', desc: 'Remate potente desde lejos.' },
    VELOZ: { id: 'VELOZ', icono: '⚡', nombre: 'VELOZ', desc: 'Un punto extra de velocidad punta.' },
    MURO: { id: 'MURO', icono: '🧱', nombre: 'MURO', desc: 'Arquero de reflejos rápidos / defensor que no se cansa de cerrar.' },
    GAMBETA: { id: 'GAMBETA', icono: '🌀', nombre: 'GAMBETA', desc: 'Conduce la pelota casi sin frenar.' },
    TANQUE: { id: 'TANQUE', icono: '🛡', nombre: 'TANQUE', desc: 'Gasta menos resistencia en el ida y vuelta.' },
    'PULMÓN': { id: 'PULMÓN', icono: '🫁', nombre: 'PULMÓN', desc: 'Recupera el aire más rápido.' },
};

/**
 * Identidad de juego de cada club (sesgo sobre la base de estrellas).
 * Valores en puntos que se suman a la base: positivos = fortaleza, negativos = debilidad.
 */
const PERFIL_CLUB = {
    retoneta: { velocidad: 4, tiro: 5, regate: 4, pase: 3, fuerza: 0, defensa: -2, atajada: 0 },
    el_boguero: { velocidad: 0, tiro: 3, regate: 0, pase: 1, fuerza: 6, defensa: 4, atajada: 2 },
    macabro: { velocidad: -1, tiro: 0, regate: -2, pase: 0, fuerza: 5, defensa: 7, atajada: 4 },
    cattarino: { velocidad: 3, tiro: 0, regate: 4, pase: 2, fuerza: -2, defensa: 0, atajada: -1 },
    barrio_fino: { velocidad: 0, tiro: 1, regate: 6, pase: 6, fuerza: -4, defensa: -1, atajada: 0 },
    choborra: { velocidad: -3, tiro: 4, regate: -2, pase: 0, fuerza: 7, defensa: 3, atajada: 0 },
    monarca: { velocidad: 2, tiro: 3, regate: 3, pase: 4, fuerza: 2, defensa: 2, atajada: 3 },
    norwhisky: { velocidad: 1, tiro: 2, regate: 0, pase: 0, fuerza: 4, defensa: 2, atajada: 1 },
    agustintos: { velocidad: 2, tiro: 0, regate: 1, pase: 3, fuerza: 0, defensa: 3, atajada: 2 },
    trotenham: { velocidad: 5, tiro: 4, regate: 2, pase: 1, fuerza: 0, defensa: -1, atajada: -1 },
    botajogo: { velocidad: 3, tiro: 1, regate: 7, pase: 3, fuerza: -3, defensa: -2, atajada: 0 },
    la_tikineta: { velocidad: 0, tiro: 0, regate: 5, pase: 8, fuerza: -3, defensa: 1, atajada: 0 },
    barranquineros: { velocidad: 2, tiro: 7, regate: 2, pase: 0, fuerza: 2, defensa: 0, atajada: 0 },
};

/** Sesgo por puesto (slot 0 = punta, 1 = volante, 2 = cierre, gk = arquero). */
const PERFIL_SLOT = {
    0: { velocidad: 4, tiro: 7, regate: 4, pase: -1, fuerza: -1, defensa: -8, atajada: -40 },
    1: { velocidad: 1, tiro: 0, regate: 3, pase: 7, fuerza: 0, defensa: 0, atajada: -40 },
    2: { velocidad: -1, tiro: -4, regate: -3, pase: 1, fuerza: 5, defensa: 8, atajada: -40 },
    gk: { velocidad: -12, tiro: -18, regate: -20, pase: -4, fuerza: 2, defensa: 4, atajada: 8 },
};

/** Rasgos firmados para jugadores icónicos (personajes reales del juego). */
const RASGOS_FIRMADOS = {
    retoneta: { 0: ['CLUTCH', 'CAÑÓN'], 1: ['CEREBRO'], 2: ['TANQUE'], gk: ['MURO'] },
    el_boguero: { 0: ['CLUTCH'], 2: ['TANQUE'] },
    macabro: { 2: ['MURO'], gk: ['MURO'] },
    monarca: { 0: ['CLUTCH'], 1: ['CEREBRO'] },
    trotenham: { 0: ['VELOZ', 'CAÑÓN'] },
    la_tikineta: { 0: ['GAMBETA'], 1: ['CEREBRO'] },
    barranquineros: { 0: ['CAÑÓN'], 2: ['PULMÓN'] },
    botajogo: { 0: ['GAMBETA'] },
};

export const LIMITES_MODIFICADORES = {
    velocidad: [0.96, 1.05],
    tiro: [0.95, 1.07],
    pase: [0.97, 1.04],
    stamina: [0.85, 1.15],
    reaccionArquero: [0.85, 1.12],
};

function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}

function hashTexto(s) {
    let h = 2166136261;
    const t = String(s || '');
    for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function estrellasDe(equipoId, catalogo) {
    const lista = Array.isArray(catalogo)
        ? catalogo
        : typeof globalThis !== 'undefined' && Array.isArray(globalThis.EQUIPOS)
        ? globalThis.EQUIPOS
        : [];
    const eq = lista.find((e) => e && e.id === equipoId);
    const n = eq && Number(eq.estrellas);
    return Number.isFinite(n) ? clamp(Math.round(n), 1, 5) : 3;
}

/**
 * Atributos deterministas de un jugador (mismo resultado siempre para el mismo club/slot).
 * @param {string} equipoId
 * @param {number|'gk'} slot
 */
export function atributosJugador(equipoId, slot = 0, { catalogo = null } = {}) {
    const est = estrellasDe(equipoId, catalogo);
    const base = 52 + est * 6; // 1★ 58 · 3★ 70 · 5★ 82
    const pc = PERFIL_CLUB[equipoId] || {};
    const ps = PERFIL_SLOT[slot] || PERFIL_SLOT[0];
    const semilla = hashTexto(`${equipoId}:${slot}`);
    const out = {};
    ATRIBUTOS_ORDEN.forEach((k, i) => {
        const ruido = ((semilla >>> (i * 3)) % 7) - 3; // -3..+3, determinista
        out[k] = clamp(Math.round(base + (pc[k] || 0) + (ps[k] || 0) + ruido), 40, 95);
    });
    return out;
}

/** Rasgos (máx. 2): primero los firmados del personaje, luego los que se ganan por atributos. */
export function rasgosJugador(equipoId, slot = 0, atributos = null) {
    const a = atributos || atributosJugador(equipoId, slot);
    const firm = ((RASGOS_FIRMADOS[equipoId] || {})[slot] || []).slice();
    const derivados = [];
    if (slot === 'gk') {
        if (a.atajada >= 84) derivados.push('MURO');
    } else {
        if (a.tiro >= 86) derivados.push('CAÑÓN');
        if (a.velocidad >= 85) derivados.push('VELOZ');
        if (a.pase >= 85) derivados.push('CEREBRO');
        if (a.regate >= 86) derivados.push('GAMBETA');
        if (a.defensa >= 86) derivados.push('MURO');
        if (a.fuerza >= 86) derivados.push('TANQUE');
    }
    const lista = [];
    for (const r of firm.concat(derivados)) {
        if (RASGOS[r] && !lista.includes(r)) lista.push(r);
        if (lista.length >= 2) break;
    }
    return lista;
}

/** Media general estilo "carta" (sin atajada para jugadores de campo). */
export function mediaJugador(atributos, slot = 0) {
    if (!atributos) return 0;
    if (slot === 'gk') {
        return Math.round(atributos.atajada * 0.6 + atributos.defensa * 0.2 + atributos.fuerza * 0.1 + atributos.pase * 0.1);
    }
    const claves = ['velocidad', 'tiro', 'regate', 'pase', 'fuerza', 'defensa'];
    return Math.round(claves.reduce((s, k) => s + atributos[k], 0) / claves.length);
}

/** Plantel completo con atributos, rasgos y media (para Mi Club / pre-partido). */
export function plantelConAtributos(equipoId, { catalogo = null } = {}) {
    const pl = PLANTELES[equipoId] || { campo: ['Capitán', 'Volante', 'Punta'], gk: 'Arquero' };
    const puestos = ['PUNTA', 'VOLANTE', 'CIERRE'];
    const out = pl.campo.map((nombre, i) => {
        const at = atributosJugador(equipoId, i, { catalogo });
        return { nombre, slot: i, puesto: puestos[i] || 'CAMPO', atributos: at, rasgos: rasgosJugador(equipoId, i, at), media: mediaJugador(at, i) };
    });
    const atGk = atributosJugador(equipoId, 'gk', { catalogo });
    out.push({ nombre: pl.gk, slot: 'gk', puesto: 'ARQUERO', atributos: atGk, rasgos: rasgosJugador(equipoId, 'gk', atGk), media: mediaJugador(atGk, 'gk') });
    return out;
}

/**
 * Convierte atributos + rasgos + estado de forma (Etapa 23) en multiplicadores suaves para el motor.
 * Todo neutro = 1.0. Los límites garantizan que nunca se rompa el balance.
 *
 * @param {object} atributos
 * @param {string[]} rasgos
 * @param {{etiqueta?: 'excelente'|'normal'|'cansado'}|null} forma
 */
export function modificadoresDesdeAtributos(atributos, rasgos = [], forma = null) {
    const a = atributos || {};
    const r = new Set(rasgos || []);
    const d = (k) => ((Number(a[k]) || 70) - 70) / 100; // -0.30..+0.25
    const L = LIMITES_MODIFICADORES;

    let velocidad = 1 + d('velocidad') * 0.1 + (r.has('VELOZ') ? 0.02 : 0) + (r.has('GAMBETA') ? 0.005 : 0);
    let tiro = 1 + d('tiro') * 0.15 + (r.has('CAÑÓN') ? 0.04 : 0);
    let pase = 1 + d('pase') * 0.08 + (r.has('CEREBRO') ? 0.025 : 0);
    let stamina = 1 - d('fuerza') * 0.2 - (r.has('TANQUE') ? 0.05 : 0) - (r.has('PULMÓN') ? 0.06 : 0);
    let reaccionArquero = 1 - d('atajada') * 0.3 - (r.has('MURO') ? 0.06 : 0);

    const et = forma && forma.etiqueta;
    if (et === 'excelente') {
        stamina -= 0.06;
        velocidad += 0.01;
    } else if (et === 'cansado') {
        stamina += 0.1;
        velocidad -= 0.015;
    }

    velocidad = clamp(velocidad, L.velocidad[0], L.velocidad[1]);
    tiro = clamp(tiro, L.tiro[0], L.tiro[1]);
    pase = clamp(pase, L.pase[0], L.pase[1]);
    stamina = clamp(stamina, L.stamina[0], L.stamina[1]);
    reaccionArquero = clamp(reaccionArquero, L.reaccionArquero[0], L.reaccionArquero[1]);

    return {
        velocidad: Math.round(velocidad * 1000) / 1000,
        tiro: Math.round(tiro * 1000) / 1000,
        pase: Math.round(pase * 1000) / 1000,
        stamina: Math.round(stamina * 1000) / 1000,
        reaccionArquero: Math.round(reaccionArquero * 1000) / 1000,
        clutch: r.has('CLUTCH'),
    };
}

/** Multiplicador extra de remate para rasgo CLUTCH en los últimos segundos. */
export function factorClutch(tieneClutch, segundosRestantes) {
    return tieneClutch && Number(segundosRestantes) <= 20 ? 1.05 : 1;
}

if (typeof globalThis !== 'undefined') {
    globalThis.AtributosChaquito = { atributosJugador, rasgosJugador, plantelConAtributos, modificadoresDesdeAtributos };
}

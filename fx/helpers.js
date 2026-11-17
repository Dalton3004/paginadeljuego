/** Utilidades FX (curvas, RNG, config). */
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// Generador propio: NO usa Math.random para no alterar la secuencia aleatoria del partido.
export function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
}

export const GLOBAL_DEF = { intensidad: 1, sacudida: 1, particulas: 1, estela: true, festejos: true };
export const PLAYER_DEF = { festejo: 'salto', estilo: 'normal', nervio: 1, rebote: 1, inclinacion: 1, respiracion: 1 };
export const ESTILOS = {
    normal:   { bob: 1.0,  lean: 1.0,  squash: 1.0,  stride: 1.0 },
    elastico: { bob: 1.3,  lean: 0.9,  squash: 1.25, stride: 1.1 },
    pesado:   { bob: 0.8,  lean: 1.25, squash: 0.8,  stride: 0.9 },
    ligero:   { bob: 1.1,  lean: 0.8,  squash: 1.0,  stride: 1.15 }
};

const FALLBACK_CURVES = {
    salto:   t => Math.max(0, 1 - Math.pow(2 * t - 1, 2)),
    rebote:  t => Math.cos(t * TAU * 2.2) * Math.exp(-4.2 * t),
    asentar: t => Math.cos(t * TAU * 1.4) * Math.exp(-5 * t),
    pulso:   t => Math.sin(Math.PI * t),
    patada:  t => (t < 0.22 ? -0.55 * Math.sin((t / 0.22) * Math.PI * 0.85)
                            : Math.cos(((t - 0.22) / 0.78) * Math.PI * 2.4) * Math.exp(-3.8 * ((t - 0.22) / 0.78))),
    zancada: t => Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.72)
};

export function userCfg() { return (globalThis.ANIMACIONES && typeof globalThis.ANIMACIONES === 'object') ? globalThis.ANIMACIONES : {}; }
export function accionesCfg() { return userCfg().acciones || {}; }

// Verifica si un cuadro existe en SPRITE_ATLAS (para no pedir un frame que no esté en el atlas).
export function hasFrame(group, name) {
    try {
        return !!(typeof SPRITE_ATLAS !== 'undefined' &&
                  SPRITE_ATLAS.groups &&
                  SPRITE_ATLAS.groups[group] &&
                  SPRITE_ATLAS.groups[group].frames &&
                  SPRITE_ATLAS.groups[group].frames[name]);
    } catch (e) { return false; }
}

export function sampleCurve(name, t) {
    t = clamp(t, 0, 1);
    const arr = userCfg().curvas && userCfg().curvas[name];
    if (Array.isArray(arr) && arr.length > 1) {
        const x = t * (arr.length - 1);
        const i = Math.floor(x), f = x - i;
        const a = arr[i], b = arr[Math.min(arr.length - 1, i + 1)];
        return a + (b - a) * f;
    }
    const fn = FALLBACK_CURVES[name] || FALLBACK_CURVES.pulso;
    return fn(t);
}

export const STAMINA_MAX = () => (typeof CONFIG !== 'undefined' && CONFIG.STAMINA_MAX) || 100;

export function neutral() {
    return { sx: 1, sy: 1, dx: 0, dy: 0, angle: 0, bobMul: 1, shadow: 1,
             frameName: null, slide: null, view: null, flipToggle: false };
}

// Resorte amortiguado para suavizar la inclinación
export function spring(s, target, k, c, dt) {
    const a = -k * (s.x - target) - c * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
}

// ================================================================
// Estado de animación de UN jugador (solo lectura sobre el Jugador)
// ================================================================

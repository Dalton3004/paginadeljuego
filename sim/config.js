/**
 * Liga Chaquito F8 - Etapa 3 (controles corregidos + menú final)
 * E = pase corto a compañero | R = centro / pase largo
 * Fin de partido → REVANCHA o MENÚ PRINCIPAL
 * HTML5 Canvas + JS puro
 */

// ============================================================
// CONFIGURACIÓN
// ============================================================
export const CONFIG = {
    WIDTH: 480,
    HEIGHT: 640,
    TARGET_FPS: 60,
    ASSETS_PATH: 'assets/',

    // Límites ajustados a las líneas blancas del sprite de cancha (480x640).
    // Los jugadores pueden entrar en la boca del arco para disputar pelotas
    // que quedan sobre la línea de fondo.
    FIELD: {
        LEFT: 78,
        RIGHT: 402,
        TOP: 99,
        BOTTOM: 572
    },

    // Boca real entre postes, línea de gol y fondo de red.
    GOAL_NORTH: { x: 188, y: 48, w: 104, h: 51, lineY: 99, backY: 48 },
    GOAL_SOUTH: { x: 188, y: 550, w: 104, h: 58, lineY: 572, backY: 608 },

    BALL_FRICTION: 0.968,          // más fricción → pelota más controlable y fluida
    BALL_BOUNCE: 0.80,
    BALL_RADIUS: 9,
    BALL_STOP_THRESHOLD: 0.10,

    // Altura de la pelota (eje Z, en píxeles de pantalla). 0 = rodando por el piso.
    BALL_GRAVITY: 0.30,            // caída por cuadro²
    BALL_AIR_FRICTION: 0.990,      // en el aire casi no se frena (por eso un pase elevado llega lejos)
    BALL_Z_BOUNCE: 0.55,           // cuánto de la velocidad vertical se conserva al picar
    BALL_Z_MIN_BOUNCE: 1.2,        // por debajo de esta caída ya no pica: rueda
    BALL_LANDING_DAMP: 0.55,       // el pique le saca velocidad horizontal
    BAR_HEIGHT: 30,                // altura del travesaño: por encima de esto el tiro pasa de largo
    CONTROL_Z: 12,                 // altura máxima para controlar la pelota con el cuerpo
    HEAD_Z_MIN: 8,                 // ventana de cabezazo (altura de la pelota)
    HEAD_Z_MAX: 31,
    HEAD_RANGE: 15,                // distancia máxima del jugador a la pelota para cabecear
    HEAD_POWER: 7.5,
    HEAD_VZ: 1.9,
    HEAD_COOLDOWN: 0.45,           // segundos antes de que el mismo jugador vuelva a cabecear
    LOB_VZ: 4.7,                   // impulso vertical de un pase elevado (R)
    SHOT_VZ_MIN: 0.6,              // un tiro suave casi no se eleva…
    SHOT_VZ_MAX: 4.0,              // …y uno cargado al máximo puede irse por arriba del travesaño

    PLAYER_SPEED: 2.55,            // base más ágil
    PLAYER_SPRINT: 3.55,
    STAMINA_MAX: 100,
    STAMINA_SPRINT_DRAIN: 32,
    STAMINA_RUN_DRAIN: 10,
    STAMINA_RECOVERY: 10,
    AI_SPEED_MULTIPLIER: 1.12,
    AI_ACCELERATION: 0.22,
    AI_STEERING: 0.16,
    AI_TARGET_SMOOTHING: 0.12,
    ATTACK_ADVANCE: 76,
    DEFENSE_RETREAT: 48,
    TACTICAL_BURST_SECONDS: 1.45,
    TACTICAL_SPRINT_MULTIPLIER: 1.62,
    PLAYER_RADIUS: 13,
    // Área propia para la IA: pelota a menos de AREA_PROFUNDIDAD de la línea de gol y a menos de
    // AREA_MITAD_ANCHO del centro del arco. Ahí el arquero (pelota suelta o rival que entra con ella) y
    // el defensor más cercano SALEN a buscarla (antes quedaba una zona muerta donde nadie la agarraba).
    // Rebote del arquero: la pelota sale a (velocidad con la que llegó) × GK_REBOTE_FACTOR, o sea PROPORCIONAL a la
    // potencia del tiro (antes tenía un piso fijo de 3,2 px/cuadro: un tiro suave salía despedido más rápido de lo que llegó).
    // Un tiro de GK_ATAJA_VEL o menos no se rebota: el arquero lo ataja y se queda con la pelota.
    GK_REBOTE_FACTOR: 0.48,
    GK_ATAJA_VEL: 2.8,
    AREA_PROFUNDIDAD: 96,
    AREA_MITAD_ANCHO: 130,
    DEFENSOR_PROF_NORMAL: 68,      // el defensor de IA no baja más de esto de la línea de gol…
    DEFENSOR_PROF_MIN: 16,         // …salvo que sea el que va a buscar una pelota en su área
    POSSESSION_RANGE: 17,
    KICK_POWER: 12.0,
    PASS_POWER: 6.5,          // E - pase corto
    LONG_PASS_POWER: 11.8,    // R - centro / pase largo
    PASS_POWER_BOOST: 2.0,    // potencia de los pases: 1.0 = original, 2.0 = +100% (tools/configurar_pases.py)
    PASS_POWER_MAX: 22,       // tope de velocidad inicial de un pase (px por cuadro)
    // Barridas nerfeadas: menos alcance, menos tiempo y más enfriamiento
    SLIDE_SPEED: 3.7,
    SLIDE_DURATION: 0.26,
    SLIDE_COOLDOWN: 1.15,
    SLIDE_RECOVERY: 0.32,
    SLIDE_STAMINA_COST: 28,   // cada barrida gasta resistencia (con <28 no se puede barrer): evita el spam
    SLIDE_HIT_RANGE: 22,      // si durante la barrida la pelota queda a esta distancia, se la sacás al rival
    // Barrida automática de los compañeros de IA (equipo del jugador): solo se tiran si, según la
    // trayectoria prevista del rival con pelota, van a llegar a ella; y con pausa larga entre intentos.
    ALIADO_BARRIDA_MARGEN: 0.45,     // la pelota debe quedar a <= SLIDE_HIT_RANGE × este factor del barredor (más bajo = más seguro)
    ALIADO_BARRIDA_MAX_FRAMES: 8,   // el contacto previsto con la pelota debe ocurrir en ≤ N cuadros (rival con poco tiempo de reaccionar)
    ALIADO_BARRIDA_ESPERA: 2.6,     // segundos mínimos entre dos barridas automáticas del mismo compañero
    ALIADO_BARRIDA_PROB: 0.55,      // aun con la jugada favorable, probabilidad de intentarla en cada chequeo (cada 0,2 s)
    ALIADO_BARRIDA_STAMINA_EXTRA: 20, // resistencia que debe sobrarle además del costo de la barrida
    // Intercepción de pases: un rival que cruza la trayectoria de un pase en vuelo se queda con la pelota.
    INTERCEPT_RANGE: 17,

    // Colisiones entre jugadores
    COLLISION_PUSH: 2.4,
    // Parámetros de estabilidad: corrigen penetraciones sin convertir cada frame
    // de contacto en un nuevo "golpe". Se mantienen separados de la velocidad
    // de movimiento para no alterar la jugabilidad general.
    COLLISION_SLOP: 0.35,
    COLLISION_CORRECTION_PERCENT: 0.90,
    COLLISION_MAX_CORRECTION: 4.50,
    COLLISION_RESTITUTION: 0.22,
    COLLISION_MAX_IMPULSE: 0.85,
    COLLISION_MIN_APPROACH_SPEED: 0.06,
    COLLISION_SOLVER_ITERATIONS: 3,
    // Invulnerabilidad breve del receptor: evita encadenar impactos en frames consecutivos.
    // La separación física sigue funcionando durante este período, pero no se generan
    // nuevos impulsos/aturdimientos sobre la misma víctima.
    COLLISION_RECEIVER_COOLDOWN: 0.32,
    HIT_STUN: 0.38,
    HIT_SLOW: 0.55,

    // Animación de sprites
    SPRITE_SCALE: 1.12,
    KICK_ANIM_SEC: 0.18,

    MATCH_SECONDS: 90,            // mitad de duración (antes 180)
    GOAL_CELEBRATION_SEC: 2.4,
    PREMATCH_LOAD_SEC: 2.5,
    KICKOFF_COUNTDOWN_SEC: 2.5
};

// ============================================================
// DIFICULTADES (afectan al equipo RIVAL; el equipo del jugador no cambia)
//   walkStep / chaseStep / sprintStep: velocidad máxima (px por cuadro) al moverse, perseguir y esprintar.
//   carryFactor: cuánto se frena al llevar la pelota (el jugador humano se frena a 0.76).
//   staminaDrain / staminaRecover: gasto y recuperación de energía al esprintar; restBelow: energía a la que deja de esprintar.
//   react: cada cuántos segundos decide (más bajo = más reflejos). shootDist/shootProb/shotPower/aimErr: remate.
//   passProb/pressureDist: pase al compañero libre cuando lo presionan. predict: anticipa la trayectoria de la pelota.
//   doublePress: dos jugadores presionan al que tiene la pelota. tackleProb/tackleMin/tackleMax: barridas.
//   gk: arquero (eta/look: cuándo reacciona y cuánto anticipa; cooldown, speed, diveSpeed, diveResp, follow, readLead, reach).
//   Calibrado con tools/simulate.js (bot hábil): FÁCIL ~10-0 para el jugador, NORMAL parejo, DIFÍCIL ~1.5-6 en contra.
//   El arquero del jugador usa siempre el perfil de arquero NORMAL (ver Game._initMatch).
// ============================================================
export const DIFICULTADES = {
    facil: {
        id: 'facil', nombre: 'FÁCIL', lema: 'Para entrar en calor',
        detalle: 'Rival lento, remata poco y su arquero tarda en reaccionar.',
        walkStep: 0.80, chaseStep: 1.40, sprintStep: 1.90, carryFactor: 0.76,
        staminaDrain: 1.0, staminaRecover: 1.0, restBelow: 50, sprintDist: 48,
        react: 0.40, shootDist: 150, shootProb: 0.30, shotPower: 0.90, aimErr: 0.25,
        passProb: 0.0, pressureDist: 0, predict: 0, doublePress: false,
        tackleProb: 0.22, tackleMin: 18, tackleMax: 42,
        gk: { eta: 1.5, look: 8, cap: 8, cooldown: 2.2, speed: 1.0, diveSpeed: 2.4, diveResp: 0.13, follow: 0.50, readLead: 0.12, reach: 0.9 }
    },
    normal: {
        id: 'normal', nombre: 'NORMAL', lema: 'Un partido parejo',
        detalle: 'Rival rápido que presiona, pasa y remata con puntería.',
        walkStep: 1.25, chaseStep: 2.00, sprintStep: 2.70, carryFactor: 0.85,
        staminaDrain: 0.7, staminaRecover: 1.3, restBelow: 40, sprintDist: 36,
        react: 0.18, shootDist: 175, shootProb: 0.50, shotPower: 1.06, aimErr: 0.12,
        passProb: 0.45, pressureDist: 34, predict: 0.6, doublePress: false,
        tackleProb: 0.45, tackleMin: 16, tackleMax: 48,
        gk: { eta: 5, look: 24, cap: 24, cooldown: 1.5, speed: 1.3, diveSpeed: 3.2, diveResp: 0.18, follow: 0.62, readLead: 0.30, reach: 1.1 }
    },
    dificil: {
        id: 'dificil', nombre: 'DIFÍCIL', lema: 'Equipo de élite: casi no perdona',
        detalle: 'Rival veloz e incansable: presión doble, anticipa tus pases, remata a las esquinas y tiene un arquero de primera.',
        walkStep: 1.50, chaseStep: 2.40, sprintStep: 3.00, carryFactor: 0.92,
        staminaDrain: 0.25, staminaRecover: 2.2, restBelow: 20, sprintDist: 22,
        react: 0.08, shootDist: 175, shootProb: 0.45, shotPower: 1.10, aimErr: 0.10,
        passProb: 0.7, pressureDist: 46, predict: 1.0, doublePress: true,
        tackleProb: 0.65, tackleMin: 14, tackleMax: 50,
        gk: { eta: 11, look: 32, cap: 32, cooldown: 1.1, speed: 1.7, diveSpeed: 4.0, diveResp: 0.28, follow: 0.80, readLead: 0.45, reach: 1.15 }
    }
};
const DIFICULTAD_ORDEN = ['facil', 'normal', 'dificil'];

export const EstadoPartido = {
    PREPARANDO: 'PREPARANDO',       // pantalla de carga pre-partido (~5s)
    CUENTA_REGRESIVA: 'CUENTA_REGRESIVA', // 3..2..1
    EN_JUEGO: 'EN_JUEGO',
    CELEBRANDO_GOL: 'CELEBRANDO_GOL',
    FINALIZADO: 'FINALIZADO'
};

// ============================================================
// TÁCTICAS (equipo del jugador) y ESTRELLAS DEL PLANTEL
// ============================================================
// 'f' = posiciones iniciales [desvío en X respecto del centro, Y] de los 3 jugadores de campo del equipo
// LOCAL (abajo); el rival usa la misma formación espejada. 'avance' = cuánto suben (>1) o se replegan (<1)
// los compañeros controlados por la IA al atacar / defender.
export const TACTICAS = {
    equilibrada: {
        id: 'equilibrada', nombre: 'EQUILIBRADA', lema: '1-2 · Un punta y dos de apoyo',
        detalle: 'El clásico: un delantero y dos que acompañan. Se sube y se repliega parejo.',
        avance: 1.0, f: [[0, 460], [-64, 500], [64, 500]]
    },
    ofensiva: {
        id: 'ofensiva', nombre: 'OFENSIVA', lema: '2-1 · Dos arriba',
        detalle: 'Dos delanteros y uno que cubre. Más pases y remates, pero te dejan expuesto al contraataque.',
        avance: 1.3, f: [[-62, 450], [62, 450], [0, 500]]
    },
    defensiva: {
        id: 'defensiva', nombre: 'DEFENSIVA', lema: '1-2 cerrado · Todos atrás',
        detalle: 'Un solo punta y dos defensores bien abajo. Cuesta pasarte y salís de contraataque.',
        avance: 0.7, f: [[0, 472], [-72, 500], [72, 500]]
    }
};
export const TACTICA_ORDEN = ['equilibrada', 'ofensiva', 'defensiva'];

// Estrellas (1..5) → factor de rendimiento de la IA de ese equipo: de 0,94 (1★) a 1,06 (5★).
export function factorEstrellas(estrellas) {
    const e = Math.max(1, Math.min(5, Math.round(Number(estrellas) || 3)));
    return 0.94 + 0.03 * (e - 1);
}

// Copia de un perfil de dificultad ajustada por las estrellas del equipo (no toca el perfil original).
export function perfilConEstrellas(base, estrellas) {
    const k = factorEstrellas(estrellas);
    if (!base || k === 1) return base;
    const gk = base.gk ? Object.assign({}, base.gk, {
        speed: base.gk.speed * k,
        diveSpeed: base.gk.diveSpeed * k,
        eta: base.gk.eta * k,
        look: base.gk.look * k,
        readLead: base.gk.readLead * k,
        reach: base.gk.reach * k,
        cooldown: base.gk.cooldown / k
    }) : base.gk;
    return Object.assign({}, base, {
        walkStep: base.walkStep * k, chaseStep: base.chaseStep * k, sprintStep: base.sprintStep * k,
        react: base.react / k, shotPower: base.shotPower * k, aimErr: base.aimErr / k,
        passProb: Math.min(1, base.passProb * k), tackleProb: Math.min(1, base.tackleProb * k), gk
    });
}

// Compat browser (scripts clásicos / depuración)
if (typeof globalThis !== 'undefined') {
    globalThis.CONFIG = CONFIG;
    globalThis.DIFICULTADES = DIFICULTADES;
    globalThis.EstadoPartido = EstadoPartido;
    globalThis.TACTICAS = TACTICAS;
    globalThis.TACTICA_ORDEN = TACTICA_ORDEN;
    globalThis.factorEstrellas = factorEstrellas;
    globalThis.perfilConEstrellas = perfilConEstrellas;
}

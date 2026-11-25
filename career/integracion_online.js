/**
 * ETAPA 32 — INTEGRACIÓN Y FRONTERA DE SEGURIDAD ONLINE.
 *
 * Separa de forma explícita y auditable todas las funcionalidades de Liga Chaquito F8 en:
 *   A) SISTEMAS OFFLINE (prohibidos en simulación online para evitar desincronización)
 *   B) SISTEMAS ONLINE AUTORITATIVOS (calculados exclusivamente en el servidor)
 *   C) SISTEMAS COSMÉTICOS / UX (seguros en cliente local sin impacto competitivo)
 */

export const CLASIFICACION_SISTEMAS = Object.freeze({
    offline: Object.freeze([
        'liga_offline',
        'copa_chaquito',
        'supercopa_chaquito',
        'modo_desafios',
        'modo_arcade',
        'modo_historia',
        'conferencias_prensa',
        'atributos_rasgos_plantel',
        'forma_y_cansancio',
        'tanda_penales_ia',
    ]),
    onlineAutoritativo: Object.freeze([
        'simulacion_partido_online',
        'matchmaking_cola',
        'salas_privadas_amigos',
        'reconexion_token',
        'revancha_sincronizada',
        'estadisticas_verificables_servidor',
        'ranking_puntos_online',
    ]),
    cosmeticos: Object.freeze([
        'celebraciones_gol',
        'radio_comentarios_textuales',
        'hinchada_visual_y_audio',
        'clima_visual_local',
        'replay_goles_cliente',
        'accesibilidad_daltonismo_contraste_tactil',
        'insignia_equipo_favorito',
    ]),
});

/** Modos aceptados por `POST /api/partido` desde cliente (nunca online ni modos experimentales). */
export const MODOS_CLIENTE_HISTORIAL_PERMITIDOS = Object.freeze([
    'solo',
    'liga',
    'copa',
    'supercopa',
    'historia',
]);

/**
 * Valida que un intento de registro desde cliente no falsifique partidos competitivos Online
 * ni inyecte modos experimentales (Arcade / Desafíos) en estadísticas oficiales.
 */
export function validarPayloadPartidoCliente(payload = {}) {
    if (!payload || typeof payload !== 'object') {
        return { permitido: false, motivo: 'Payload inválido.' };
    }
    const modo = String(payload.modo || 'solo');
    if (modo === 'online') {
        return {
            permitido: false,
            status: 403,
            motivo: 'Los partidos online solo los registra de forma autoritativa el servidor.',
        };
    }
    if (modo === 'arcade' || modo === 'desafio') {
        return {
            permitido: false,
            status: 403,
            motivo: 'Los modos Arcade y Desafíos están aislados de las estadísticas oficiales.',
        };
    }
    if (!MODOS_CLIENTE_HISTORIAL_PERMITIDOS.includes(modo)) {
        return {
            permitido: false,
            status: 400,
            motivo: 'Modo de partido no reconocido.',
        };
    }
    return { permitido: true, modo };
}

/**
 * Limpia en la instancia cliente cualquier modificador o estado de modos offline/arcade
 * al entrar a una partida Online 1v1, evitando desincronizaciones con `partido_online.js`.
 */
export function aislarClienteParaOnline(game) {
    if (!game) return;
    game.modoLiga = null;
    game.modoCopa = null;
    game.modoSupercopa = null;
    game.modoDesafio = null;
    game.modoArcade = null;
    game.modoHistoria = null;
    game._ctrlArcade = null;
    game._arcadeFinalizarTrasFestejo = false;

    if (game.ball) {
        game.ball.arcadePowerMult = 1;
    }
    if (Array.isArray(game.players)) {
        for (const p of game.players) {
            if (!p) continue;
            p.attrMods = null;
            p._arcadeFuria = false;
            p._clutchActivo = false;
        }
    }
}

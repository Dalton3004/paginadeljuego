/**
 * Entry del cliente (esbuild ESM).
 * Un solo módulo reemplaza la cadena de <script> y los ?v= manuales.
 */
import '../utils_ui.js';
import { startGame } from '../game.js';

// Mixins de Game (side-effect: Object.assign sobre Game.prototype)
import '../game/menu.js';
import '../game/online.js';
import '../game/equipos.js';
import '../game/tactil.js';
import '../game/audio.js';
import '../game/clima.js';
import '../game/eventos_especiales.js';
import '../game/hinchada_dinamica.js';
import '../game/replay.js';
import '../game/penales.js';
import '../game/noticias_ui.js';
import '../game/mi_club_ui.js';
import '../game/modos_extra_ui.js';
import '../game/navegacion_ui.js';
import '../game/fase_d_partido.js';
import '../game/postpartido.js';
import '../game/input.js';
import '../game/render.js';

// UI / social (enganchan botones del DOM)
import '../social.js';
import { SettingsUI } from '../settings.js';

// Telemetría: errores del cliente + latencia hacia el servidor
import { crearTelemetria } from '../net/telemetria.js';

// Arranque
function boot() {
    const telemetria = crearTelemetria();
    telemetria.instalarHandlersGlobales();
    // Latencia cada 15 s, solo con la pestaña visible (no gasta datos en segundo plano)
    setInterval(() => {
        if (document.visibilityState === 'visible') telemetria.medirLatencia();
    }, 15000);

    startGame('gameCanvas');
    // Settings panel si existe el hit
    try {
        if (typeof SettingsUI !== 'undefined' && SettingsUI.enganchar) SettingsUI.enganchar();
    } catch (e) { /* optional */ }
}

// PWA: service worker (carga rápida y Solo/Liga sin conexión). Falla en silencio si el navegador no lo soporta.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

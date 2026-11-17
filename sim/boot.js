/**
 * Arranque browser tras cargar sim ES: inyecta el resto de scripts en orden.
 */
import './browser-globals.js';

const scripts = [
    'game/preloader.js?v=33',
    'net/netsync.js?v=32',
    'game.js?v=38',
    'game/menu.js?v=32',
    'game/online.js?v=41',
    'game/equipos.js?v=37',
    'game/tactil.js?v=34',
    'game/audio.js?v=33',
    'game/input.js?v=38',
    'game/render.js?v=40',
];

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('No se pudo cargar ' + src));
        document.body.appendChild(s);
    });
}

(async () => {
    for (const src of scripts) {
        await loadScript(src);
    }
})().catch((e) => console.error('[boot]', e));

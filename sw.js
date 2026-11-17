/* Service Worker (F8 8.3): el juego carga rápido y Solo/Liga siguen andando sin conexión después de la primera visita.
 * Es un script clásico (sin import/export). Sube CACHE cuando cambie VERSION_JUEGO en config.js.
 *
 * - API, sockets, métricas y admin: SIEMPRE red (nunca se cachean).
 * - Navegación (index.html): red primero; si no hay conexión, la última copia.
 * - /a/*-hash.js y /assets/*: caché primero (son inmutables).
 * - Resto (css, json, js sueltos): sirve la copia y la refresca en segundo plano.
 */
const CACHE = "chaquito-v38";
const RUTAS_RED = ["/api", "/socket.io", "/health", "/metrics", "/metrics.json", "/client-errors", "/admin", "/data"];

function esRed(pathname) {
    return RUTAS_RED.some((r) => pathname === r || pathname.startsWith(r + "/"));
}
// Mismos criterios que el server (Cache-Control immutable): bundle con hash y medios; los .json/.js de assets NO.
const esInmutable = (p) =>
    /^\/a\/.+-[a-f0-9]{8,}\.(js|css)$/i.test(p) ||
    (p.startsWith("/assets/") && /\.(png|jpe?g|gif|webp|svg|ico|mp3|ogg|wav|woff2?|ttf|otf)$/i.test(p));

async function guardar(cache, req, resp) {
    // Solo respuestas completas: un 206 (audio por rangos) rompe cache.put.
    if (resp && resp.status === 200 && resp.type !== "opaque") await cache.put(req, resp.clone());
    return resp;
}

async function responder(req) {
    const url = new URL(req.url);
    const cache = await caches.open(CACHE);
    if (req.mode === "navigate") {
        try {
            const r = await fetch(req);
            await guardar(cache, "/", r);
            return r;
        } catch {
            return (await cache.match("/")) || new Response("Sin conexión", { status: 503 });
        }
    }
    const hit = await cache.match(req);
    if (esInmutable(url.pathname)) {
        if (hit) return hit;
        return guardar(cache, req, await fetch(req));
    }
    const red = fetch(req).then((r) => guardar(cache, req, r));
    if (hit) {
        red.catch(() => {});
        return hit;
    }
    return red;
}

function debeIntervenir(req) {
    if (req.method !== "GET" || req.headers.has("range")) return false;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return false;
    return !esRed(url.pathname);
}

self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) =>
    e.waitUntil(
        caches
            .keys()
            .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    ),
);
self.addEventListener("fetch", (e) => {
    if (debeIntervenir(e.request)) e.respondWith(responder(e.request));
});

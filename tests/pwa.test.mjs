// PWA (F8 8.3): manifest, íconos reales y comportamiento del service worker (sin navegador).
// node --test tests/pwa.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION_JUEGO } from '../config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const leer = (f) => readFileSync(ROOT + f);

describe('manifest e íconos', () => {
    const m = JSON.parse(leer('manifest.json').toString('utf8'));
    test('manifest mínimo instalable', () => {
        assert.ok(m.name && m.short_name);
        assert.equal(m.start_url, '/');
        assert.ok(['standalone', 'fullscreen'].includes(m.display));
        assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
    });
    test('íconos 192 y 512 son PNG reales del tamaño declarado', () => {
        for (const ic of m.icons) {
            const b = leer(ic.src.slice(1));
            assert.equal(b.subarray(1, 4).toString(), 'PNG');
            const [w, h] = ic.sizes.split('x').map(Number);
            assert.equal(b.readUInt32BE(16), w);
            assert.equal(b.readUInt32BE(20), h);
        }
        assert.deepEqual(m.icons.map((i) => i.sizes).sort(), ['192x192', '512x512']);
    });
    test('index.html enlaza el manifest', () => {
        assert.match(leer('index.html').toString('utf8'), /<link rel="manifest" href="\/manifest\.json">/);
    });
});

describe('service worker', () => {
    const src = leer('sw.js').toString('utf8');

    function crearSW({ online = true } = {}) {
        const almacen = new Map();
        const cache = {
            match: async (k) => almacen.get(typeof k === 'string' ? k : k.url)?.clone(),
            put: async (k, r) => void almacen.set(typeof k === 'string' ? k : k.url, r),
        };
        const llamadas = [];
        const handlers = {};
        const ctx = {
            URL, Response, Promise, Map,
            self: { location: { origin: 'http://x' }, addEventListener: (t, f) => (handlers[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } },
            caches: { open: async () => cache, keys: async () => [], delete: async () => true },
            fetch: async (req) => {
                llamadas.push(req.url);
                if (!online) throw new Error('offline');
                return new Response('cuerpo:' + req.url, { status: 200 });
            },
        };
        vm.runInNewContext(src, ctx);
        const pedir = async (url, { method = 'GET', mode = 'cors', range = false } = {}) => {
            const req = { url: 'http://x' + url, method, mode, headers: { has: (h) => range && h === 'range' } };
            let promesa = null;
            handlers.fetch({ request: req, respondWith: (p) => (promesa = p) });
            return promesa ? await promesa : null; // null = el SW no intervino
        };
        return { pedir, llamadas, almacen, ctx };
    }

    test('el nombre de caché sigue a VERSION_JUEGO', () => {
        assert.equal(src.match(/const CACHE = "([^"]+)"/)[1], 'chaquito-' + VERSION_JUEGO);
    });

    test('API, sockets, métricas y admin nunca se interceptan', async () => {
        const sw = crearSW();
        for (const u of ['/api/ranking', '/socket.io/?EIO=4', '/health', '/metrics', '/client-errors', '/admin', '/api/admin/estado']) {
            assert.equal(await sw.pedir(u), null, u);
        }
    });

    test('POST y pedidos con Range no se interceptan', async () => {
        const sw = crearSW();
        assert.equal(await sw.pedir('/assets/x.png', { method: 'POST' }), null);
        assert.equal(await sw.pedir('/assets/musica.mp3', { range: true }), null);
    });

    test('medios inmutables: caché primero (la segunda vez no toca la red)', async () => {
        const sw = crearSW();
        await sw.pedir('/assets/sprites/atlas.png');
        await sw.pedir('/assets/sprites/atlas.png');
        assert.equal(sw.llamadas.length, 1);
    });

    test('equipos.json y css NO son inmutables: se refrescan en segundo plano', async () => {
        const sw = crearSW();
        await sw.pedir('/assets/equipos.json');
        await sw.pedir('/assets/equipos.json');
        await new Promise((r) => setImmediate(r));
        assert.equal(sw.llamadas.length, 2);
    });

    test('navegación sin conexión devuelve la última copia de "/"', async () => {
        const sw = crearSW();
        await sw.pedir('/', { mode: 'navigate' });
        const off = crearSW({ online: false });
        off.almacen.set('/', new Response('copia vieja', { status: 200 }));
        const r = await off.pedir('/', { mode: 'navigate' });
        assert.equal(await r.text(), 'copia vieja');
    });

    test('no cachea respuestas que no son 200', async () => {
        const sw = crearSW();
        sw.ctx.fetch = async () => new Response('x', { status: 206 });
        await sw.pedir('/assets/a.mp3');
        assert.equal(sw.almacen.size, 0);
    });
});

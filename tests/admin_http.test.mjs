// Panel admin y perfil por HTTP contra el servidor real (proceso hijo, ADMIN_TOKEN definido).
// node --test tests/admin_http.test.mjs
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOKEN = 'token-de-prueba-123';

function puertoLibre() {
    return new Promise((resolve, reject) => {
        const s = createServer();
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close((err) => (err ? reject(err) : resolve(port)));
        });
        s.on('error', reject);
    });
}

describe('admin y perfil HTTP', () => {
    let base;
    let child;
    let dataDir;

    before(async () => {
        const port = await puertoLibre();
        base = `http://127.0.0.1:${port}`;
        dataDir = mkdtempSync(join(tmpdir(), 'liga-admin-'));
        const dataFile = join(dataDir, 'liga.json');
        writeFileSync(dataFile, JSON.stringify({ cuentas: [], sesiones: [], partidos: [] }));
        child = spawn(process.execPath, ['server.js'], {
            cwd: ROOT,
            env: { ...process.env, PORT: String(port), LIGA_DATA: dataFile, ADMIN_TOKEN: TOKEN, NODE_ENV: 'test' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout.on('data', () => {});
        child.stderr.on('data', () => {});
        const t0 = Date.now();
        for (;;) {
            try {
                if ((await fetch(base + '/api/version')).ok) break;
            } catch {
                /* todavía arrancando */
            }
            if (Date.now() - t0 > 12000) throw new Error('el servidor no arrancó');
            await new Promise((r) => setTimeout(r, 50));
        }
    });

    after(() => {
        if (child && !child.killed) child.kill('SIGTERM');
        if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    });

    test('/admin sirve la página sin datos', async () => {
        const r = await fetch(base + '/admin');
        assert.equal(r.status, 200);
        assert.match(r.headers.get('content-type'), /html/);
        assert.doesNotMatch(await r.text(), new RegExp(TOKEN));
    });

    test('/api/admin/estado exige el token', async () => {
        assert.equal((await fetch(base + '/api/admin/estado')).status, 401);
        const mal = await fetch(base + '/api/admin/estado', { headers: { Authorization: 'Bearer otro' } });
        assert.equal(mal.status, 401);
    });

    test('/api/admin/estado con token devuelve salas, cola y métricas', async () => {
        const r = await fetch(base + '/api/admin/estado', { headers: { Authorization: 'Bearer ' + TOKEN } });
        assert.equal(r.status, 200);
        const j = await r.json();
        assert.equal(j.ok, true);
        assert.ok(Array.isArray(j.salas) && Array.isArray(j.cola));
        assert.ok(j.metricas && j.metricas.gauges);
    });

    test('/api/perfil sin sesión da 401', async () => {
        assert.equal((await fetch(base + '/api/perfil')).status, 401);
    });

    test('sw.js y manifest.json se sirven', async () => {
        const sw = await fetch(base + '/sw.js');
        assert.equal(sw.status, 200);
        assert.match(await sw.text(), /chaquito-v/);
        assert.equal((await fetch(base + '/manifest.json')).status, 200);
    });
});

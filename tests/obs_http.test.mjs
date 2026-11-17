// /metrics, /metrics.json y /client-errors contra el servidor real (proceso hijo).
// node --test tests/obs_http.test.mjs
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

describe('observabilidad HTTP', () => {
    let base;
    let child;
    let dataDir;

    before(async () => {
        const port = await puertoLibre();
        base = `http://127.0.0.1:${port}`;
        dataDir = mkdtempSync(join(tmpdir(), 'liga-obs-'));
        const dataFile = join(dataDir, 'liga.json');
        writeFileSync(dataFile, JSON.stringify({ cuentas: [], sesiones: [], partidos: [] }));
        child = spawn(process.execPath, ['server.js'], {
            cwd: ROOT,
            env: { ...process.env, PORT: String(port), LIGA_DATA: dataFile, NODE_ENV: 'test' },
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

    test('/client-errors acepta el reporte y /metrics lo refleja', async () => {
        const r = await fetch(base + '/client-errors', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mensaje: 'boom', latencia_ms: 42 }),
        });
        assert.equal(r.status, 204);
        const txt = await (await fetch(base + '/metrics')).text();
        assert.match(txt, /partidos_activos \d+/);
        assert.match(txt, /cola \d+/);
        assert.match(txt, /errores_cliente_total [1-9]/);
        assert.match(txt, /latencia_ms\{q="p95"\}/);
    });

    test('/metrics.json devuelve gauges, counters y series', async () => {
        const j = await (await fetch(base + '/metrics.json')).json();
        assert.ok('gauges' in j && 'counters' in j && 'series' in j);
    });

    test('/client-errors rechaza un cuerpo que no es objeto', async () => {
        const r = await fetch(base + '/client-errors', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify('texto suelto'),
        });
        assert.ok(r.status === 400);
    });

    test('la carpeta obs/ no se sirve como estático', async () => {
        const r = await fetch(base + '/obs/metrics.js');
        assert.equal(r.status, 404);
    });
});

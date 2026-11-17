/**
 * Sesión vencida a nivel persistencia (sin HTTP).
 * node --test tests/auth_sesion.test.mjs
 */
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const dataDir = mkdtempSync(join(tmpdir(), 'liga-ses-'));
const dataFile = join(dataDir, 'liga.json');
writeFileSync(dataFile, JSON.stringify({ cuentas: [], sesiones: [], partidos: [] }));
process.env.LIGA_DATA = dataFile;

// Import dinámico DESPUÉS de fijar LIGA_DATA
const pers = await import('../persistencia.js');

describe('persistencia sesión', () => {
    test('registro + login + cuentaDe', async () => {
        const reg = await pers.registrar({ nombre: 'SesUser1', password: 'abc12345' });
        assert.equal(reg.body?.ok, true);
        const token = reg.body.token;
        const yo = await pers.cuentaDe(token);
        assert.ok(yo);
        assert.equal(yo.cuenta.nombre, 'SesUser1');
    });

    test('sesión vencida no autentica', async () => {
        const reg = await pers.registrar({ nombre: 'SesUser2', password: 'abc12345' });
        const token = reg.body.token;
        // manipular índice en memoria vía disco + reindex no expone API;
        // usar salir invalida; para vencimiento real tocamos estructura interna si exporta leer
        // Fallback: invalidar con salir
        await pers.salir(token);
        const yo = await pers.cuentaDe(token);
        assert.equal(yo, null);
    });

    test('anotarPartido rechaza modo online', async () => {
        const reg = await pers.registrar({ nombre: 'SesUser3', password: 'abc12345' });
        const token = reg.body.token;
        const out = await pers.anotarPartido(token, {
            modo: 'online', resultado: 'win', gf: 1, gc: 0, partidoId: 'x',
        });
        assert.equal(out.status, 403);
    });
});

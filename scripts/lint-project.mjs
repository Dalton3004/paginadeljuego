#!/usr/bin/env node
/**
 * Linter de Arquitectura, Frontera Online, PWA, SQL y Dockerfile — Liga Chaquito F8.
 *
 * Inspirado en reglas de repositorios >1.000★ (hadolint/hadolint ★12.5k+,
 * webpro-nl/knip ★12.7k+, htmlhint/HTMLHint ★3.3k+) y adaptado a las invariantes
 * reales de este proyecto:
 *   1) Sincronía PWA: VERSION_JUEGO (config.js) === CACHE (sw.js) + iconos de manifest.json.
 *   2) Integridad HTML/Assets: cero IDs duplicados y todos los src/href locales existen en disco.
 *   3) Frontera Online Autoritativa (Etapa 32): módulos del servidor 60Hz y del motor puro sim/*
 *      no pueden tocar DOM (`window.`, `document.`, `localStorage.`) ni importar mutadores offline.
 *   4) Migraciones SQL seguras (Etapa 33): schema.sql usa `IF NOT EXISTS` en tablas, índices y columnas.
 *   5) Estándares Dockerfile (Hadolint DL3006/DL3007/DL3025/DL4000): imagen fijada, WORKDIR absoluto,
 *      NODE_ENV=production y CMD en formato JSON exec.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const errores = [];
const avisos = [];

function err(cat, msg) {
    errores.push(`[${cat}] ${msg}`);
}
function warn(cat, msg) {
    avisos.push(`[${cat}] ${msg}`);
}

function leerTexto(rel) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
        err('ARCHIVO', `No existe el archivo requerido: ${rel}`);
        return '';
    }
    return readFileSync(abs, 'utf8');
}

// ---------------------------------------------------------------------------
// 1. PWA & Service Worker Cache Sync
// ---------------------------------------------------------------------------
{
    const cfg = leerTexto('config.js');
    const sw = leerTexto('sw.js');
    const mVer = /VERSION_JUEGO\s*=\s*["']([^"']+)["']/.exec(cfg);
    const mSw = /CACHE\s*=\s*["']chaquito-([^"']+)["']/.exec(sw);
    if (!mVer) err('PWA', 'No se encontró VERSION_JUEGO en config.js');
    if (!mSw) err('PWA', 'No se encontró CACHE = "chaquito-..." en sw.js');
    if (mVer && mSw && mVer[1] !== mSw[1]) {
        err('PWA', `Desincronización de caché: config.js (${mVer[1]}) !== sw.js (${mSw[1]})`);
    }

    const manifestRaw = leerTexto('manifest.json');
    if (manifestRaw) {
        try {
            const manifest = JSON.parse(manifestRaw);
            for (const ic of manifest.icons || []) {
                const rel = String(ic.src || '').replace(/^\//, '');
                if (!rel || !existsSync(join(ROOT, rel))) {
                    err('PWA', `Icono declarado en manifest.json no existe en disco: ${ic.src}`);
                }
            }
        } catch (e) {
            err('PWA', `manifest.json inválido: ${e.message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// 2. HTML5 Asset & Unique ID Integrity
// ---------------------------------------------------------------------------
{
    const html = leerTexto('index.html');
    const ids = new Map();
    for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
        const id = m[1];
        ids.set(id, (ids.get(id) || 0) + 1);
    }
    for (const [id, count] of ids.entries()) {
        if (count > 1) err('HTML', `ID duplicado en index.html: #${id} (${count} veces)`);
    }

    for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
        const ref = m[1];
        if (/^(?:https?:|data:|mailto:|#)/.test(ref)) continue;
        const limpio = ref.split('?')[0].replace(/^\//, '');
        if (limpio && !existsSync(join(ROOT, limpio))) {
            err('HTML', `Recurso referenciado en index.html no existe: ${ref}`);
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Frontera Online Autoritativa (Etapa 32) y pureza del motor sim/*
// ---------------------------------------------------------------------------
{
    const archivosServidorAutoritativo = [
        'server.js',
        'partido_online.js',
        'onlineSockets.js',
        'matchmaking.js',
        'salas.js',
        'estado.js',
    ];

    const archivosSimPuros = existsSync(join(ROOT, 'sim'))
        ? readdirSync(join(ROOT, 'sim'))
              .filter((f) => f.endsWith('.js') && f !== 'browser-globals.js' && f !== 'boot.js')
              .map((f) => `sim/${f}`)
        : [];

    for (const rel of [...archivosServidorAutoritativo, ...archivosSimPuros]) {
        const src = leerTexto(rel);
        // Quitar comentarios para evitar falsos positivos
        const sinComentarios = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');

        if (/\b(?:document|localStorage|sessionStorage)\s*\./.test(sinComentarios)) {
            err('ONLINE-BOUNDARY', `${rel} accede directamente a APIs de navegador prohibidas en servidor Node.`);
        }
        if (
            archivosServidorAutoritativo.includes(rel) &&
            /from\s+['"]\.\/career\/(?:arcade|desafios|atributos|forma|historia)\.js['"]/.test(sinComentarios)
        ) {
            err(
                'ONLINE-BOUNDARY',
                `${rel} importa sistemas exclusivos offline dentro del servidor autoritativo Online.`
            );
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Migraciones SQL Seguras (schema.sql — Etapa 33)
// ---------------------------------------------------------------------------
{
    const sql = leerTexto('schema.sql');
    const sinComentarios = sql.replace(/--.*$/gm, '');
    for (const rawStmt of sinComentarios.split(';')) {
        const stmt = rawStmt.replace(/\s+/g, ' ').trim();
        if (!stmt) continue;
        const upper = stmt.toUpperCase();
        if (upper.startsWith('CREATE TABLE ') && !upper.startsWith('CREATE TABLE IF NOT EXISTS ')) {
            err('SQL', `CREATE TABLE sin IF NOT EXISTS en schema.sql: "${stmt.slice(0, 60)}..."`);
        }
        if (
            (upper.startsWith('CREATE INDEX ') || upper.startsWith('CREATE UNIQUE INDEX ')) &&
            !upper.includes(' INDEX IF NOT EXISTS ')
        ) {
            err('SQL', `CREATE INDEX sin IF NOT EXISTS en schema.sql: "${stmt.slice(0, 60)}..."`);
        }
        if (upper.includes(' ADD COLUMN ') && !upper.includes(' ADD COLUMN IF NOT EXISTS ')) {
            err('SQL', `ALTER TABLE ADD COLUMN sin IF NOT EXISTS en schema.sql: "${stmt.slice(0, 60)}..."`);
        }
    }
}

// ---------------------------------------------------------------------------
// 5. Estándares Dockerfile (referencia: hadolint/hadolint DL3006/DL3007/DL3025/DL4000)
// ---------------------------------------------------------------------------
{
    const docker = leerTexto('Dockerfile');
    if (/\bMAINTAINER\b/i.test(docker)) {
        err('DOCKER-DL4000', 'Instrucción MAINTAINER obsoleta en Dockerfile.');
    }
    const fromMatch = /^FROM\s+([^\s]+)/m.exec(docker);
    if (!fromMatch) {
        err('DOCKER', 'Falta instrucción FROM en Dockerfile.');
    } else if (!fromMatch[1].includes(':') || fromMatch[1].endsWith(':latest')) {
        err('DOCKER-DL3006/DL3007', `La imagen base debe fijar versión explícita (no :latest): ${fromMatch[1]}`);
    }
    const workdirMatch = /^WORKDIR\s+([^\s]+)/m.exec(docker);
    if (!workdirMatch || !workdirMatch[1].startsWith('/')) {
        err('DOCKER-DL3000', 'WORKDIR debe usar una ruta absoluta en Dockerfile.');
    }
    const cmdMatch = /^CMD\s+(.+)$/m.exec(docker);
    if (!cmdMatch || !cmdMatch[1].trim().startsWith('[')) {
        err('DOCKER-DL3025', 'CMD debe usar notación JSON exec (ej. CMD ["node", "server.js"]).');
    }
    if (!/\bNODE_ENV\s*=\s*production\b/.test(docker)) {
        warn('DOCKER', 'Se recomienda definir ENV NODE_ENV=production en Dockerfile.');
    }
}

if (avisos.length) {
    for (const w of avisos) console.warn(`⚠ ${w}`);
}
if (errores.length) {
    for (const e of errores) console.error(`✖ ${e}`);
    console.error(`\n[lint:project] Falló con ${errores.length} error(es).`);
    process.exit(1);
}

console.log('✓ [lint:project] PWA, HTML/Assets, Frontera Online, SQL y Dockerfile verificados sin errores.');

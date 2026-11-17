/**
 * Build del cliente con esbuild (bundle ESM + hash + index.html).
 */
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    rmSync,
    readdirSync,
    statSync,
    unlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT_DIR = join(DIST, 'a');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

await esbuild.build({
    entryPoints: [join(ROOT, 'client/main.js')],
    bundle: true,
    format: 'esm',
    sourcemap: true,
    minify: true,
    target: ['es2020'],
    outfile: join(OUT_DIR, 'main.js'),
    logLevel: 'info',
});

const raw = readFileSync(join(OUT_DIR, 'main.js'));
const hash = createHash('sha256').update(raw).digest('hex').slice(0, 10);
const hashedName = `main-${hash}.js`;
writeFileSync(join(OUT_DIR, hashedName), raw);
if (existsSync(join(OUT_DIR, 'main.js.map'))) {
    writeFileSync(join(OUT_DIR, `main-${hash}.js.map`), readFileSync(join(OUT_DIR, 'main.js.map')));
    unlinkSync(join(OUT_DIR, 'main.js.map'));
}
unlinkSync(join(OUT_DIR, 'main.js'));

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
html = html.replace(/src="\/?client\/main\.js"/, `src="/a/${hashedName}"`);
writeFileSync(join(DIST, 'index.html'), html);

// Copiar media de assets (imágenes, audio, json); omitir .js empaquetados
function copyMedia(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
        const from = join(src, name);
        const to = join(dest, name);
        const st = statSync(from);
        if (st.isDirectory()) copyMedia(from, to);
        else if (!name.endsWith('.js')) cpSync(from, to);
    }
}
if (existsSync(join(ROOT, 'assets'))) copyMedia(join(ROOT, 'assets'), join(DIST, 'assets'));
if (existsSync(join(ROOT, 'css'))) {
    mkdirSync(join(DIST, 'css'), { recursive: true });
    for (const name of readdirSync(join(ROOT, 'css'))) {
        if (name.endsWith('.css')) {
            // Hashear CSS liviano o copiar tal cual (rutas estables /css/*.css)
            const rawCss = readFileSync(join(ROOT, 'css', name));
            writeFileSync(join(DIST, 'css', name), rawCss);
        }
    }
}

// PWA: manifest y service worker (el server también los sirve desde la raíz como respaldo)
for (const f of ['manifest.json', 'sw.js']) {
    if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(DIST, f));
}

// index en dist: mismos links /css/*
console.log(`[build] cliente → dist/a/${hashedName} (${(raw.length / 1024).toFixed(1)} KB)`);

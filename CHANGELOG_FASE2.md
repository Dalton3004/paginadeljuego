# FASE 2 — RENDIMIENTO Y PERSISTENCIA

Base: Liga Chaquito F8 etapa4 + FASE 1 (seguridad).

## 2.1 Persistencia JSON
- Datos en memoria, escritura debounced async (tmp+rename, ~400 ms).
- `.bak` + copias diarias; `forzarGuardado` + SIGTERM/SIGINT.

## 2.2 Índices en memoria
- Map token→sesión, Map nombre→cuenta, ranking cache 3 s, limpieza de sesiones cada 5 min.

## 2.3 Tick 60 Hz vs HTTP (este punto)
- Cada `tickSala` se mide con `process.hrtime.bigint()`.
- Presupuesto = `1000/TICK_HZ` (~16.67 ms). Warning si se supera; soft-warn al 85%.
- Warnings con cooldown 2 s para no inundar el log.
- Al finalizar un partido, `guardarRankingSala` se agenda con `setImmediate` (no corre dentro del tick).
- Endpoints admin de respaldo/restaurar ceden el event loop (`setImmediate`) tras parsear JSON grande.
- Login/registro/cambiar-clave ya usan `scrypt` async (FASE 1); persistencia no hace I/O sync por request (2.1).
- `/api/salud` incluye stats de tick: `avgMs`, `maxMs`, `overBudget`, `budgetMs`.

### Archivos tocados (2.3)
- `server.js` — medición de tick, setImmediate ranking, yield admin, `/api/salud`

### Cómo probar
```bash
npm test
# Con el server levantado y un partido online:
#   curl -s localhost:3001/api/salud | jq .tick
# Forzar log: no debería aparecer `[tick] ... tardó` en carga normal.
```

## 2.4 Equipos compartidos (JSON)
- Fuente de verdad: `assets/equipos.json` (13 equipos + estrellas).
- `partido_online.js` deja de parsear `assets/equipos.js` con regex; lee el JSON con `JSON.parse`.
- Cliente sigue usando `assets/equipos.js` (`const EQUIPOS = ...`) alineado al mismo contenido.
- Cache bust del script: `?v=25`.

### Archivos tocados (2.4)
- `assets/equipos.json` (nuevo)
- `assets/equipos.js`
- `partido_online.js`
- `index.html` (versión del script)

### Cómo probar
```bash
npm test
node -e "import('./partido_online.js').then(()=>console.log('ok'))"
```

## 2.5 Compresión HTTP y caché de assets
- Middleware `compression` (gzip/deflate, threshold 1 KB).
- HTML / JS / CSS / JSON: `Cache-Control: no-cache` (revalidan siempre).
- Imágenes, audio y fuentes: `Cache-Control: public, max-age=31536000, immutable`
  (el cliente ya usa `?v=` como bust; URL distinta ⇒ caché nueva).

### Archivos tocados (2.5)
- `server.js`
- `package.json` (+ `compression`)

### Cómo probar
```bash
npm test
node server.js &
curl -sI -H 'Accept-Encoding: gzip' http://localhost:3001/index.html | grep -iE 'cache-control|content-encoding'
curl -sI -H 'Accept-Encoding: gzip' http://localhost:3001/assets/opt/cancha.webp | grep -iE 'cache-control|content-encoding'
```

## 2.6 Assets ligeros + preloader real
- PNG grandes → WebP (sin perder calidad práctica):
  - `menu_modos_pc/mobile` (~1.4 MB → ~185 KB)
  - `sprites/atlas.webp` lossless (~1.6 MB → ~1.3 MB)
  - `fans_atlas.webp`, carteles `ui/*.webp`
- Música bajo demanda: solo se descarga la pista en uso; canto de hinchada al entrar al partido.
- Preloader en 2 fases: menú primero (pocos KB), partido en segundo plano / al tocar Jugar.
- Progreso real por **bytes** (XHR + tamaños del manifiesto), no solo conteo de archivos.

### Archivos tocados (2.6)
- `assets/**/*.webp` (nuevos)
- `game/preloader.js`, `game.js`, `game/audio.js`, `game/equipos.js`, `game/online.js`
- `index.html`, `assets/hinchada/fans.js`

### Cómo probar
```bash
npm test
# Abrir el juego: la barra debe mostrar "Cargando X KB / Y KB" y el menú aparecer rápido.
# Network: no debe bajar las 3 pistas de música ni hinchada_cancha hasta reproducir / partido.
```

## Fix teclas al cambiar jugador
- Al cambiar con **Q** (o al pasar el control al que recibe la pelota) se **conservan** WASD/flechas/Shift (y el joystick táctil) si siguen apretados.
- Antes se reseteaban a 0 y había que volver a tocar las teclas (imposible de jugar en carrera).
- Estado `_heldMove` compartido teclado + stick; se limpia solo al pausar / UI.

Archivos: `game.js`, `game/input.js`, `game/tactil.js`, `index.html` (cache bust v34).

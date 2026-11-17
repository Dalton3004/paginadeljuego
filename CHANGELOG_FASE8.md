# FASE 8 — OBSERVABILIDAD, CI Y CARGA

Base: etapa5 / FASE 5.5.2 + entregable F8 (fusionado).

## 8.1 Métricas
- `obs/metrics.js`: gauges (`partidos_activos`, `cola`), contadores (`errores_servidor`, `errores_cliente`) y series con p50/p95/max (`tick_ms`, `latencia_ms`).
- `GET /metrics` (texto tipo Prometheus) y `GET /metrics.json`.
- `salas.js` observa `tick_ms` en cada `tickSala`; los gauges se refrescan al consultar (`salas.size`, `cola.length`).

## 8.2 Errores (Sentry opcional)
- `obs/errors.js`: `registrarError` (log JSON + contador), `instalarHandlersGlobales` (uncaughtException / unhandledRejection).
- Sentry **desactivado por defecto**; se activa con `SENTRY_ENABLED=1` + `SENTRY_DSN` (y `@sentry/node`, declarado como dependencia opcional).
- El loop de cada sala ahora captura excepciones del tick y las registra, en vez de tumbar el proceso.

## 8.3 Errores y latencia del cliente
- `net/telemetria.js` (importado por `client/main.js`): captura `error` / `unhandledrejection` y mide RTT a `/health` cada 15 s (solo con la pestaña visible).
- `POST /client-errors`: rate limit por IP (30/min), campos acotados, observa `latencia_ms`.
- `/obs/*` queda fuera de los estáticos.

## 8.4 CI y test de carga
- `.github/workflows/ci.yml`: lint → build → tests → loadtest.
- `scripts/loadtest.mjs`: N `Partido` reales avanzando juntos; falla si el p95 del tick total supera `1000/TICK_HZ` (o `TICK_BUDGET_MS`).
- `tests/obs.test.mjs`, `tests/obs_http.test.mjs`, `tests/carga.test.mjs`.
- `npm run loadtest`, `npm run test:obs`, `npm run test:carga`.

### Archivos
- nuevos: `obs/*`, `net/telemetria.js`, `scripts/loadtest.mjs`, `tests/obs*.mjs`, `tests/carga.test.mjs`, `.github/workflows/ci.yml`, `.gitignore`
- modificados: `server.js`, `salas.js`, `client/main.js`, `package.json`


# FASES 6 / 7 / 8 — INTEGRACIÓN (entregables fase6, fase7 y fase8)

Los entregables F6/F7/F8 estaban escritos contra un motor y un menú **de prueba** (CommonJS, `http` plano,
menús dibujados en un canvas de 640×360). Pisar los archivos del juego con esos nombres (`server.js`, `config.js`,
`liga.js`, `ranking.js`, `persistencia.js`, `game/*`, `net/netsync.js`…) habría roto el juego real, así que
se integró **solo lo que el juego real no tenía**, adaptado a su arquitectura (ESM + Express + Socket.IO).

## Integrado
- **6.5 Perfil** — `perfil.js` + `GET /api/perfil`: totales, efectividad, racha actual y mejor racha,
  vallas invictas y 6 logros, sobre los últimos 30 partidos de la cuenta.
- **6.8 Panel admin** — `GET /admin` (página) y `GET /api/admin/estado` (salas activas, cola, métricas, almacenamiento).
  Mismo `ADMIN_TOKEN` que el respaldo; sin token definido responden 404; con rate limit.
- **6.7 Créditos** — `CREDITS.md` con los assets reales. Falta completar autor/licencia (marcado COMPLETAR).
- **8.3 PWA** — `manifest.json`, íconos 192/512, `sw.js` (caché de medios y bundle, red primero para el HTML,
  API/sockets nunca), registro en `client/main.js`, `index.html` y copia en `dist/` desde el build.
  Sube `CACHE` en `sw.js` cuando cambie `VERSION_JUEGO` (hay un test que lo verifica).
- **8.4 Vibración** — al hacer gol, con opción en Configuración → Partido; se apaga con «Reducir animaciones».
- **8.6 Replay** — `sim/replay.js` (buffer de ~5 s). Módulo y tests listos; **todavía sin dibujar en pantalla**.

## No integrado (y por qué)
- Menús y pantallas de canvas (pausa, tutorial, perfil, sala de espera, cola, ranking, ajustes, accesibilidad),
  `config.js`, `game/input.js`, `game/tactil.js` editable, HUD y `render_world.js`: dependen del menú de prueba;
  el juego real ya tiene su propio menú, ajustes, cola con ventana de nivel, táctil y HUD.
- Liga (7.5), equipos/tácticas (7.2): el juego real ya tiene `liga.js` y equipos propios más completos.
- 6.3 Estadísticas del partido (posesión, tiros, pases, barridas): la versión entregada adivina a partir de rebotes
  de una pelota de prueba; en el motor real hay que contarlas desde los eventos del motor.
- 7.6 Ranking por período/búsqueda/paginación y borrar cuenta (7.7): requieren tocar `persistencia_json.js` **y**
  `persistencia_pg.js`.
- 8.5 Accesibilidad (daltónico, fuente, contraste), 8.7 hinchada dinámica, 8.8 cámara/climas/camisetas.

### Archivos
- nuevos: `perfil.js`, `sim/replay.js`, `manifest.json`, `sw.js`, `assets/icon-192.png`, `assets/icon-512.png`, `CREDITS.md`,
  `tests/perfil.test.mjs`, `tests/replay.test.mjs`, `tests/pwa.test.mjs`, `tests/admin_http.test.mjs`
- modificados: `rutas/admin.js`, `rutas/partidos.js`, `server.js`, `index.html`, `client/main.js`, `scripts/build-client.mjs`,
  `settings.js`, `game.js`, `game/audio.js`, `package.json`

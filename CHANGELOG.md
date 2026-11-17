## FIX7
- **Liga:** `liga.js` no se importaba en ningún lado, así que `game.liga` quedaba en `null` y el botón Liga no hacía nada. Ahora `game.js` lo importa.
- **Música:** tope general de volumen (x0.35 sobre el slider), entrada con fundido de 2 s, canto de la hinchada de 32% a 14% y soundtrack del partido a máx. 2%.

# Changelog

Resumen por fase. El detalle técnico de cada una está en `CHANGELOG_FASE1.md`, `_FASE2.md`, `_FASE3.md` y `_FASE8.md`.

## Entrega final — fusión F6 / F7 / F8
### Agregado
- **Observabilidad:** `/metrics`, `/metrics.json`, registro de errores con Sentry opcional (apagado por defecto), `POST /client-errors`, telemetría del cliente (errores y latencia cada 15 s con la pestaña visible).
- **CI** (GitHub Actions: lint, build, tests, test de carga) y `scripts/loadtest.mjs` con el `Partido` real.
- **Perfil** `GET /api/perfil`: totales, efectividad, rachas, vallas invictas y 6 logros (últimos 30 partidos).
- **Panel admin** `/admin` y `GET /api/admin/estado` (salas activas, cola, métricas).
- **PWA:** `manifest.json`, íconos 192/512, `sw.js`; Solo y Liga siguen andando sin conexión tras la primera visita.
- **Vibración al gol** con opción en Configuración → Partido.
- `sim/replay.js` (buffer de ~5 s), sin dibujar todavía.
- `CREDITS.md`, `README.md`, `MIGRACION.md`, `PENDIENTES.md`.
- Tests nuevos: `obs`, `obs_http`, `carga`, `perfil`, `replay`, `pwa`, `admin_http`.
### Cambiado
- El loop de cada sala captura excepciones del tick y las registra en vez de tumbar el proceso.
- `/obs/*` queda fuera de los archivos estáticos.
- `package.json`: scripts `loadtest`, `test:obs`, `test:carga`, `test:pwa`, `test:f6`; `@sentry/node` como dependencia opcional.
### Sin cambios de datos
- No se tocó el esquema de `liga.json` ni de PostgreSQL. Ver `MIGRACION.md`.

## Fase 5 — Tests
- Suite con `node --test`; tests de servidor HTTP + Socket.IO y de sesión (`tests/`).

## Fase 4 — Estructura y herramientas
- Servidor dividido en módulos (`config`, `estado`, `matchmaking`, `salas`, `onlineSockets`, `rutas/`).
- `sim/` como ES modules; bundler esbuild con hash; CSS propio; render y fx divididos.
- ESLint 9 + Prettier 3. Sin `console.log` en pases.

## Fase 3 — Online robusto
- Reconexión (congela la sala 15 s; 3-0 por abandono), salas privadas por código, matchmaking por ventana de nivel, revancha, una cuenta = una actividad, ping y aviso de versión nueva, invitaciones a amigos.

## Fase 2 — Rendimiento y persistencia
- Persistencia JSON con escritura atómica, copias `.bak` y diarias; índices en memoria; tick a 60 Hz medido; equipos compartidos.

## Fase 1 — Seguridad
- Solo y Liga no suman al ranking global; el cliente no puede anotar partidos online; validación de resultados y tope por hora; rate limit y bloqueo por intentos de login.

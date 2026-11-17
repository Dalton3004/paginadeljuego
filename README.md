# Liga Chaquito F8

Juego de fútbol 4 vs 4 para navegador (PC y celular): partido **Solo**, **Liga** offline, **Online** 1 vs 1 con
matchmaking por nivel, salas privadas, revancha, reconexión, ranking, cuentas y amigos.
Servidor Node.js (Express + Socket.IO); cliente en módulos ES empaquetado con esbuild.

## Requisitos
- Node.js **18 o superior** (CI usa 20).
- Opcional: PostgreSQL (si no, guarda en un archivo `liga.json`).

## Empezar
```bash
npm install
npm run build        # genera dist/ (cliente con hash, css, assets, manifest y service worker)
npm start            # http://127.0.0.1:3001
```
`npm run dev` hace build + start. Sin `dist/` el servidor sirve el árbol fuente, pero sin el bundle.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm test` | Toda la suite (`node --test`). Los tests de servidor levantan un proceso hijo. |
| `npm run test:sim` · `test:net` · `test:online` · `test:server` · `test:obs` · `test:pwa` · `test:f6` · `test:carga` | Partes de la suite |
| `npm run loadtest` | 20 partidos simultáneos con el `Partido` real; falla si el p95 del tick supera 1000/60 ms |
| `npm run lint` · `lint:fix` · `format` · `format:check` · `lint:all` | ESLint 9 y Prettier 3 |

## Estructura
| Ruta | Contenido |
|---|---|
| `server.js`, `config.js`, `estado.js` | Entrada, constantes y mapas compartidos |
| `matchmaking.js`, `salas.js`, `onlineSockets.js`, `partido_online.js` | Online: cola, salas, tick 60 Hz, sockets |
| `rutas/` | API HTTP: `auth`, `ranking`, `partidos` (+ `/api/perfil`), `amigos`, `admin` |
| `persistencia*.js`, `schema.sql` | Cuentas, ranking y partidos (JSON o PostgreSQL) |
| `perfil.js` | Estadísticas, rachas y logros del jugador |
| `obs/`, `net/telemetria.js` | Métricas, errores (Sentry opcional) y telemetría del cliente |
| `sim/` | Motor del partido (ES modules) y `replay.js` |
| `game/`, `game.js`, `fx/`, `css/`, `index.html`, `client/main.js` | Cliente |
| `manifest.json`, `sw.js` | PWA |
| `scripts/` | `build-client.mjs`, `loadtest.mjs` |
| `tests/` | Suite `node --test` |

## Endpoints útiles
| Ruta | Para qué | Acceso |
|---|---|---|
| `GET /health`, `/api/version` | Estado y versión | público |
| `GET /api/salud`, `/api/estado-servidor` | Tick, cola y salas | público |
| `GET /metrics`, `/metrics.json` | Métricas (texto tipo Prometheus / JSON) | público |
| `POST /client-errors` | Errores y latencia que reporta el cliente | público, 30/min por IP |
| `GET /api/perfil` | Perfil de la cuenta | sesión |
| `GET /admin`, `GET /api/admin/estado` | Panel y estado en vivo | `ADMIN_TOKEN` |
| `GET /api/admin/respaldo`, `POST /api/admin/restaurar` | Respaldo y restauración de cuentas | `ADMIN_TOKEN` |

El token de admin va en `Authorization: Bearer <ADMIN_TOKEN>` (o `?clave=`). Sin `ADMIN_TOKEN` definido, todo `/admin` y `/api/admin/*` responde 404.

## Variables de entorno
Ninguna es obligatoria para correr en tu PC.

**Servidor**
| Variable | Default | Uso |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP |
| `CORS_ORIGIN` | vacío (permite cualquier origen) | `same`, `*` o lista separada por comas de orígenes permitidos |
| `ADMIN_TOKEN` | vacío (admin apagado) | Clave del panel, respaldo y restauración |
| `NODE_ENV` | — | Se informa a Sentry como entorno |

**Almacenamiento de cuentas** (se usa el primero que aplique)
| Variable | Uso |
|---|---|
| `DATABASE_URL` / `DATABASE_PRIVATE_URL` | Si existe, usa PostgreSQL en vez de `liga.json` |
| `PGSSL` | `1`, `true` o `require` activa SSL hacia Postgres |
| `LIGA_DATA` | Ruta completa del archivo JSON |
| `LIGA_DATA_DIR`, `DATA_DIR`, `RAILWAY_VOLUME_MOUNT_PATH` | Carpeta (p. ej. un Volume) donde vive `liga.json` |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | Respaldo remoto en Upstash Redis |
| `GITHUB_TOKEN` (o `GIST_TOKEN`) + `GIST_ID` | Respaldo remoto en un GitHub Gist |

**Observabilidad**
| Variable | Uso |
|---|---|
| `SENTRY_ENABLED=1` + `SENTRY_DSN` | Activa Sentry (requiere instalar `@sentry/node`, que es dependencia opcional). Apagado por defecto |
| `TICK_BUDGET_MS` | Solo para `npm run loadtest`: presupuesto de p95 en ms |

**Solo detección de hosting** (no hace falta definirlas; las pone la plataforma): `RAILWAY_ENVIRONMENT`, `RENDER`, `FLY_APP_NAME`, `GLITCH_DOMAIN`. Si detecta uno de esos hostings sin disco persistente ni respaldo remoto, avisa en el log que las cuentas se borrarán en cada deploy.

## Más documentación
- `DEPLOY.md` — publicar en Railway, Glitch o Fly.io.
- `MIGRACION.md` — mover o actualizar los datos de cuentas.
- `PENDIENTES.md` — lo que quedó sin hacer y por qué.
- `CHANGELOG.md` — historial por fase; el detalle de cada una está en `CHANGELOG_FASE*.md`.
- `CREDITS.md` — créditos y privacidad (hay campos por completar).

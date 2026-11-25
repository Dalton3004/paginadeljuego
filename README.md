# Liga Chaquito F8

Juego de fútbol arcade 4 vs 4 para navegador (PC y celular): **Solo**, **Liga Chaquito**, **Copa Chaquito**, **Supercopa**, campaña **Modo Historia**, **Desafíos**, **Chaquito Arcade**, central **Mi Club** (con prensa, rivalidades, premios, palmarés permanente y récords reales) y **Online** 1 vs 1 autoritativo a 60 Hz con matchmaking por nivel, salas privadas, revancha, reconexión, ranking, cuentas y amigos.
Servidor Node.js (Express + Socket.IO); cliente en módulos ES empaquetado con esbuild y PWA instalable.

## Requisitos
- Node.js **20 o superior**.
- Opcional: PostgreSQL (si no se configura `DATABASE_URL`, guarda en `liga.json` con escritura atómica).

## Empezar
```bash
npm install
npm run build        # genera dist/ (cliente con hash, css, assets, manifest y service worker; 0 warnings)
npm start            # http://127.0.0.1:3001
```
`npm run dev` ejecuta `build` + `start`.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm test` | Suite completa (`19` archivos `node --test`: motor, IA, red, servidor, seguridad y Fases A–F) |
| `npm run test:sim` · `test:net` · `test:online` · `test:server` · `test:obs` · `test:pwa` · `test:f6` · `test:carga` | Subconjuntos rápidos de la suite |
| `npm run loadtest` | 20 partidos simultáneos a 60 Hz con el `Partido` real; falla si el p95 supera `16.67 ms` |
| `npm run lint` | Suite de **7 linters**: ESLint 9 (`unicorn` + `security` + `promise`) + Oxlint + Stylelint + HTMLHint + Markdownlint + Knip + `lint-project.mjs` |
| `npm run lint:eslint` · `lint:oxlint` · `lint:css` · `lint:html` · `lint:md` · `lint:knip` · `lint:project` | Ejecución individual por capa de linter |
| `npm run lint:fix` · `format` · `format:check` | Autocorrección ESLint/Stylelint y formato Prettier 3 |

## Estructura
| Ruta | Contenido |
|---|---|
| `server.js`, `config.js`, `estado.js` | Entrada HTTP/WS, constantes y estado en memoria |
| `matchmaking.js`, `salas.js`, `onlineSockets.js`, `partido_online.js` | Online autoritativo: cola, salas, tick 60 Hz y sockets |
| `rutas/` | API HTTP: `auth`, `ranking`, `partidos` (+ `/api/perfil`), `amigos`, `admin` |
| `persistencia*.js`, `schema.sql` | Cuentas, ranking, equipo favorito y carrera (JSON o PostgreSQL con migraciones seguras) |
| `sim/` | Motor físico 4v4, IA, estadísticas reales, valoración, penales y `replay.js` |
| `career/` | Liga/carrera: noticias, conferencias, reputación, objetivos, premios, desafíos, arcade, atributos, forma, historia, accesibilidad, balance y récords |
| `liga.js`, `copa.js`, `supercopa.js`, `perfil.js`, `social.js`, `ranking.js`, `settings.js` | Competiciones oficiales, perfil social y ajustes |
| `game/`, `game.js`, `fx/`, `assets/`, `css/`, `index.html`, `client/main.js` | Cliente Canvas 2D, UI, clima, hinchada dinámica y efectos |
| `obs/`, `net/` | Sincronización de red (`netsync.js`), métricas Prometheus y telemetría |
| `manifest.json`, `sw.js` | PWA e invalidación de caché (`chaquito-v49`) |
| `scripts/` | `build-client.mjs`, `loadtest.mjs` y `lint-project.mjs` |
| `tests/` | Batería automatizada (`node:test`) |

## Endpoints útiles
| Ruta | Para qué | Acceso |
|---|---|---|
| `GET /health`, `/api/version` | Estado y versión | público |
| `GET /api/salud`, `/api/estado-servidor` | Tick, cola y salas | público |
| `GET /metrics`, `/metrics.json` | Métricas (Prometheus / JSON) | público |
| `POST /client-errors` | Errores y latencia reportados por el cliente | público, 30/min por IP |
| `GET /api/perfil` | Perfil deportivo de la cuenta | sesión |
| `PUT /api/perfil/favorito` | Guardar explícitamente el club favorito de la cuenta | sesión |
| `GET /api/carrera`, `PUT /api/carrera` | Sincronizar estado de carrera, palmarés y récords | sesión |
| `GET /admin`, `GET /api/admin/estado` | Panel y estado en vivo | `ADMIN_TOKEN` |
| `GET /api/admin/respaldo`, `POST /api/admin/restaurar` | Respaldo y restauración de cuentas | `ADMIN_TOKEN` |

El token de admin va en `Authorization: Bearer <ADMIN_TOKEN>` (o `?clave=`). Sin `ADMIN_TOKEN` definido, todo `/admin` y `/api/admin/*` responde 404.

## Variables de entorno
Ninguna es obligatoria para correr en local.

**Servidor**
| Variable | Default | Uso |
|---|---|---|
| `PORT` | `3001` | Puerto HTTP |
| `CORS_ORIGIN` | vacío (permite cualquier origen) | `same`, `*` o lista separada por comas de orígenes permitidos |
| `ADMIN_TOKEN` | vacío (admin apagado) | Clave del panel, respaldo y restauración |
| `NODE_ENV` | — | Entorno informado a Sentry y logs |

**Almacenamiento de cuentas** (se usa el primero que aplique)
| Variable | Uso |
|---|---|
| `DATABASE_URL` / `DATABASE_PRIVATE_URL` | Si existe, usa PostgreSQL en vez de `liga.json` |
| `PGSSL` | `1`, `true` o `require` activa SSL hacia Postgres |
| `LIGA_DATA` | Ruta completa del archivo JSON |
| `LIGA_DATA_DIR`, `DATA_DIR`, `RAILWAY_VOLUME_MOUNT_PATH` | Carpeta persistente donde vive `liga.json` |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (o `KV_REST_API_URL` + `KV_REST_API_TOKEN`) | Respaldo remoto en Upstash Redis |
| `GITHUB_TOKEN` (o `GIST_TOKEN`) + `GIST_ID` | Respaldo remoto en un GitHub Gist |

**Observabilidad**
| Variable | Uso |
|---|---|
| `SENTRY_ENABLED=1` + `SENTRY_DSN` | Activa Sentry (`@sentry/node` opcional). Apagado por defecto |
| `TICK_BUDGET_MS` | Presupuesto de p95 en ms para `npm run loadtest` |

## Más documentación
- `RELEASE_CHECKLIST.md` — entrega oficial `v1.0.0` (features, build, deploy y checklist de release).
- `DEPLOY.md` — publicar en Railway, Render, Docker o Fly.io.
- `MIGRACION.md` — mover o actualizar datos de cuentas.
- `PENDIENTES.md` — estado de cierre y decisiones de arquitectura.
- `CHANGELOG.md` — historial general; detalle por etapa en `CHANGELOG_FASE_A.md` … `CHANGELOG_FASE_F.md`.
- `CREDITS.md` — créditos y privacidad.

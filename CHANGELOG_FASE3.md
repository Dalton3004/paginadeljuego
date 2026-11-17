# FASE 3 — ONLINE ROBUSTO

Base: etapa4 + FASE 1–2 (+ fix teclas held).

## 3.1 Reconexión
- Si un jugador se desconecta a mitad de partido, la sala se **congela 15 s**.
- El rival recibe `rival_reconectando` → UI **"Rival reconectando…"** (cuenta regresiva).
- Cada lado obtiene un `reconnectToken` en `partido_listo` (identificador de sesión).
- Al volver, el cliente emite `reconectar_partido { token }` y recupera el control.
- Si no vuelve a tiempo: **3-0** por abandono para quien quedó, ranking vía `anotarOnline`, evento `victoria_abandono`.
- Salida voluntaria del menú: `abandonar_partido` (sin ventana de gracia, mismo 3-0).

### Archivos
- `server.js`, `partido_online.js`, `game/online.js`, `tests/online.test.mjs`, `index.html`


## 3.2 Salas privadas por código
- Además del matchmaking público (`buscar_partido`), el host puede **crear sala privada**.
- Código corto **5 caracteres** (alfabeto sin I/O/0/1); el cliente acepta **4–6**.
- Eventos: `crear_sala_privada`, `unirse_sala_privada`, `cancelar_sala_privada`, `sala_privada_creada`.
- UI: lobby online (Buscar rival / Crear sala / Unirse con código) tras elegir equipo.
- Si el host se desconecta o cancela, el código se libera.

### Archivos
- `server.js`, `game/online.js`, `game/equipos.js`, `index.html`


## 3.3 Matchmaking por ventana de nivel
- Cola pública guarda **pts de ranking** y hora de entrada.
- Ventana inicial **±80 pts**; cada **4 s** se amplía **+40** (tope ±2500).
- Se empareja si la diferencia de pts entra en la ventana del que más espera.
- Cada 1 s: reintento de empareje + `en_cola` con `{ posicion, segundos, ventana, pts }`.
- UI: reloj en cola, puesto, ventana y pts; **CANCELAR** emite `cancelar_busqueda`.

### Archivos
- `server.js`, `game/online.js`, `index.html`


## 3.4 Revancha
- Al pasar a **FINALIZADO** se abre ventana de **45 s** para votar revancha.
- Evento `revancha { aceptar }` — ambos `true` → **nuevo partido con lados invertidos** (equipos, cuentas, Local/Visitante).
- `revancha_estado` (votos + segundos) y `revancha_resultado` (ok / rechazo / timeout / desconexión).
- UI: botón **REVANCHA** pide; menú rechaza. Mensajes de espera al rival.
- Desconexión o menú durante la ventana cuenta como rechazo.

### Archivos
- `server.js`, `game/online.js`, `game/input.js`, `game.js`


## 3.5 Una cuenta = una actividad
- Mapa `cuentaActiva`: cola / sala privada / partido.
- Misma cuenta en otra sesión → `busqueda_rechazada` o ack de error (privada).
- No se emparejan dos sockets con la misma cuenta.
- Se libera al salir de cola, cancelar privada o destruir sala.
- Reconexión de partido revalida la ocupación.

### Archivos
- `server.js`, `game/online.js`


## 3.6 Ping + versión del servidor
- **PING** en partido online (canvas + `#hud-ping`): verde &lt;80 ms, amarillo &lt;150, rojo ≥150; "MALO" ≥250.
- Versión de build `VERSION_JUEGO` (`v36`): `/api/version`, `/health`, evento socket `servidor_info`.
- Si la versión cambia: banner **"Hay una versión nueva… Recargá"** (RECARGAR / DESPUÉS).
- Chequeo HTTP cada 60 s + al conectar el socket.

### Archivos
- `server.js`, `game/online.js`, `game/render.js`, `index.html`


## 3.7 Invitaciones a amigos
- **Presencia**: `presencia_hello` / `presencia_consulta` → `online` | `ocupado` | `offline`.
- Lista de amigos con punto de color y botón **▶** (invitar a sala privada) si está en línea libre.
- `invitar_amigo` crea/reusa sala privada y manda `invitacion_partida` al socket del amigo.
- Popup ACEPTAR / RECHAZAR; aceptar une a la sala con un toque.
- Polling de presencia cada 8 s con el panel AMIGOS abierto.

### Archivos
- `server.js`, `game/online.js`, `social.js`, `index.html`

## 4.1 Estructura del servidor
- `server.js` (~250 líneas): arma Express, estáticos, wire de rutas y sockets.
- `config.js` — PORT, VERSION, ticks, MM, CORS, ADMIN.
- `estado.js` — mapas compartidos (cola, salas, presencia, cuentas).
- `matchmaking.js` — cola, ventana de nivel, privadas (código), presencia, emparejar.
- `salas.js` — crearSala, tick 60 Hz, reconexión, revancha, abandono.
- `onlineSockets.js` — handlers Socket.IO.
- `rutas/auth.js`, `ranking.js`, `partidos.js`, `amigos.js`, `admin.js`.

### Archivos nuevos
- config.js, estado.js, matchmaking.js, salas.js, onlineSockets.js, rutas/*

## 4.2 sim/ como módulos ES
- `sim/*.js` con `import`/`export` (config, vector, pelota, jugador, jugador_ia, gestor, movilidad).
- `sim/index.js` barrel; `sim/browser-globals.js` + `sim/boot.js` para el cliente.
- `sim_offline.js` importa ES modules — **sin `vm`**.
- Tests (`sim`, `netsync`, `online`) sin cambios de comportamiento.

### Archivos
- `sim/*`, `sim_offline.js`, `index.html`


## 4.3 Bundler cliente (esbuild) + módulos
- Entry único `client/main.js` → bundle ESM hasheado en `dist/a/main-<hash>.js`.
- Sin cadena de ~28 `<script>` ni `?v=` manuales.
- Stores como módulos ES: RankingStore, AuthStore, SettingsUI, SocialStore, LigaCore…
- `npm run build` genera `dist/`; el server sirve `dist/` con caché immutable en `/a/*-hash.js`.
- Dev/prod: media en `dist/assets` (rutas runtime `assets/...`).

### Archivos
- `scripts/build-client.mjs`, `client/main.js`, `index.html`, `game.js`, `game/*`, stores, `server.js`, `package.json`


## 4.4 CSS propio + render/fx divididos
- CSS sacado de `index.html` → `css/base.css`, `screens.css`, `menu-actores.css`, `social.css`.
- `game/render.js` orquesta; lógica en `render_world.js`, `render_hud.js`, `render_menus.js`.
- `fx.js` reexporta; implementación en `fx/helpers.js`, `fx/estado_jugador.js`, `fx/mundo.js`.
- Build copia `css/` a `dist/css/`.

### Archivos
- `css/*`, `index.html`, `game/render*.js`, `fx.js`, `fx/*`, `scripts/build-client.mjs`


## 4.5 Sin console.log en pases
- Eliminados `console.log` de pases en `sim/jugador.js` (`actionPass` / `actionLongPass`).
- Ya no hace falta silenciar logs de simulación en el servidor (el truco de `vm`/sandbox quedó obsoleto con 4.2).

### Archivos
- `sim/jugador.js`


## 4.7 ESLint + Prettier
- ESLint 9 (flat config: `eslint.config.js`) + `eslint-config-prettier`.
- Prettier 3 (`.prettierrc.json`, `.prettierignore`).
- Scripts:
  - `npm run lint` — ESLint
  - `npm run lint:all` — ESLint + Prettier check
  - `npm run lint:fix` — ESLint con autofix
  - `npm run format` / `format:check` — Prettier
- Globals de juego declarados para no-undef; assets generados ignorados.

### Archivos
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `package.json`


## 5.1 Tests con node --test
- tests/*.test.mjs usan describe / test de node:test.
- npm test -> node --test tests/
- Scripts: test:sim, test:net, test:online.
- Mismas aserciones (sim, netsync, online).

### Archivos
- tests/sim.test.mjs, tests/netsync.test.mjs, tests/online.test.mjs, package.json


## 5.2 Tests de servidor
- `tests/server.test.mjs`: registro, login, sesión cerrada/inválida, rate limit, `/api/partido` (online/falso), matchmaking, cola, 2 partidos paralelos, sala privada, reconexión, abandono, revancha.
- `tests/auth_sesion.test.mjs`: persistencia (sesión, anotar online 403).
- Fix: `salir()` ahora devuelve `{ status, body }` (evita crash en `/api/logout`).
- DevDep: `socket.io-client`.
- `npm test` incluye los nuevos archivos.

### Archivos
- `tests/server.test.mjs`, `tests/auth_sesion.test.mjs`, `persistencia_json.js`, `rutas/auth.js`, `package.json`

## FIX17
- **Botones de celular copiados de la referencia (estilo FIFA móvil).** Aros gruesos de color con relleno oscuro translúcido, triangulito marcador sobre el aro y rótulo fino. Disposición: **TIRO/BARRER** arriba a la derecha (rojo con pelota, azul sin pelota, con marcadores a la izquierda y abajo como el SHOOT de la referencia), **CAMBIAR** arriba a la izquierda (amarillo), **PASE** abajo a la izquierda (celeste) y **SPRINT** abajo a la derecha, el más grande (verde). Sin skills ni "through". Solo cambia el CSS (`css/base.css`); HTML y `game/tactil.js` siguen igual. Reemplaza el diseño de FIX14.
- Versión de caché `v48`.

## FIX16
- **Cambio de jugador (Q / botón CAMBIAR) al más cercano a la pelota.** Antes rotaba al "siguiente" de la lista sin mirar dónde estaba la pelota, y muchas veces caía en el que estaba más lejos. Ahora, **cuando tu equipo NO tiene la posesión** (la tiene el rival o va suelta), el control pasa al jugador de campo **más cercano a la pelota que no sea el actual** (si ya controlás al más cercano, pasa al segundo más cercano, así el botón nunca queda "muerto"). Con pelota suelta y rodando se mide contra dónde va a estar en 8 cuadros (`CAMBIO_ANTICIPO_FRAMES`). **Con posesión** del equipo sigue la rotación de siempre.
  - Una sola regla en `GestorPartido.siguienteJugadorControlado` (`sim/gestor.js`), usada por el modo offline (`Game._switchPlayer`) y por el servidor online (`Partido._cambiarJugador`), para los dos lados.
  - Test nuevo en `tests/sim.test.mjs`.
- Versión de caché `v47`.

## FIX15
- **Online: al tocar VOLVER la pantalla quedaba en blanco.** Camino del bug: Jugar → En línea → elegir equipo → lobby → VOLVER (vuelve a elegir equipo) → VOLVER. El lobby oculta el menú principal, pero el "volver" de la selección de equipo en modo online (`_teamBack` en `game/equipos.js`) solo cerraba la selección y nunca lo mostraba de nuevo: no quedaba ninguna pantalla visible. Ahora vuelve al menú principal (`_showMainMenu`, que además limpia `_modoOnlineLobby`).
- **Cancelar la búsqueda, más robusto** (`game/online.js`): VOLVER del lobby y CANCELAR ahora también avisan al servidor (`cancelar_busqueda` / `cancelar_sala_privada`), frenan el reloj de la cola y invalidan cualquier búsqueda que todavía esté cargando socket.io o conectando (`_busquedaId`), así una búsqueda cancelada no "revive" después ni se manda al servidor.
- **Escape** en el lobby = VOLVER y en la pantalla de búsqueda = CANCELAR.
- Verificado en navegador (Chromium con servidor simulado) en los dos caminos y con cancelación inmediata.
- Versión de caché `v46`.

## FIX14
- **Controles de celular rediseñados (estilo "botón principal con satélites").** Todos los botones son redondos y están en arco alrededor del botón principal (TIRO con pelota / BARRER sin pelota, abajo a la derecha): PASE a la izquierda, SPRINT arriba a la izquierda y CAMBIAR arriba. Antes eran tres botones rectangulares en fila sobre el principal. Sin skills (el juego no las tiene). Mismo comportamiento y mismos `data-key`, así que `game/tactil.js` no cambia; funciona offline y online, en vertical y horizontal (todo escala con `--u`). El área vacía del grupo no bloquea toques. HTML en `index.html`, estilos `.tc-cluster` / `.tc-sat` en `css/base.css`.
- Versión de caché `v45`.

## FIX13
- **Barridas automáticas de los compañeros de IA (tu equipo): menos y más certeras.** Antes, el compañero más cercano al rival con pelota se tiraba en cada cuadro en que estaba a 22–62 px (sin probabilidad ni chequeo de si llegaba): ~47 barridas por partido, con solo ~30 % de acierto, y encima quedaba aturdido y sin resistencia. Ahora (`sim/jugador_ia.js` + `Jugador.rumboBarridaSegura` en `sim/jugador.js`):
  - Se tira solo si una **predicción** de la trayectoria (barredor vs. pelota, con la velocidad actual del rival) da contacto en **≤ 8 cuadros**: con poco tiempo para que el rival pase, tire o cambie de rumbo. Apunta al punto de intercepción.
  - Pausa mínima de 2,6 s entre barridas del mismo compañero, probabilidad de 55 % por chequeo y resistencia de sobra (costo + 20).
  - Medido en 40 partidos IA vs IA: **~10 barridas por partido con ~84 % de acierto** (antes ~47 con ~30 %).
  - La IA rival (por dificultad) y la barrida manual del jugador **no cambian**. Constantes `ALIADO_BARRIDA_*` en `sim/config.js` (subir `MAX_FRAMES`/`PROB` o bajar `ESPERA` = más barridas, menos certeras).
  - Test nuevo en `tests/sim.test.mjs`.
- Versión de caché `v44`.

## FIX12
- **Rebote del arquero proporcional a la potencia del tiro.** Antes el rebote era `max(3,2 ; velocidad × 0,48)`: cualquier tiro de hasta ~6,7 px/cuadro rebotaba siempre a 3,2 (un tiro suave salía despedido más rápido de lo que llegó). Ahora la pelota sale a `velocidad del tiro × GK_REBOTE_FACTOR` (0,48, igual que antes para los tiros fuertes), sin piso fijo. Los tiros de `GK_ATAJA_VEL` (2,8) o menos no se rebotan: el arquero los ataja y se queda con la pelota. Constantes en `sim/config.js`, lógica en `Jugador._handlePossession`. Test nuevo en `tests/sim.test.mjs`.
- Versión de caché `v43`.

## FIX11
- **IA: arquero y defensor no salían a buscar la pelota en su propia área.** Había una zona muerta: el defensor de IA tenía un tope fijo de 68 px antes de la línea de gol (`jugador.js` y `jugador_ia.js`) y el arquero solo se movía de costado dentro del ancho del arco, así que una pelota quieta cerca del fondo o de los costados del área no la agarraba nadie (en la prueba, en 32 de 63 puntos del área). Ahora:
  - **Defensor:** si la pelota está en su área (suelta o en poder del rival) y es el compañero de campo más cercano, puede bajar hasta ella (`aiSafeDepth`, constantes `DEFENSOR_PROF_MIN/NORMAL` en `sim/config.js`).
  - **Arquero:** con pelota suelta y lenta dentro del área sale a buscarla si llega antes que todos, ensanchando su límite lateral mientras sale (`gkSalida`), y después vuelve a su línea. Si un rival entra con la pelota, solo achica el ángulo (adelanta un poco su línea). Con un tiro en camino no sale: ataja como antes.
  - Área definida por `AREA_PROFUNDIDAD` / `AREA_MITAD_ANCHO` en `sim/config.js`.
  - Tests nuevos en `tests/sim.test.mjs`. En partidos IA vs IA caen ~15-25 % los goles (antes esa zona muerta regalaba rebotes): si la dificultad se siente distinta, ajustar esas constantes.
- Versión de caché `v42`.

## FIX10
- **Jugadores de La Retoneta invisibles:** el servidor guarda las imágenes de `/assets` con caché de 1 año (`immutable`), así que los navegadores que ya habían entrado seguían usando el `atlas.webp` VIEJO (sin las filas de Fabri/Mariano/Reta) con el `atlas.js` NUEVO. Resultado: el juego pedía un recorte fuera de la imagen y no dibujaba nada. Ahora el atlas se pide como `atlas.webp?v=41` (fuerza la descarga) y, además, `render_world.js` detecta un atlas desactualizado y dibuja la camiseta del equipo en vez de dejar al jugador invisible.
- Versión de caché `v41`. **Cada vez que cambie `atlas.webp`, subir `?v=` en `game.js` y `VERSION_JUEGO`/`CACHE`.**

## FIX9
- **Fabri y Reta:** dos jugadores personalizados nuevos (kits `player_fabri` y `player_reta`). Con Mariano, La Retoneta queda con sus 3 jugadores de campo personalizados: Fabri (slot 0, el que manejás), Mariano (slot 1) y Reta (slot 2). Asignación en `assets/skins.js`.
- Versión de caché `v40`.

## FIX8
- **Mariano:** nuevo jugador personalizado (kit `player_mariano` en el atlas de sprites). En La Retoneta, 1 de los 3 jugadores de campo (el segundo, `*_1`) es Mariano; los otros dos y el arquero no cambian. Funciona offline y online. La regla está en `assets/skins.js`, que ahora admite varios jugadores personalizados por equipo.
- Versión de caché `v39` (el atlas cambió).

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

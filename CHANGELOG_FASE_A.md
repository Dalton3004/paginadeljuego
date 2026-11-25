# Changelog y Línea Base — FASE A (Etapas 0 a 4)

## Etapa 0 — Auditoría Técnica y Nueva Línea Base

### Arquitectura real verificada
- **Motor compartido (`sim/` + `sim_offline.js`)**: `Pelota`, `Jugador` (+ mixin `jugador_ia.js`), `GestorPartido`, `CONFIG`, `TACTICAS` y `DIFICULTADES` corren exactamente igual en el cliente (Solo y Liga) y en el servidor autoritativo (`partido_online.js`, 60 Hz).
- **Cliente (`client/main.js`, `game.js`, `game/*.js`, `liga.js`, `fx/`, `css/`)**: arquitectura de ES Modules empaquetada con `esbuild` hacia `dist/a/main-<hash>.js`. `Game` extiende su prototipo mediante mixins modulares (`menu`, `online`, `equipos`, `tactil`, `audio`, `replay`, `postpartido`, `input`, `render`).
- **Servidor y Persistencia (`server.js`, `salas.js`, `matchmaking.js`, `onlineSockets.js`, `persistencia*.js`, `rutas/`)**: Express + Socket.IO, matchmaking por ventana de puntos, salas privadas, reconexión por token y revancha; persistencia dual en memoria+JSON atómico (`persistencia_json.js`) o PostgreSQL (`persistencia_pg.js` + `schema.sql`).

### Hallazgos de auditoría corregidos o documentados
1. **`utils_ui.js` desconectado del bundle**: `social.js`, `ranking.js`, `settings.js` y `liga.js` esperaban `window.esc` desde `utils_ui.js`, pero `client/main.js` no lo importaba (cayendo en copias locales). Ahora `client/main.js` importa `../utils_ui.js` al inicio.
2. **Preferencia `showHints` ignorada en HUD**: `settings.js` persistía `showHints`, pero `game/render_hud.js` dibujaba siempre la barra inferior de controles en PC. Corregido en `_drawMatchUI`.
3. **Código legado detectado (no mezclar con el juego activo)**:
   - `sim/boot.js`: cargador secuencial antiguo por `<script>` previo al bundle ESM de `client/main.js`. Se conserva únicamente como referencia histórica sin uso activo.
   - `assets/movilidad.js`: salida legacy de herramienta externa (`window.MOVILIDAD_JUGADORES`); el motor real usa `sim/movilidad.js` y `scripts/build-client.mjs` omite `.js` dentro de `assets/`.
4. **Identidad de jugadores (`sim/planteles.js`)**: los jugadores del motor solo tenían `mobilityId` (`local_0..2`, `local_gk`). Se creó `sim/planteles.js` respetando los personajes reales de `assets/skins.js` (p. ej. **Fabri**, **Mariano** y **Reta** en La Retoneta) y planteles completos para los 13 clubes sin alterar velocidades ni balance.
5. **Lockfile y suite base**: `package-lock.json` sincronizado; `npm test`, `npm run lint`, `npm run build` y `npm run loadtest` operativos.

---

## Etapa 1 — Estadísticas Reales del Partido (`sim/estadisticas.js`)
- Nueva clase modular `MatchStats` integrada en `GestorPartido`, alimentada **exclusivamente** por eventos reales de la simulación:
  - **Posesión (%) y tiempo real de posesión (s)** por equipo y conducción individual (`tick` sobre `ball.owner`).
  - **Tiros y tiros al arco** desde remates humanos (`Jugador.patear`), cabezazos ofensivos (`Jugador._cabecear`) y remates de IA (`_aiCarry`), usando proyección geométrica real hacia los tres palos y altura de travesaño (`esTiroAlArcoProyectado`) más promoción automática si exige atajada o termina en gol.
  - **Goles y asistencias reales** con autor, asistidor (pase previo completado al goleador), minuto (`1'..90'`) y marcador parcial.
  - **Pases y pases completados** (rasos, elevados y salidas dirigidas del arquero) verificando recepción real de un compañero.
  - **Barridas e intercepciones/quites exitosos** (`Jugador.barrida`, `_updateSlide` e intercepción en `_handlePossession`).
  - **Recuperaciones y pérdidas de balón** ante cambios reales de posesión controlada entre equipos.
  - **Atajadas del arquero** (desvíos de remates y atrapadas ante tiros rivales en `_handlePossession`).
  - **Ataques y llegadas al área** con pelota controlada e histéresis espacial.
  - **Transparencia de motor**: `faltas` y `corners` se declaran explícitamente como `{ faltas: false, corners: false }` en `soporteMotor` (cancha arcade con rebote en paredes, sin faltas ni tiros de esquina falsos).
- **Online y Persistencia**:
  - `Partido` (`partido_online.js`) registra estadísticas autoritativas en el servidor sin engordar el snapshot de 30 Hz; al marcar gol emite `gol_partido` y al finalizar emite `resumen_partido`.
  - `persistencia_json.js`, `persistencia_pg.js` (`schema.sql` con migración segura `ADD COLUMN IF NOT EXISTS stats JSONB`), `perfil.js` (`sanitizarStatsPartido`, `calcularPerfil`, `HistorialLocalStore`) y `social.js` persisten y muestran las métricas históricas reales.

---

## Etapa 2 — Post-Partido Completo (`game/postpartido.js`, `liga.js`, `css/screens.css`)
- Flujo completo al terminar cualquier partido (**Solo**, **Liga** u **Online 1 vs 1**):
  1. **Celebración final en cancha** (~1.35 s con silbatazo, cartel `VICTORIA / DERROTA / EMPATE` y marcador, adelantable con clic/Enter).
  2. **Pantalla Post-Partido (`#postmatch-screen`)** con estética pixel-art Chaquito y 4 vistas integradas:
     - **Resumen**: resultado grande, ganador, escudos, marcador, goleadores con minuto (y acceso directo al replay de cada gol), tarjeta destacada de **Figura del Partido**, **racha actual**, **impacto en la tabla de Liga** (`LigaCore.resumenImpacto`: posición antes → después, puntos ganados, diferencia de gol y próximo rival / cierre de campeonato) y barras rápidas.
     - **Estadísticas**: comparativa completa de los 11 indicadores reales entre ambos equipos.
     - **Ratings**: valoración individual de los 8 jugadores con medalla `★ MVP` y línea de contribuciones.
     - **Eventos**: cronología minuto a minuto de goles, atajadas, quites y pitazo final.
  3. **Botones contextuales claros**: `VER ESTADÍSTICAS` / `VER RESUMEN`, `VER GOLES (N)`, `CONTINUAR A LA LIGA` (en Liga), `JUGAR REVANCHA` / `PEDIR REVANCHA` con estado en vivo del rival (en Solo / Online) y `VOLVER AL MENÚ`.

---

## Etapa 3 — Replay de Goles (`sim/replay.js`, `game/replay.js`)
- `Replay` ampliado manteniendo compatibilidad total con su API previa:
  - Buffer circular (~5 s a 30 Hz) + cola post-gol (~0.42 s de entrada a la red) e historial multi-gol del partido (`goles`).
  - Interpolación sub-cuadro (`avanzarConCamara`), micro-pausa dramática en el impacto del gol, cámara lenta automática en el tramo final y selector manual `0.5x / 1x`.
  - Nueva clase `CamaraReplay` con seguimiento suave de pelota, zoom progresivo (`1.16x` → `1.38x`) y encuadre restringido a `480x640` para no mostrar bordes fuera del estadio.
- Integración con el render real (`game/replay.js`, `game/render_world.js`, `game/render_hud.js`):
  - En **Solo / Liga**: tras la celebración de gol se reproduce el replay (configurable en Ajustes con *Repetición automática de goles*) con opción de saltar (`ESPACIO`, `ENTER`, `ESC` o toque) y retorno seguro a `GestorPartido.reanudarTrasGol()` sin tocar jamás los objetos reales `this.players` ni `this.ball`.
  - En **Post-Partido (Solo, Liga y Online)**: selector completo para elegir y repetir cualquiera de los goles del partido (`◀ ANT`, `SIG ▶`, `↺ REPETIR`, `0.5x LENTA`, `ESTADÍSTICAS ✕`) y volver intacto al resumen.

---

## Etapa 4 — Figura del Partido y Valoración (`sim/valoracion.js`)
- Sistema configurable (`CONFIG_VALORACION`) con base `6.0` y escala `4.0–10.0`:
  - Pondera goles, asistencias, tiros al arco, pases completados y bonus por precisión, recuperaciones, barridas exitosas, atajadas, valla invicta (arquero y campo), participación activa, pérdidas y resultado colectivo.
  - Construye automáticamente el resumen explicable de aportes (`construirResumenJugador`) y elige la **Figura del Partido** permitiendo que arqueros y defensores sobresalientes ganen el MVP sin depender exclusivamente de convertir goles.

---

## Verificación reproducible en Navegador (PC y Celular)
1. Ejecutar `npm run dev` y abrir `http://127.0.0.1:3001`.
2. **Solo**: jugar un partido y convertir un gol → verificar cartel `GOL` → repetición con zoom/cámara lenta y botón `SALTAR ▶▶` → reanudación en el centro. Al finalizar, verificar celebración final → apertura automática de `#postmatch-screen` con pestañas `RESUMEN`, `ESTADÍSTICAS`, `RATINGS` y `EVENTOS`, clic en `🎥 VER GOLES` y retorno a estadísticas.
3. **Liga**: jugar una fecha desde `JUGAR → LIGA` → al terminar verificar el bloque **IMPACTO EN LA TABLA** (posición antes/después, puntos, DG y próximo rival) y botón `CONTINUAR A LA LIGA`.
4. **Online 1 vs 1**: abrir dos pestañas en `JUGAR → EN LÍNEA`, completar un partido → verificar que ambos lados reciben las estadísticas autoritativas del servidor, ven su resultado orientado a su equipo y pueden pedir/aceptar `REVANCHA` desde el Post-Partido.

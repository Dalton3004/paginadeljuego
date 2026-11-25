## FASE F (Etapas 34 a 39) — Calidad, Rendimiento, Suite de 7 Linters, Balance, Temporada Integrada y Release `v1.0.0`
- **Etapa 34 (Auditoría de Rendimiento y Móvil):** compactación in-place sin asignaciones GC en `fx/mundo.js` (`parts` y `trail`), objeto reutilizable `_stOut` en `assets/hinchada/fans.js`, buffer persistente `_sortedPlayers` en `game/render_hud.js` y reducción de movimiento real en vivo (`reduceMotion` bloquea `shake()` y baja partículas/confeti).
- **Suite Multicapa de 7 Linters (+1.000★ GitHub):** integración en `npm run lint` de `ESLint 9` (`unicorn`, `security`, `promise`), `Oxlint` (Rust), `Stylelint 18`, `HTMLHint`, `Markdownlint CLI2`, `Knip` y `scripts/lint-project.mjs` (`Dockerfile`, `schema.sql`, `PWA`, 52 jugadores), corrigiendo expresiones regulares ReDoS en `persistencia_json.js` y `persistencia_pg.js`.
- **Etapa 35 y 36 (QA Integral y Pulido Visual Final):** 19 suites automatizadas en `npm test` (`tests/fase_f_calidad_temporada_release.test.mjs`) y pulido visual responsive en `css/base.css` y `css/screens.css` (`body.a11y-reduce-motion`, jerarquía dorada de finales/trofeos, feedback táctil y grilla móvil `<400px`).
- **Etapas 37 y 38 (Balance Final y Temporada Completa):** auditoría matemática en `career/balance_temporada.js` (`auditarBalanceJuego`: curva IA monótona, estrellas `±6%`, atributos acotados y `0%` ventaja cosmética) y hoja de ruta narrativa (`construirHojaRutaTemporada`) conectada en `liga.js` desde Pretemporada hasta Palmarés y Nueva Temporada.
- **Etapa 39 (Revisión Técnica y Release `v1.0.0`):** compilación `esbuild` con `0 warnings`, eliminación total de textos temporales `"(próximamente)"` y entrega oficial en `RELEASE_CHECKLIST.md` y `CHANGELOG_FASE_F.md`.

## FASE E (Etapas 27 a 33) — UX y Datos: Central Chaquito, Accesibilidad, Equipo Favorito, Historial Permanente, Récords, Frontera Online y Persistencia
- **Etapa 27 (Navegación y Menús):** nuevo panel accesible **Central Chaquito** (`career/navegacion.js`, `game/navegacion_ui.js`, `#hub-hit` `☰ CENTRAL`) que mantiene limpia la portada móvil y brinda acceso en 1 toque y teclado a `Jugar`, `Liga`, `Copa`, `Arcade`, `Desafíos`, `Historia`, `Mi Club`, `Perfil`, `Noticias`, `Ranking` y `Ajustes`, con insignias en vivo.
- **Etapa 28 (Accesibilidad y Táctil):** modos daltónicos (`deuteranopia`, `protanopia`, `tritanopia` en `career/accesibilidad.js`) con anillos diferenciados por forma en cancha, prefijos `[TÚ]/[RIV]` en el HUD y símbolos `▲V/▼D/◆E` en historial; alto contraste, fuente grande, foco `:focus-visible` y controles táctiles configurables en escala y mano (`diestro`/`zurdo`).
- **Etapa 29 (Equipo Favorito y Perfil):** selección explícita y persistente en `career/favorito_perfil.js` (nunca asumida del último partido), visible en `Perfil`, `Mi Club`, `Ranking` (`[★SIGLAS]`) e historial de `Partidos`.
- **Etapas 30 y 31 (Historial Permanente, Palmarés Visual y Récords):** vitrina multi-temporada permanente (`career/records_palmares.js`, pestaña `🏅 PALMARÉS Y RÉCORDS` en `MI CLUB`) y cálculo de los 8 récords históricos usando exclusivamente datos reales registrados.
- **Etapas 32 y 33 (Seguridad Online y Persistencia con Migración):** aislamiento de modificadores offline al entrar a Online (`career/integracion_online.js`), rechazo `403` ante intentos cliente de inyectar `online`/`arcade`/`desafio`, y migraciones compatibles para cuentas antiguas en JSON y PostgreSQL (`career/persistencia_migracion.js`, `/api/perfil/favorito`, `/api/carrera`). Detalle completo en `CHANGELOG_FASE_E.md`.

## FASE D (Etapas 19 a 26) — Modos Extra: Desafíos, Chaquito Arcade, Celebraciones, Atributos, Forma, Historia, Radio y Pre-Partido
- **Etapa 19 (Modo Desafíos):** 5 desafíos cortos rejugables sobre el motor real (`career/desafios.js`, `game/modos_extra_ui.js`: *La Gran Remontada*, *El Muro de Chaquito*, *Agónico Minuto 89*, *Nervios de Acero* y *Supervivencia en el Barro*), con objetivo, tiempo, condiciones de victoria/derrota, puntaje y medallas (`ORO`, `PLATA`, `BRONCE`), sin alterar Liga ni Copa.
- **Etapa 20 (Modo Chaquito Arcade):** modo festivo y experimental separado de las competiciones oficiales (`career/arcade.js`), con presets rápidos y reglas configurables (partidos cortos `45s/60s/90s`, velocidad turbo/relámpago, pelota rápida, gol doble `x2`, bombazo de lejos `+1`, gol de oro, modo furia sin fatiga y eventos temporales en vivo).
- **Etapa 21 (Celebraciones Desbloqueables):** 6 festejos de gol 100% cosméticos (`career/celebraciones.js`: normal, baile, hinchada, grupal, acrobática y especial), desbloqueados por reputación, temporadas, rachas/goleadas, desafíos y títulos/historia, equipables en `MI CLUB` y animados en `CELEBRANDO_GOL` respetando `reduceMotion`.
- **Etapa 22 (Características de Jugadores):** 7 atributos deterministas (`velocidad`, `tiro`, `regate`, `pase`, `fuerza`, `defensa`, `atajada`) y rasgos (`CLUTCH`, `CEREBRO`, `CAÑÓN`, `VELOZ`, `MURO`, `GAMBETA`, `TANQUE`, `PULMÓN`) para los 52 jugadores reales (`career/atributos.js`), con modificadores estrictamente acotados que preservan el balance arcade y dejan intacto el servidor Online.
- **Etapa 23 (Forma y Cansancio):** sistema liviano de estado físico (`excelente`, `normal`, `cansado` en `career/forma.js`) sin lesiones permanentes, integrado en `MI CLUB`, previa y Liga (recuperación automática en fecha libre y botón táctico *Sesión de Recuperación*).
- **Etapa 24 (Modo Historia):** campaña narrativa en 6 capítulos cortos (*Debut*, *Primer Clásico*, *Crisis*, *Revancha*, *Clasificación* y *Gran Final* en `career/historia.js`) con equipos y nombres reales del plantel, objetivos, noticias, conferencias, rivalidad y recompensas.
- **Etapa 25 (Radio / Comentarios Textuales):** barra contextual de relatos (`career/comentarios.js`) disparada por eventos reales con anti-saturación, interruptor en `Configuración` y `audioKey` preparado para voces futuras.
- **Etapa 26 (Presentación Pre-Partido):** placa previa adaptativa (`career/prepartido.js`) breve para partidos comunes y televisiva completa para Finales, Supercopa, Clásicos, Historia y fechas decisivas (tabla, racha, forma, rivalidad, historial y clima, adelantable con `ESPACIO`). Detalle completo en `CHANGELOG_FASE_D.md`.

## FASE C (Etapas 14 a 18) — Ambiente de Estadio, Clima, Finales Especiales, Mi Club y Premios de Temporada
- **Etapa 14 (Hinchada Dinámica):** `ControladorHinchada` (`career/ambiente_core.js`, `game/hinchada_dinamica.js`) con 12 estados reales (`expectativa`, `ataque`, `gol`, `gol_rival`, `remontada`, `tiro_palo`, `atajada`, `ultimo_minuto`, `victoria`, `derrota`, `clasico`, `final`), detección física de palo/travesaño en `Pelota._bounceWalls` (`sim/pelota.js`), modulación de volumen de canto, exclamaciones sintéticas sutiles y carteles de tribuna.
- **Etapa 15 (Clima y Camisetas Alternativas):** 5 climas atmosféricos (`dia`, `noche`, `lluvia`, `lluvia_intensa`, `niebla`) en `game/clima.js` con pool fijo de gotas, reflectores, salpicaduras y respeto por `reduceMotion`; más camisetas alternativas para los 13 clubes (`assets/kits_alternativos.js`), selector en `#team-select`, resolución automática de choque cromático y tinte pixel-art limpio por offscreen canvas (`game/render_world.js`).
- **Etapa 16 (Estadio y Finales Especiales):** presentación de gala reservada estrictamente para `supercopa`, `final_copa`, `partido_decisivo_liga` y `clasico_alta_rivalidad` (`game/eventos_especiales.js`), con reflectores previos, carteles LED en vallas, pedestal con trofeo dorado al borde del campo y celebración especial de campeón.
- **Etapa 17 (Sección `MI CLUB`):** pantalla dedicada `#club-screen` (`career/mi_club.js`, `game/mi_club_ui.js`) accesible desde Modos, Liga, Copa y Perfil Social, centralizando plantel oficial, camisetas titular/suplente, estadísticas históricas por club, vitrina de trofeos, récords verificables (goleada, remontada, rachas), reputación, rivalidades y campañas.
- **Etapa 18 (Premios de Temporada):** cálculo verificable de los 8 premios anuales (`CAMPEÓN`, `MEJOR JUGADOR`, `BOTÍN DE ORO`, `MEJOR ARQUERO`, `MEJOR ASISTENTE`, `EQUIPO REVELACIÓN`, `PARTIDO DEL AÑO`, `MEJOR RACHA`) en `career/premios.js`, ceremonia final interactiva en `liga.js` y persistencia en la vitrina de `CarreraStore`. Detalle completo en `CHANGELOG_FASE_C.md`.

## FASE B (Etapas 5 a 13) — Liga, Competiciones Oficiales y Narrativa Deportiva
- **Etapa 5 (Noticias Chaquito):** motor parametrizado en `career/noticias.js` con detección real de remontadas, goles tardíos, goleadas, clásicos, cambios de líder, rachas y títulos (con anti-repetición), integrado en Post-Partido, Liga y en la nueva pantalla dedicada `#news-screen` (`📰 DIARIO`, `game/noticias_ui.js`).
- **Etapa 6 (Conferencias Post-Partido):** sala de prensa interactiva (`career/conferencias.js`) con 3 opciones de respuesta tras partidos clave offline, impactando reputación, hinchada, rivalidad y titulares sin alterar la justicia deportiva ni interrumpir partidas Online.
- **Etapa 7 (Reputación):** sistema `0..100` (`popularidad`, `respeto`, `hinchada`, `rivalidadMaxima`, `general`) en `career/reputacion.js` con títulos cosméticos desbloqueables 100% no pay-to-win.
- **Etapa 8 (Objetivos de Temporada):** generación por nivel de estrellas del club (`career/objetivos.js`), modal de pretemporada, pestaña `OBJETIVOS` en vivo dentro de `liga.js` y evaluación con recompensas al cierre del campeonato.
- **Etapa 9 (Copa Chaquito):** competición independiente de eliminación directa (`copa.js`, `#copa-screen`) para los 13 clubes (sorteo con cabezas de serie/byes en Octavos → Cuartos → Semifinal → Final, partido único o ida y vuelta, persistencia e historial).
- **Etapa 10 (Penales):** motor arcade (`sim/penales_core.js`: dirección, potencia, efecto/comba, lectura del arquero, corte matemático y muerte súbita) + escena interactiva en canvas (`game/penales.js`) compatible con teclado, mouse, táctil y gamepad para definir empates en Copa y Supercopa.
- **Etapa 11 (Supercopa Chaquito):** final oficial Campeón de Liga vs Campeón de Copa (`supercopa.js`), incluyendo regla oficial de doblete frente al Subcampeón de Liga, estética dorada e historial de supercampeones.
- **Etapa 12 y 13 (Rachas y Rivalidades):** rachas expandidas (`career/rachas.js`, `perfil.js`) con mensajes de hitos/cortes de invicto, y sistema de Rivalidades `0..100` (`career/rivalidades.js`) con Clásicos fundacionales y dinámicos visibles en previa, hinchada, menús y prensa. Detalle completo en `CHANGELOG_FASE_B.md`.

## FASE A (Etapas 0 a 4) — Fundación: Estadísticas reales, Post-partido, Replay y Figura del partido
- **Etapa 0 (Auditoría y línea base):** conexión de `utils_ui.js` en el bundle cliente, respeto de `showHints` en el HUD, planteles canónicos por equipo en `sim/planteles.js` (incluyendo Fabri, Mariano y Reta en La Retoneta) y migración retrocompatible de `stats` en JSON/PostgreSQL.
- **Etapa 1 (Estadísticas reales):** nuevo `MatchStats` (`sim/estadisticas.js`) conectado a los eventos reales del motor (posesión, tiempo de posesión, tiros, tiros al arco, goles, asistencias, pases, pases completados, barridas, quites, recuperaciones, pérdidas, atajadas y ataques/área), tanto offline como autoritativo en el servidor online (`partido_online.js`, `salas.js`).
- **Etapa 2 (Post-partido completo):** nueva experiencia `#postmatch-screen` (`game/postpartido.js`) tras la celebración final en cancha, con resultado grande, goleadores con minuto, racha actual, impacto en la tabla de Liga (`LigaCore.resumenImpacto`: posición antes/después, puntos, DG y próximo rival), estadísticas comparativas, ratings, cronología de eventos y revancha online en vivo.
- **Etapa 3 (Replay de goles):** integración completa de `sim/replay.js` + `CamaraReplay` con el render real (`game/replay.js`), zoom y seguimiento de pelota, cámara lenta opcional (`0.5x`), pausa breve en el impacto, repetición post-gol en Solo/Liga (configurable en Ajustes) y selector multi-gol en el post-partido.
- **Etapa 4 (Figura del partido y valoración):** sistema configurable en `sim/valoracion.js` (`4.0–10.0`) donde arqueros, defensores, armadores o goleadores pueden ser elegidos **Figura del Partido** según sus contribuciones reales. Detalle completo en `CHANGELOG_FASE_A.md`.

## FIX18
- **Online: nadie se podía mover (ni vos ni el rival).** El servidor validaba cada `input` con una lista de teclas permitidas (`inputValido` en `onlineSockets.js`) que NO incluía `tiro` ni `barrer`, y el cliente manda siempre el objeto completo de teclas con esas dos (`game/online.js`, botones TIRO/BARRER). Resultado: **todos** los mensajes de input se descartaban en silencio y los jugadores quedaban quietos (el partido, la cuenta regresiva y la IA seguían andando). Ahora `tiro` y `barrer` están permitidos. `inputValido` se exporta y tiene test (`tests/input_valido.test.mjs`) con las teclas reales del cliente; sigue rechazando claves desconocidas.
- Incluye FIX16 (cambio de jugador al más cercano) y FIX17 (botones de celular estilo FIFA), fusionados sobre FIX15.
- Versión de caché `v49`.

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

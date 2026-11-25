# CHANGELOG — FASE F (Etapas 34 a 39): Calidad, Rendimiento, Suite de Linters, Balance, Temporada Integrada y Release `v1.0.0`

Este documento detalla la implementación y verificación final de la **Fase F (Etapas 34 a 39)** del plan maestro de desarrollo de *Liga Chaquito F8*, cerrando las 40 etapas (`Etapa 0` a `Etapa 39`).

## Etapa 34 — Auditoría de Rendimiento, Memoria y Móvil
- **Compactación sin GC en `fx/mundo.js`:**
  - `this.parts` y `this.trail` ahora se compactan **in-place** en cada frame (e incluso reutilizan sus buffers en `reset()`), eliminando asignaciones de arreglos por cuadro a 60 FPS.
  - Se cacheó `this._cfgGlobal` en el constructor de `Mundo` en lugar de reconstruir `Object.assign({}, GLOBAL_DEF, userCfg().global)` en cada llamada a `this.G`.
  - Se conectó en vivo `this.game.prefs.reduceMotion`: baja `calma` a `0.35` (reduciendo partículas y desactivando confeti pesado/estela) y bloquea por completo `shake()` de cámara.
- **Cero asignaciones efímeras por hincha en `assets/hinchada/fans.js` y `assets/hinchada/fans_atlas.js`:**
  - `Crowd._state(f)` reutiliza un único objeto `this._stOut` en vez de instanciar un objeto literal por cada hincha (~200 hinchas × 60 FPS = ~12.000 objetos efímeros/seg eliminados).
  - `assets/hinchada/fans_atlas.js` publica `globalThis.FANS_ATLAS` para compatibilidad universal entre navegador y tests Node.js.
- **Buffer reutilizable de ordenamiento Y en `game/render_hud.js`:**
  - Reemplazo de `[...this.players].sort(...)` por un arreglo persistente `this._sortedPlayers` reutilizado cuadro a cuadro.
- **Presupuesto verificado:**
  - Simulación offline (`GestorPartido` + `MatchStats` + `Replay` circular) medida en `< 0.1 ms/frame` (frente al presupuesto de `16.67 ms` de 60 Hz).
  - Prueba de carga online (`npm run loadtest`): 20 salas autoritativas simultáneas a 60 Hz muy por debajo del presupuesto de `16.67 ms`.

## Suite Multicapa de Linters de Estándar Industrial (7 Capas · Referencias GitHub +1.000★)
- Configuración e integración de `npm run lint` con **0 errores y 0 advertencias** apoyada en repositorios de referencia de más de 1.000 estrellas:
  1. **ESLint 9 Flat Config (`eslint.config.js`):** `@eslint/js`, `eslint-plugin-unicorn` (★5.2k), `eslint-plugin-security` (★2.3k), `eslint-plugin-promise` (★1k+) y `eslint-config-prettier`. Detectó y permitió corregir expresiones regulares vulnerables a ReDoS en `persistencia_json.js` y `persistencia_pg.js` (`nombrePermitido` reescrito en tiempo lineal `O(n)`).
  2. **Oxlint (`.oxlintrc.json`):** motor Rust `oxc-project/oxc` (★23.5k) validando ~90 archivos en `< 80 ms` con reglas `correctness`, `suspicious` y `perf`.
  3. **Stylelint 18 (`.stylelintrc.json`):** `stylelint` (★11.5k) + `stylelint-config-standard` (★1.4k) sobre `css/**/*.css`.
  4. **HTMLHint (`.htmlhintrc`):** `htmlhint/HTMLHint` (★3.3k) validando estructura, IDs únicos y accesibilidad de `index.html`.
  5. **Markdownlint CLI2 (`.markdownlint-cli2.jsonc`):** `DavidAnson/markdownlint` (★6.4k) validando toda la documentación `*.md`.
  6. **Knip (`knip.json`):** `webpro-nl/knip` (★12.7k) verificando cero archivos huérfanos y cero dependencias muertas.
  7. **Validador Estructural del Proyecto (`scripts/lint-project.mjs`):** valida `Dockerfile` (estándares Hadolint ★12.5k), `schema.sql`, `manifest.json`, sincronía `VERSION_JUEGO` ↔ `sw.js` e integridad de los 13 clubes y 52 jugadores canónicos.

## Etapa 35 — QA y Batería Completa de Regresión
- Suite automatizada ampliada a **19 archivos de test** ejecutados con `npm test` cubriendo: motor físico 4v4, IA, `netsync`, online 1v1, validación estricta de inputs, servidor HTTP, autenticación/sesiones, observabilidad/métricas, panel admin, PWA, replay, perfil, estadísticas reales, valoración/figura, competiciones (Liga, Copa, Penales, Supercopa), narrativa (noticias, conferencias, reputación, objetivos, rachas, rivalidades), ambiente (hinchada, clima, finales, Mi Club, premios), modos extra (Desafíos, Arcade, Celebraciones, Atributos, Forma, Historia, Radio, Pre-partido), UX/accesibilidad/persistencia y temporada completa E2E (`tests/fase_f_calidad_temporada_release.test.mjs`).

## Etapa 36 — Pulido Visual Final (Sin Sistemas Nuevos)
- **Jerarquía y feedback táctil (`css/base.css`, `css/screens.css`):**
  - Micro-feedback de presión táctil en botones interactivos, resplandor dorado reservado para finales/trofeos/campeonatos y grilla adaptativa para móviles angostos (`< 400px`).
  - Nueva clase `body.a11y-reduce-motion` y regla `@media (prefers-reduced-motion: reduce)` sincronizadas con `#cfg-motion` (`career/accesibilidad.js`, `settings.js`).
  - Franja visual de progreso de temporada (`.lg-season-strip`, `.lg-step`, `.lg-copa-hint`) integrada con la estética pixel-arcade Chaquito.

## Etapa 37 — Auditoría Matemática de Balance Final
- Nuevo módulo `auditarBalanceJuego` en `career/balance_temporada.js` verificado automáticamente en tests:
  - Curva monótona estricta `Fácil < Normal < Difícil` en velocidades de persecución/sprint, tiempo de reacción, potencia de tiro y reflejos de arquero.
  - Rango de estrellas justo (`1★ = 0.94` a `5★ = 1.06`, `±6%`) para que la habilidad del jugador decida cada partido.
  - Los 52 jugadores canónicos en los 3 estados de forma (`excelente`, `normal`, `cansado`) permanecen estrictamente acotados sin romper la física arcade.
  - Desafíos cortos (`<= 75s`, cero grind excesivo) y celebraciones desbloqueables con **0% de ventaja competitiva**.

## Etapa 38 — Experiencia de Temporada Completa Integrada
- `construirHojaRutaTemporada` (`career/balance_temporada.js`) + integración en `liga.js`:
  - Conecta `Pretemporada` (con recuperación física inicial del plantel) → `Arranque` → `Mitad · Copa` → `Definición` → `Premios · Palmarés`.
  - Destaca duelos directos por la cima, rachas activas, recordatorios de **Copa Chaquito** en paralelo y habilitación de **Supercopa Chaquito**.
  - Al cerrar la temporada, ofrece acceso directo a `🏅 PALMARÉS Y RÉCORDS` y botón `🔄 NUEVA TEMPORADA` conservando el club elegido y archivando la campaña anterior sin pérdida de historial.

## Etapa 39 — Revisión Técnica Final y Entregables de Release
- Eliminación de chequeos CommonJS residuales en `assets/hinchada/fans.js` y `net/netsync.js`: `npm run build` ahora compila con **0 errores y 0 warnings** en esbuild.
- Eliminación del último texto temporal `"(próximamente)"` en `settings.js` (`#cfg-motion`) tras conectar la reducción real de movimiento, verificado con test estático sobre todos los módulos de UI.
- Generación de `RELEASE_CHECKLIST.md` con versión final, changelog consolidado, inventario completo de features, notas técnicas, instrucciones de build/deploy y checklist de lanzamiento verificado.

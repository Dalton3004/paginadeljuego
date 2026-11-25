# CHANGELOG — FASE E (Etapas 27 a 33): Navegación, Accesibilidad, Equipo Favorito, Historial Permanente, Récords, Frontera Online y Persistencia

## Resumen Técnico

La **Fase E** ordena la experiencia de usuario para celular y PC, completa todas las funciones de accesibilidad y controles táctiles configurables, incorpora selección explícita de Equipo Favorito, crea la vitrina de historial multi-temporada permanente y récords reales, blinda la frontera competitiva Online y asegura migraciones compatibles tanto en archivo JSON como en PostgreSQL.

---

## Detalle por Etapa

### Etapa 27 — Navegación y Estructura de Menús (`career/navegacion.js`, `game/navegacion_ui.js`, `index.html`, `css/screens.css`)
- **Portada limpia orientada a móvil:** se conserva el arte principal sin saturar la pantalla con decenas de botones. Se incorpora un único acceso compacto `#hub-hit` (`☰ CENTRAL`) que despliega la **Central Chaquito**.
- **Acceso en 1 toque y teclado a las 10 secciones requeridas:** `Jugar`, `Liga`, `Copa`, `Arcade`, `Desafíos`, `Mi Club`, `Perfil`, `Noticias`, `Ranking` y `Ajustes` (más `Historia`, `Supercopa` y acceso directo a `Palmarés y Récords`).
- **Insignias contextuales en vivo:** muestra automáticamente la fecha actual de Liga, Copa en curso, cantidad de noticias nuevas del Diario, progreso de Desafíos y siglas del Equipo Favorito.

### Etapa 28 — Accesibilidad y Controles Táctiles Configurables (`career/accesibilidad.js`, `settings.js`, `game/render_world.js`, `game/render_hud.js`, `css/base.css`)
- **Modo daltónico (`off`, `deuteranopia`, `protanopia`, `tritanopia`):** paletas de alto contraste distinguibles + indicadores visuales **no dependientes únicamente del color**:
  - En cancha (`game/render_world.js`): anillo continuo para tu equipo vs anillo punteado discontinuo para el equipo rival.
  - En marcador HUD (`game/render_hud.js`): prefijos explícitos `[TÚ]` y `[RIV]`.
  - En historial social (`social.js`): símbolos geométricos `▲V` (victoria), `▼D` (derrota) y `◆E` (empate).
- **Contraste reforzado y escala de fuente:** clases reactivas `body.a11y-high-contrast` y `body.a11y-font-large`, con anillos `:focus-visible` nítidos para navegación completa por teclado.
- **Controles táctiles configurables:** selector de tamaño (`compacto`, `normal`, `grande`) y disposición para personas diestras o zurdas (`#touch-controls.tc-zurdo`, invirtiendo joystick y botonera de acción).

### Etapa 29 — Equipo Favorito y Perfil (`career/favorito_perfil.js`, `social.js`, `game/mi_club_ui.js`, `ranking.js`)
- **Selección 100% explícita:** `EquipoFavoritoStore` inicia en `""` (*Sin elegir*) y **jamás** asume ni deduce el club favorito a partir del último partido jugado.
- **Integración transversal:** selector persistente en `Social -> Perfil` y botón `★ ELEGIR COMO EQUIPO FAVORITO` en `MI CLUB`, visible mediante insignia `★` en Perfil, sede `MI CLUB`, tabla de `Ranking` (`[★SIGLAS]`) e historial de `Partidos` (`★CLUB vs RIVAL`).

### Etapa 30 — Historial Permanente y Palmarés Visual (`career/records_palmares.js`, `career/store.js`, `liga.js`, `game/mi_club_ui.js`)
- **Persistencia multi-temporada permanente:** comenzar una nueva temporada de Liga o edición de Copa nunca borra campañas anteriores. Cada cierre de Liga guarda posición final, puntos, goles a favor/en contra, campeón, Mejor Jugador y Botín de Oro.
- **Pestaña `🏅 PALMARÉS Y RÉCORDS` en `MI CLUB`:** vitrina visual de trofeos oficiales (Ligas, Copas, Supercopas y Campaña Historia), tabla histórica temporada por temporada, finales de Copa/Supercopa y Cuadro de Honor de jugadores premiados.

### Etapa 31 — Sección de Récords Reales (`career/records_palmares.js`, `career/store.js`)
- **8 récords calculados únicamente con datos reales:**
  1. Mayor goleada
  2. Mayor remontada
  3. Máximo goleador histórico
  4. Más victorias consecutivas
  5. Mayor cantidad de títulos oficiales
  6. Gol más tardío registrado (`minuto'`)
  7. Mejor racha invicta
  8. Partido con más goles totales
- Sin cuentas inventadas ni rellenos ficticios: en una cuenta nueva todos figuran limpiamente como *Sin registrar aún*.

### Etapa 32 — Integración y Frontera de Seguridad Online (`career/integracion_online.js`, `game/online.js`, `persistencia_json.js`, `persistencia_pg.js`)
- **Clasificación explícita auditada:** separación estricta entre **A) Sistemas Offline**, **B) Sistemas Online Autoritativos** y **C) Sistemas Cosméticos / UX**.
- **Aislamiento de cliente al entrar a Online (`aislarClienteParaOnline`):** limpia cualquier estado o modificador de Liga, Arcade (`arcadePowerMult`, `_arcadeFuria`) o atributos offline antes de iniciar una partida 1v1 en red.
- **Protección contra falsificación competitiva:** `POST /api/partido` rechaza con `403` cualquier intento cliente de reportar `modo: "online"`, `"arcade"` o `"desafio"`, y las partidas offline registradas desde cliente jamás inflan los puntos competitivos del ranking global.

### Etapa 33 — Persistencia y Migraciones Seguras (`career/persistencia_migracion.js`, `schema.sql`, `persistencia.js`, `persistencia_json.js`, `persistencia_pg.js`, `rutas/auth.js`)
- **Compatibilidad total con cuentas existentes:** migración no destructiva tanto en `liga.json` como en PostgreSQL (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS equipo_favorito`, `datos_carrera`, `equipo_local`, `equipo_rival` y ampliación del `CHECK` de modos oficiales).
- **Nuevos endpoints autenticados:** `PUT /api/perfil/favorito`, `GET /api/carrera` y `PUT /api/carrera` (con sanitización y límite de seguridad de 140 KB), permitiendo que usuarios antiguos inicien sesión sin perder contraseñas scrypt, puntos, sesiones ni partidos previos.

---

## Verificación Ejecutada

- `node --test tests/fase_e_ux_datos_persistencia.test.mjs` → **8/8 tests aprobados** (incluyendo servidor HTTP real con cuenta legacy pre-sembrada).
- `npm test` → **123/123 tests aprobados** en toda la suite del proyecto.
- `npx eslint --max-warnings=0` sobre todos los módulos nuevos de Fase E → **0 errores, 0 warnings**.
- `npm run build` y `npm run loadtest` → **aprobados sin regresiones**.

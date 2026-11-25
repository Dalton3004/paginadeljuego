# CHANGELOG — FASE D: MODOS EXTRA (Etapas 19 a 26)

## Resumen
Implementación integral de la **FASE D — MODOS EXTRA** de *Liga Chaquito F8*, sumando modos de juego especiales rejugables, progresión cosmética, identidad individual por jugador, estado físico liviano, campaña narrativa por capítulos, radio contextual y placa televisiva pre-partido, todo conectado al motor real y respetando el aislamiento de estadísticas oficiales.

---

## Etapas Implementadas

### Etapa 19 — Modo Desafíos (`career/desafios.js`, `game/modos_extra_ui.js`, `game/fase_d_partido.js`)
- 5 desafíos cortos rejugables sobre el motor real (`GestorPartido` y `SeriePenales`):
  - **La Gran Remontada** (dar vuelta un `0-2` en `50s`).
  - **El Muro de Chaquito** (sostener un `1-0` con derrota inmediata si te convierten).
  - **Agónico Minuto 89** (`1-1` a falta de `25s` para ganar antes del pitazo).
  - **Nervios de Acero** (tanda decisiva de penales bajo presión).
  - **Supervivencia en el Barro** (`+10s` extra por cada gol propio manteniendo valla invicta).
- Cada desafío cuenta con objetivo, tiempo, condición de victoria, condición de derrota, puntaje y medalla (`ORO`, `PLATA`, `BRONCE`), persistidos en `DesafiosStore` sin alterar Liga ni Copa.

### Etapa 20 — Modo Chaquito Arcade (`career/arcade.js`, `game/modos_extra_ui.js`, `game/fase_d_partido.js`)
- Modo experimental separado de las competiciones oficiales (`ArcadeStore`).
- Presets rápidos (*Fiesta Chaquito*, *Modo Furia Total*, *Gol de Oro*) y reglas configurables:
  - Partidos cortos (`45s`, `60s`, `90s`).
  - Velocidad aumentada (`normal`, `turbo`, `relampago`).
  - Pelota más rápida (`Pelota.arcadePowerMult`).
  - Goles con valor especial (`Bombazo de lejos +1` o `Gol de Oro` definitorio) y `Gol Doble x2`.
  - Modo Furia (sprint inagotable y barrida sin costo de energía).
  - Ruleta de eventos temporales cada pocos segundos en cancha con banner en vivo.

### Etapa 21 — Celebraciones Desbloqueables (`career/celebraciones.js`, `game/render_world.js`, `game/mi_club_ui.js`)
- 6 celebraciones de gol 100% cosméticas: *Clásica de Potrero*, *Pasito Chaquito* (baile), *De Cara a la Popular* (hinchada), *Abrazo de Campeones* (grupal), *Mortal en el Aire* (acrobática) y *Corona Dorada* (especial).
- Desbloqueo real por reputación, temporadas/partidos, rachas/goleadas, desafíos superados y títulos/historia.
- Selector interactivo para equipar celebración en `MI CLUB -> Vitrina y Festejos` y animación real durante `CELEBRANDO_GOL` respetando `reduceMotion`.

### Etapa 22 — Características de Jugadores (`career/atributos.js`, `sim/jugador.js`, `game/mi_club_ui.js`)
- 7 atributos deterministas (`velocidad`, `tiro`, `regate`, `pase`, `fuerza`, `defensa`, `atajada`) y rasgos especiales (`CLUTCH`, `CEREBRO`, `CAÑÓN`, `VELOZ`, `MURO`, `GAMBETA`, `TANQUE`, `PULMÓN`) para los 52 jugadores reales de los 13 clubes.
- Modificadores estrictamente acotados (`LIMITES_MODIFICADORES`) que complementan el gameplay arcade sin convertirlo en simulador ni afectar el servidor autoritativo Online.

### Etapa 23 — Forma y Cansancio (`career/forma.js`, `career/store.js`, `liga.js`, `game/mi_club_ui.js`)
- Sistema liviano de tres estados (`🔥 EXCELENTE`, `✓ NORMAL`, `😮‍💨 CANSADO`) con métricas simples de forma y fatiga, sin lesiones permanentes.
- Integrado en decisiones reales de Liga: recuperación automática en fecha libre y botón táctico **🧘 Sesión de Recuperación** antes de jugar/simular fechas exigentes.

### Etapa 24 — Modo Historia (`career/historia.js`, `game/modos_extra_ui.js`, `game.js`)
- Campaña narrativa en 6 capítulos (*Debut*, *Primer Clásico*, *Crisis*, *Revancha*, *Clasificación* y *Gran Final*) protagonizada por los clubes y personajes reales de `sim/planteles.js`.
- Cada capítulo activa partido real, objetivo principal y estrella extra, noticia en Diario Chaquito, conferencia de prensa post-partido, incremento de rivalidad y recompensa de reputación / celebración especial.

### Etapa 25 — Radio / Comentarios Textuales (`career/comentarios.js`, `game/fase_d_partido.js`, `settings.js`)
- Barra de radio contextual disparada por eventos reales (goles, golazos, goles agónicos, atajadas, travesaños/palos, barridas, ataques peligrosos y minuto 89).
- Cooldown anti-saturación, preferencia configurable en `Configuración` (`📻 Radio y comentarios contextuales`) y estructura con `audioKey` lista para voces grabadas futuras.

### Etapa 26 — Presentación Pre-Partido (`career/prepartido.js`, `game/fase_d_partido.js`, `game/render_hud.js`, `game/input.js`)
- Presentación breve para partidos comunes y placa televisiva completa para Finales, Supercopa, Clásicos, Historia y fechas decisivas de Liga (escudos, nombres, posición en tabla, racha, forma del plantel, rivalidad, historial reciente y clima, con salto opcional vía `ESPACIO`).

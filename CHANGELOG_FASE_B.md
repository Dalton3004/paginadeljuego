# CHANGELOG — FASE B: Liga, Competiciones y Narrativa Deportiva (Etapas 5 a 13)

Registro técnico detallado de la implementación completa de la **Fase B** en *Liga Chaquito F8*.

---

## Etapa 5 — Noticias Chaquito (`career/noticias.js`, `game/noticias_ui.js`)
- **Motor parametrizado de crónicas deportivas:** `analizarNarrativaPartido` y `generarNoticiaPartido` analizan hechos reales del partido (remontadas, goles decisivos desde los 80', goleadas por ≥3 tantos, victorias/caídas en Clásicos, cambios de líder en la Liga, cortes de invicto, rachas ganadoras, actuaciones individuales ≥8.8 y consagraciones en Liga/Copa/Supercopa).
- **Anti-repetición:** rotación de plantillas contra el historial reciente (`recientesIds`) para evitar titulares idénticos consecutivos.
- **Integración visual:**
  - Tarjeta de crónica deportiva dentro del resumen post-partido (`game/postpartido.js`).
  - Ticker de última noticia en la cabecera de la pantalla de Liga (`liga.js`) y acceso directo desde Liga y Copa.
  - Nueva pantalla dedicada **`#news-screen` (Diario Chaquito)** accesible desde el botón superior izquierdo **`📰 DIARIO`** (`#news-hit`, con indicador luminoso de noticias sin leer), filtrable por *Todas*, *Portada* y *Conferencias*.

## Etapa 6 — Conferencias Post-Partido (`career/conferencias.js`, `career/store.js`, `game/postpartido.js`)
- **Reglas claras de activación (`evaluarActivacionConferencia`):** se dispara automáticamente ante hitos reales (títulos, finales, remontadas, clásicos, victorias frente al puntero, goles agónicos, goleadas o rachas) con control de enfriamiento, y **jamás se activa en partidos Online 1v1** para no interferir con la sincronización ni la revancha en red.
- **Interacción en Post-Partido:** pregunta contextual de periodistas del universo Chaquito (*Chicho Pelota*, *Marta Gol*, *Tito Táctica*) con **3 opciones de respuesta** (tono de equipo, autocrítica o picante).
- **Consecuencias no competitivas:** actualiza de inmediato Reputación, Hinchada, Rivalidad con el club enfrentado y publica la declaración en el *Diario Chaquito*.

## Etapa 7 — Sistema de Reputación (`career/reputacion.js`, `career/store.js`)
- **Variables persistidas (`0..100`):** `popularidad`, `respeto`, `hinchada`, `rivalidadMaxima` y `general` ponderada, con rangos descriptivos (*En Construcción*, *Animador Barrial*, *Club Respetado*, *Grande de la Liga*, *Leyenda Chaquito*).
- **Diseño 100% No Pay-to-Win:** desbloquea títulos honoríficos/cosméticos (`TITULOS_REPUTACION`: *Orgullo del Potrero*, *Ídolo de la Tribuna*, *Caballero del Fútbol 8*, *Gigante de Chaquito*, *Leyenda Inmortal*) visibles en el Diario, Post-Partido y Perfil Social sin otorgar ventajas físicas injustas.

## Etapa 8 — Objetivos de Temporada (`career/objetivos.js`, `liga.js`)
- **Generación acorde al plantel:** `generarObjetivosTemporada` calibra la exigencia del **Objetivo Principal** según las estrellas del club elegido (p. ej. salir Campeón con 5★, Podio con 4★, campaña firme con 2★) y suma **Objetivos Secundarios** (cuota goleadora, racha de victorias seguidas, ganar un Clásico o vallas invictas).
- **Flujo completo en Liga:**
  - Modal de presentación de objetivos al iniciar una nueva temporada (`_mostrarModalObjetivosPretemporada`).
  - Pestaña **`OBJETIVOS`** en `#liga-screen` con barras de progreso en vivo (`EN CURSO`, `✓ CUMPLIDO`, `✕ FALLADO`).
  - Evaluación final al terminar la Liga con impacto en Reputación y registro en `historialTemporadas`.
  - Retrocompatibilidad automática (`LigaCore.asegurarObjetivos`) para ligas guardadas en versiones previas.

## Etapa 9 — Copa Chaquito (`copa.js`)
- **Torneo independiente de eliminación directa:** convive con la Liga usando los 13 clubes existentes.
- **Sorteo y cuadro completo (`CopaCore`):** cuadro de 16 lugares en **Octavos de Final** (3 cabezas de serie con pase directo/*bye* por estrellas + 5 cruces) → **Cuartos de Final** → **Semifinal** → **Gran Final**.
- **Formato configurable:** *Partido Único* o *Ida y Vuelta* (con Final única), simulación coherente del resto de las llaves, posibilidad de simular el resto del torneo si el jugador queda eliminado, persistencia en `CopaStore` (`chaquito_copa_actual_v1` y `chaquito_copa_historial_v1`) y pantalla dedicada `#copa-screen`.

## Etapa 10 — Sistema Arcade de Penales (`sim/penales_core.js`, `game/penales.js`)
- **Motor puro y determinista/inyectable (`PenalesCore`):** combina dirección (`izq` / `centro` / `der`), barra oscilante de potencia (`0..1`, con riesgo de travesaño/afuera al exceder `0.94` buscando el ángulo), colocación/efecto (`raso`, `comba`, `angulo`) y lectura del arquero.
- **Reglamento completo (`SeriePenales`):** tanda de 5 ejecuciones por equipo, corte matemático anticipado cuando la diferencia ya es indescontable y **Muerte Súbita** 1 a 1 en caso de igualdad.
- **Escena interactiva en Canvas (`game/penales.js`):** controles completos para **teclado** (`WASD`/Flechas + `Espacio`/`Enter`), **mouse**, **táctil** (toque directo en el arco o botonera inferior) y **gamepad**, con vuelo con comba, volada del arquero, sonido, reacción de la hinchada y marcador de bolitas en vivo. Conectado automáticamente a los empates de **Copa Chaquito** y **Supercopa Chaquito**.

## Etapa 11 — Supercopa Chaquito (`supercopa.js`)
- **Final de Campeones:** cruza al Campeón vigente de la **Liga** frente al Campeón vigente de la **Copa Chaquito** a partido único (con definición por penales en caso de empate).
- **Regla oficial de Doblete documentada e implementada:** si el mismo club conquistó tanto la Liga como la Copa Chaquito (`hayDoblete`), disputa la Supercopa frente al **Subcampeón de la Liga** (respaldo: finalista de Copa).
- **Presentación y vitrina:** marco dorado especial en la previa del partido (`game/render_hud.js`), modal con trofeo e historial persistente en `SupercopaStore` (`chaquito_supercopa_hist_v1`).

## Etapa 12 — Rachas Expandidas (`career/rachas.js`, `perfil.js`, `social.js`)
- Seguimiento persistente de **victorias consecutivas**, **derrotas consecutivas**, **partidos invicto**, **partidos seguidos convirtiendo goles** y **vallas invictas seguidas**, junto con sus récords históricos.
- Generación de mensajes contextuales reales (*"4 VICTORIAS CONSECUTIVAS"*, *"SE TERMINÓ EL INVICTO (5 PARTIDOS)"*, *"¡SE CORTÓ LA MALA RACHA!"*) integrados en Post-Partido, Noticias, Objetivos y Perfil Social.

## Etapa 13 — Rivalidades y Clásicos (`career/rivalidades.js`)
- **Índice `0..100` por par de clubes (`RIVALIDAD X/100`):** incluye 6 clásicos fundacionales del universo Chaquito (encabezados por *La Retoneta vs El Boguero*) y crecimiento orgánico por historial de cruces, partidos cerrados, penales, remontadas, eliminatorias, finales y declaraciones picantes en conferencia.
- **Nuevos Clásicos dinámicos:** cualquier cruce que alcance `>= 70/100` asciende a *Clásico Chaquito*, encendiendo carteles en el selector de rival, previa del partido, aliento de la hinchada (`game.js`), noticias y conferencias, sin alterar jamás la física ni el arbitraje del juego.

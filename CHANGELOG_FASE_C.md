# CHANGELOG — FASE C (Ambiente, Estadio, Mi Club y Premios de Temporada)

Resumen detallado de la implementación completa de la **FASE C (Etapas 14 a 18)** para **Liga Chaquito F8**, manteniendo intactos el gameplay 4v4, los torneos de Fase B, el modo Online 1v1 autoritativo, la PWA y los controles táctiles.

---

## Etapa 14 — Hinchada Dinámica (`career/ambiente_core.js`, `game/hinchada_dinamica.js`, `sim/pelota.js`)
- **Detección física real de tiro al palo/travesaño:** en `Pelota._bounceWalls` (`sim/pelota.js`) se emite la marca efímera no intrusiva `_hitWoodwork` (`palo` / `travesano`) cuando un remate rápido impacta contra los postes o el travesaño, sin alterar las trayectorias ni el determinismo.
- **`ControladorHinchada` con 12 estados reales de partido:**
  `expectativa`, `ataque`, `gol`, `gol_rival`, `remontada`, `tiro_palo`, `atajada`, `ultimo_minuto`, `victoria`, `derrota`, `clasico` y `final`.
- **Integración audiovisual:** ajusta continuamente la intensidad de animación de `Crowd` (`setIntensity`, olas `chance` y festejos `goal`), modula suavemente el volumen del canto de cancha por Web Audio, dispara sutiles exclamaciones sintéticas de tribuna en palos/atajadas sin peso extra de red y dibuja carteles ambientales breves bajo el marcador (respetando `reduceMotion`).

## Etapa 15 — Clima, Variantes Atmosféricas y Camisetas Alternativas (`career/ambiente_core.js`, `game/clima.js`, `assets/kits_alternativos.js`, `game/render_world.js`, `game/equipos.js`)
- **5 variantes de estadio:** `dia` (sol cálido), `noche` (reflectores en las 4 esquinas y tinte nocturno), `lluvia` (gotas diagonales con pool fijo sin GC y salpicaduras al patear/barrer), `lluvia_intensa` (tormenta cerrada, charcos sutiles y relámpago lejano) y `niebla` (bruma en bordes manteniendo el centro pixel-art nítido).
- **Accesibilidad y rendimiento:** pool estático de gotas reutilizables, respeto estricto por `prefs.reduceMotion` (reduce partículas, apaga relámpagos y convierte niebla móvil en día limpio) y cero impacto injusto sobre la física ni desincronización Online.
- **Camisetas Alternativas (`assets/kits_alternativos.js`):** catálogo completo de indumentaria suplente para los **13 clubes** (`KITS_ALTERNATIVOS`), selector manual en `#team-select` (`👕 CAMISETA: TITULAR / SUPLENTE`), selector de clima (`☀ CLIMA: AUTO / DÍA / NOCHE / LLUVIA / TORMENTA / NIEBLA`) y resolución automática cuando dos clubes tienen paletas parecidas (`resolverCamisetasPartido`).
- **Tinte pixel-art limpio:** en `game/render_world.js` se aplica `source-atop` sobre un lienzo offscreen cacheado (`_kitTintCanvas`), tiñendo únicamente los píxeles opacos del sprite sin manchar el césped ni perder bordes pixel-art.

## Etapa 16 — Estadio y Finales Especiales (`career/ambiente_core.js`, `game/eventos_especiales.js`, `game/render_hud.js`, `game/postpartido.js`)
- **Clasificación estricta (`clasificarEventoEspecial`):** reserva la presentación de gala exclusivamente para:
  1. `supercopa` (*Supercopa Chaquito*),
  2. `final_copa` (*Gran Final de Copa Chaquito*),
  3. `partido_decisivo_liga` (últimas 2 fechas peleando el título en el Top 3 a `<= 3` pts del líder),
  4. `clasico_alta_rivalidad` (clásico con rivalidad `>= 75/100`).
  Los partidos normales permanecen como `normal` (`esEspecial: false`).
- **Puesta en escena en cancha y previa:** entrada ceremonial con haces de reflectores, doble marco dorado/temático, ícono pixel-art del trofeo sobre el `VS`, carteles LED perimetrales sobre las vallas, pedestal con copa dorada junto a la línea media en finales, lluvia de confeti de bienvenida y banner `🏆 ¡CAMPEÓN!` sobre el césped al ganar una final.

## Etapa 17 — Sección `MI CLUB` (`career/mi_club.js`, `game/mi_club_ui.js`, `career/store.js`, `index.html`, `css/screens.css`)
- **Nueva pantalla dedicada `#club-screen` (`🏛 MI CLUB`):** accesible desde el selector de modos (`#mode-menu`), Liga, Copa y la pestaña Perfil de `SOCIAL`.
- **Datos 100% reales y persistidos (`CarreraStore.estadisticasClub` + `construirFichaMiClub`):**
  - **Identidad:** escudo, estrellas, rango de reputación, KPIs históricos (`PJ`, victorias, empates, derrotas, goles históricos, goles recibidos, vallas invictas, efectividad), plantel oficial F8 (3 de campo + arquero), muestras de camiseta titular y suplente, y títulos honoríficos desbloqueados.
  - **Vitrina y Récords:** trofeos ganados por ese club (`Ligas`, `Copas`, `Supercopas`, `Finales`), récords verificables (`Mayor goleada`, `Mayor remontada` detectada minuto a minuto cuando el club revierte desventaja, `Mejor racha de victorias`, `Mayor invicto`, `Partidos seguidos marcando`) y distinciones individuales obtenidas.
  - **Campañas y Rivales:** objetivo de temporada en curso, principales rivalidades/clásicos con historial `G/E/P` y registro de temporadas cerradas.

## Etapa 18 — Premios de Temporada y Ceremonia Final (`career/premios.js`, `liga.js`, `career/store.js`)
- **Contabilidad individual real + simulada coherente (`registrarStatsPartidoEnLiga`):** combina las estadísticas exactas de `MatchStats` de los partidos jugados por el usuario con estadísticas coherentes repartidas sobre los planteles canónicos (`sim/planteles.js`) en los cruces simulados de IA.
- **8 Premios Oficiales al cierre de la Liga (`calcularPremiosTemporada`):**
  1. 🏆 `CAMPEÓN OFICIAL`
  2. ⭐ `MEJOR JUGADOR` (Balón Chaquito al mayor impacto integral)
  3. 👟 `BOTÍN DE ORO` (máximo goleador)
  4. 🧤 `MEJOR ARQUERO` (vallas invictas, atajadas y menor goleo recibido)
  5. 🎯 `MEJOR ASISTENTE` (líder en pases de gol)
  6. 🚀 `EQUIPO REVELACIÓN` (mayor superación respecto a sus estrellas iniciales)
  7. 🔥 `PARTIDO DEL AÑO` (encuentro más vibrante y goleado del fixture)
  8. ⚡ `MEJOR RACHA` (mayor seguidilla de victorias / invicto en el torneo)
- **Ceremonia y persistencia:** modal automático al concluir la temporada (`_mostrarCeremoniaPremios`), botón `🏅 VER CEREMONIA DE PREMIOS` en la tarjeta final de Liga y guardado permanente en `CarreraStore.premiosHistorial` conectado con la vitrina de `MI CLUB`.

## Cobertura de Tests (`tests/fase_c_ambiente_club_premios.test.mjs`)
- Suite automatizada verificando detección de palo/travesaño, los 12 estados de `ControladorHinchada`, las 5 variantes de clima + `reduceMotion`, camisetas alternativas y choque cromático en los 13 clubes, clasificación estricta de eventos especiales, cálculo de los 8 premios de temporada y construcción integral de `MI CLUB`.

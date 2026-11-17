# Menú principal con actores animados (v28 → v29)

## v29 — Fix botones (crítico)
La portada nueva (`pantalla.webp` / `menu_celular.webp`) tiene los botones **más arriba** que la anterior.
Las zonas clicables seguían calibradas a la portada vieja → en celular quedaban en el césped vacío y parecía que no funcionaban.

Zonas recalibradas:
- **PC**: PLAY top 60%, RANK/SET top 63%
- **Celular**: PLAY top 43%, RANK/SET top 54%
- Landscape móvil ajustado igual

## Assets (v28)
- `pantalla.webp`, `menu_celular.webp` actualizados
- Actores: `menu_char_left/right.webp`, `menu_ball_mini/yellow.webp` con animaciones CSS
- SOCIAL y motor intactos (amigos por cuenta, sync remoto)

# Mejoras motor de juego – v22

## 1. Duración de partidos (mitad)
- `CONFIG.MATCH_SECONDS`: 180 → **90**
- Prematch / countdown / celebración ligeramente acortados para que el ritmo general se sienta coherente con partidos más cortos.

## 2. Jugabilidad (controles + fluidez)
- Velocidad base y sprint subidas (`PLAYER_SPEED` 2.55, `PLAYER_SPRINT` 3.55).
- Aceleración de controles más reactiva (`response` 0.28 caminar / 0.34 sprint; antes ~0.19/0.22).
- Al soltar teclas: **desaceleración suave** en vez de freno a cero (más fluido).
- Pelota: fricción 0.968, stop threshold 0.10, rebotes un poco más controlados.
- Pases/remates y cooldown de patada más snappy (`kickCooldown` 14 frames).
- Stamina y barridas ligeramente más permisivos para no castigar el ritmo de partidos de 90 s.

## 3. Sistema de estrellas (1–5) por equipo
Cada equipo en `assets/equipos.js` tiene `estrellas` (1 a 5).

### API en `LigaCore` (liga.js)
- `perfilDesdeEstrellas(n)` → `{ estrellas, fuerza, ataque, defensa }`
- `estrellasDeEquipo(id)` → lee de `EQUIPOS`
- `clampEstrellas(n)`

### Matemáticas
- fuerza ≈ 0.50 + e×0.144  (1★ ≈ 0.64 … 5★ ≈ 1.22)
- ataque / defensa con curvas propias
- Simulación Poisson:
  - forma del día ±14 %
  - ventaja de local 1.14
  - ratio de fuerza suaviza goleadas extremas
- Al crear la liga se guarda `liga.estrellas` y `liga.fuerza` derivadas (estables durante el torneo).

### Estrellas actuales
| Equipo       | ★ |
|--------------|---|
| MACABRO      | 5 |
| MONARCA F.C. | 5 |
| EL BOGUERO   | 4 |
| BARRIO FINO  | 4 |
| TROTENHAM    | 4 |
| CATTARINO    | 3 |
| CHOBORRA     | 3 |
| NORWHISKY    | 3 |
| BOTAJOGO     | 3 |
| RETONETA     | 2 |
| AGUSTINTOS   | 2 |
| LA TIKINETA  | 2 |

Para cambiar el rating de un equipo, editar `estrellas` en `assets/equipos.js` (o regenerar desde tools).

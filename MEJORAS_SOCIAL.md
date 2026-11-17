# SOCIAL integrado (v26)

- Botón **SOCIAL** en el menú principal (PC arriba a la derecha; celular esquina superior).
- Panel con pestañas: RANKING · PERFIL · AMIGOS · PARTIDOS.
- Amigos se guardan **por cuenta** en `localStorage` y se sincronizan con el servidor:
  - `GET /api/amigos` / `PUT /api/amigos` (requiere sesión).
  - JSON: campo `amigos` en cada cuenta de `liga.json`.
  - Postgres: tabla `amigos`.
- Invitaciones con link `?invita=Nombre`.
- No es un módulo aparte: usa `#menu-dialog`, `AuthStore`, `RankingStore` y el mismo estilo pixel.

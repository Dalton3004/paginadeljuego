# FASE 1 — Seguridad y trampas (sobre etapa4)

## Cambios

### 1.1 Ranking / POST /api/partido
- Modos `solo` y `liga` **no suman** al ranking global (solo historial).
- El cliente **no puede** anotar `modo: "online"` (403).
- Validación de coherencia gf/gc vs win/loss/draw.
- Tope de 40 partidos cliente por hora por cuenta.
- Rechazo de `partidoId` repetido (ya existía).
- Online solo vía `anotarOnline` del servidor.

### 1.2 Rate limiting
- `/api/*` por IP (120/min).
- Login/registro con ventanas más estrictas y bloqueo temporal tras fallos repetidos.
- Mensajes claros en español rioplatense.

### 1.3 scrypt asíncrono
- `crypto.scrypt` promisificado en JSON y Postgres.
- Mismos parámetros → hashes existentes siguen válidos.

### 1.4 Validación de registro
- Contraseña ≥ 8 caracteres.
- Nombre: letras (con tildes/ñ), números, `_`, espacios simples.
- Nombres reservados rechazados (admin, invitado, etc.).

### 1.5 CORS
- Variable `CORS_ORIGIN` (lista separada por comas, `same` o `*`).
- Por defecto mismo origen; se quitó `*`.
- Express + Socket.IO alineados.

### 1.6 Socket.IO
- Límite msg/s en `input` (90) y `buscar_partido` (2).
- Validación de tipos/tamaño de payload de input.
- Desconexión tras abusos repetidos.

### 1.7 XSS / esc()
- `utils_ui.js` con `window.esc` única.
- ranking/social/settings/liga/online/equipos usan esa función.
- `game/online.js` ya no inserta `eq.nombre` sin escapar.

### 1.8 Cabeceras de seguridad
- CSP compatible (audio, img, ws, fonts Google).
- X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Sin dependencia `helmet`.

### 1.9 Sesiones
- TTL 14 días con renovación en `/api/yo`.
- `POST /api/logout-todos` cierra en todos los dispositivos.
- `POST /api/cambiar-clave` cambia hash e invalida sesiones previas (devuelve token nuevo).

## Archivos tocados
- server.js
- persistencia.js, persistencia_json.js, persistencia_pg.js
- utils_ui.js (nuevo)
- index.html
- settings.js, ranking.js, social.js, liga.js
- game/online.js, game/equipos.js
- CHANGELOG_FASE1.md

## Cómo probar a mano
1. `npm test` — todos verdes.
2. Registro con pass < 8 → error; nombre `admin` → reservado.
3. Login fallido muchas veces → bloqueo temporal.
4. Partido solo/liga logueado → historial sí, ranking pts no cambian.
5. POST /api/partido con modo online → 403.
6. Online real → al terminar suma ranking (servidor).
7. Headers: `curl -I http://localhost:3001/` debe mostrar CSP y nosniff.
8. Cambiar clave → otras pestañas quedan sin sesión.

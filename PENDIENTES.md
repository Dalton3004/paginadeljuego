# Pendientes y decisiones

## Qué NO se pudo verificar acá
- **Servidor y sockets:** no había `node_modules` ni red. Los tests que levantan el servidor (`server`, `auth_sesion`, `obs_http`, `admin_http`) **no se corrieron**; se revisó la sintaxis y se probó a mano la lógica de las rutas admin con un `express` de mentira.
- **Navegador:** la PWA (instalación, caché sin conexión), la vibración y las pantallas no se probaron en un celular real.
- **ESLint y Prettier:** no se corrieron. El CI corre `npm run lint` (solo ESLint); `lint:all` también valida formato y puede quejarse del código existente.
- **PostgreSQL:** ningún cambio lo toca, pero tampoco se probó.
- Pasaron 46 tests que no dependen de paquetes (sim, netsync, online, obs, carga, perfil, replay, pwa).

## Hay que hacer al desplegar
- `npm install` y `npm run build`: el `dist/` incluido es viejo.
- `package-lock.json` no incluye `@sentry/node` (dependencia opcional); `npm install` lo actualiza. Si tu hosting usa `npm ci` va a fallar hasta que subas el lock actualizado.
- Completar autor y licencia en `CREDITS.md` (todo lo marcado COMPLETAR). No los inventé porque no se pueden deducir de los archivos.

## No integrado de F6 / F7 / F8
| Qué | Motivo |
|---|---|
| Menús y pantallas dibujadas en canvas (pausa, tutorial, sala de espera, cola, ranking, ajustes, accesibilidad), `config.js`, `game/input.js`, HUD, `render_world.js` | Estaban hechas para un menú y un motor de prueba. El juego real ya tiene menú, ajustes, cola con ventana de nivel, táctil y HUD; pisarlos lo rompía |
| Liga (7.5) y equipos/tácticas (7.2) | El juego real tiene `liga.js` y equipos propios más completos |
| **Estadísticas del partido (6.3)**: posesión, tiros, pases, barridas | La versión entregada las infiere de rebotes de una pelota de prueba. Hay que contarlas desde los eventos del motor real; es lo más valioso que falta |
| **Ranking por período, búsqueda y paginación (7.6)** | Exige cambiar `persistencia_json.js` y `persistencia_pg.js` a la vez, y Postgres no se puede probar acá |
| **Borrar cuenta (7.7)** | Mismo motivo. Hoy se pide al administrador (lo dice `CREDITS.md`) |
| Cambio de contraseña desde la UI | El servidor ya tiene `cambiarClave`; falta la pantalla |
| Accesibilidad (daltónico, fuente legible, contraste, foco por teclado), hinchada dinámica, cámara/climas/camisetas alternativas | Dependen de la UI de prueba o del render real; sin un navegador para probar no quise tocarlos a ciegas |
| Táctil configurable y editable (8.1) | Idem; el táctil real es más grande y no se reescribió |
| Equipo favorito en el perfil | El historial no guarda el equipo jugado |

## Decisiones tomadas
- **Replay:** el módulo está, pero sin conectar al render.
- **`/metrics` es público**, como en el entregable original. Si el servidor está expuesto a internet conviene protegerlo con `ADMIN_TOKEN` (cambio chico).
- **Latencia del cliente** cada 15 s y solo con la pestaña visible (el original usaba 5 s siempre).
- **`/client-errors`** con límite de 30 por minuto por IP y campos recortados.
- **Sentry apagado por defecto**; solo se activa con `SENTRY_ENABLED=1` y `SENTRY_DSN`.
- **Service worker:** nunca cachea API, sockets, métricas ni admin; los `.json` y `.css` se refrescan en segundo plano para no servir datos viejos tras un deploy.
- **Quedó la versión del juego real** de `eslint.config.js`, `netsync.js`, `sim/gestor.js` y `partido_online.js`; las de los entregables eran esqueletos.
- **Perfil** calculado sobre los últimos 30 partidos, que es lo que devuelve el historial hoy.

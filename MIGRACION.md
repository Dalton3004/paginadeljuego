# Guía de migración de datos

## 1. Actualizar desde la versión anterior
Esta entrega **no cambia ningún formato de datos**. Cuentas, ranking, partidos y amigos siguen en el mismo `liga.json` o en las mismas tablas de PostgreSQL; basta con reemplazar el código y reiniciar.

Antes de actualizar, por las dudas, bajá un respaldo (sección 3).

Del lado del navegador tampoco hace falta migrar: la nueva opción de vibración no existe en los ajustes viejos y se toma como activada; la liga y el ranking offline (`localStorage`) siguen igual.

Después de desplegar:
1. `npm install` y `npm run build` (el `dist/` viejo no tiene la telemetría ni el registro del service worker).
2. Si cambiás `VERSION_JUEGO` en `config.js`, cambiá también `CACHE` en `sw.js` (hay un test que avisa si no coinciden). Eso renueva la caché de los jugadores.

## 2. Dónde viven los datos
| Modo | Cuándo | Ubicación |
|---|---|---|
| PostgreSQL | Existe `DATABASE_URL` o `DATABASE_PRIVATE_URL` | Tablas de `schema.sql` (se crean solas) |
| Archivo JSON | Sin base de datos | `liga.json` en el primer lugar que aplique: `LIGA_DATA` → `LIGA_DATA_DIR` / `DATA_DIR` / `RAILWAY_VOLUME_MOUNT_PATH` → `/data` o `/var/data` → `~/.liga-chaquito-f8/` → `data/` del proyecto |

En modo JSON se conserva un `.bak` y una copia por día de los últimos 7 días. Un archivo roto nunca se reemplaza por uno vacío.
Si definís `UPSTASH_REDIS_REST_URL`+`TOKEN` o `GITHUB_TOKEN`+`GIST_ID`, las cuentas se respaldan además en ese servicio y se recuperan al arrancar.

## 3. Respaldar y restaurar (sirve para cualquier modo)
Necesita `ADMIN_TOKEN` definido en el servidor.
```bash
# Bajar respaldo
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://TU-SERVIDOR/api/admin/respaldo -o respaldo.json

# Restaurar (suma; ver abajo)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
     --data-binary @respaldo.json https://TU-SERVIDOR/api/admin/restaurar
```
También se baja desde la página `/admin`. El límite de tamaño al restaurar es 25 MB.
**Restaurar suma, no reemplaza:** nunca borra ni pisa las cuentas que ya existen. Para volver a un estado anterior hay que arrancar con datos vacíos y restaurar.

## 4. De archivo JSON a PostgreSQL
1. Dejá el `liga.json` donde está (o restauralo en el servidor nuevo, sección 3).
2. Definí `DATABASE_URL` (y `PGSSL=1` si tu proveedor lo pide) y reiniciá.
3. Al primer arranque el servidor crea las tablas e **importa solo el `liga.json` anterior** si lo encuentra; lo verás en el log como `importadas N cuenta(s)`.
4. Si el archivo está en otra máquina, usá el respaldo de la sección 3 contra el servidor con Postgres.

El camino inverso (Postgres a JSON) se hace igual: respaldo desde el servidor con Postgres y restauración en uno sin `DATABASE_URL`.

## 5. Mover a otro hosting
1. Respaldo del servidor viejo (sección 3).
2. En el nuevo, definí `ADMIN_TOKEN` y el almacenamiento (Volume, Postgres o respaldo remoto, ver `README.md`). Sin ninguno de los tres, Railway, Render, Fly.io y Glitch borran las cuentas en cada deploy.
3. Restaurá el respaldo y verificá en `/admin` (o `/api/salud`) que el conteo de cuentas coincida.
4. Las sesiones viajan en el respaldo, pero si algo falla alcanza con que cada jugador vuelva a iniciar sesión.

## 6. Datos de los prototipos F6/F7/F8 (`data/db.json`)
Esos entregables usaban otro formato (`usuarios` y `partidos` con resumen de estadísticas) y no tienen conexión con este esquema. **No se migraron**: eran prototipos sin datos de producción y no verifiqué que sus contraseñas se puedan convertir. Si hubiera cuentas reales ahí, hay que escribir un conversor aparte.

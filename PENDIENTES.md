# Estado de Cierre y Decisiones Técnicas (`v1.0.0`)

## Estado del Plan Maestro (Etapas 0 a 39)
- **Fases A a F completadas al 100% (`Etapa 0` a `Etapa 39`):**
  - ✅ **Estadísticas reales, Post-partido, Replay y Figura** (Fase A).
  - ✅ **Noticias, Conferencias, Reputación, Objetivos, Copa, Penales, Supercopa, Rachas y Rivalidades** (Fase B).
  - ✅ **Hinchada dinámica, Clima, Camisetas alternativas, Finales especiales, Mi Club y 8 Premios** (Fase C).
  - ✅ **Desafíos, Chaquito Arcade, Celebraciones, Atributos, Forma/Cansancio, Historia, Radio y Pre-Partido** (Fase D).
  - ✅ **Central Chaquito, Accesibilidad (daltónico, contraste, texto, movimiento, táctil diestro/zurdo), Equipo Favorito, Historial Permanente, 8 Récords, Frontera Online y Persistencia con Migración** (Fase E).
  - ✅ **Rendimiento sin GC, Suite de 7 Linters, QA E2E, Pulido Visual, Auditoría de Balance, Temporada Integrada y Release `v1.0.0`** (Fase F — ver `RELEASE_CHECKLIST.md`).

## Qué quedó fuera por alcance o requiere configuración al desplegar
| Ítem | Estado / Motivo |
|---|---|
| **Instancia PostgreSQL en vivo** | `schema.sql` y `persistencia_pg.js` incluyen las tablas y migraciones idempotentes (`equipo_favorito`, `carrera_json`) y son validados por `scripts/lint-project.mjs`, pero en desarrollo sin `DATABASE_URL` los tests corren contra `persistencia_json.js`. |
| **Créditos editoriales y contacto (`CREDITS.md`)** | Conviene revisar y completar autor/correo de contacto definitivo antes de publicar en un dominio comercial público. |
| **Borrado autoservicio de cuenta y filtros avanzados de ranking por período** | Mantienen el alcance original: la baja de cuenta se solicita al administrador (`ADMIN_TOKEN` / respaldo). |
| **Prueba física en teléfonos reales** | La responsividad (`< 400px`), Service Worker (`chaquito-v49`), táctil configurable y `reduceMotion` están implementados y cubiertos por tests, recomendándose una pasada visual rápida en iOS Safari / Android Chrome tras publicar. |

## Decisiones de Arquitectura Vigentes
- **`/metrics`:** expuesto en formato Prometheus/JSON; si el servidor se publica directo a internet sin proxy, se sugiere restringirlo en el reverse proxy.
- **Latencia y telemetría (`/client-errors`):** muestreo cada `15 s` solo con pestaña visible y rate-limit de `30/min` por IP.
- **Sentry opcional:** desactivado por defecto; se activa únicamente definiendo `SENTRY_ENABLED=1` y `SENTRY_DSN`.
- **Service Worker (`sw.js`):** excluye `/api/*`, `/socket.io/*`, `/metrics*` y `/admin*`, sirviendo `dist/` con invalidación controlada por `VERSION_JUEGO` (`v49`).
- **Separación competitiva estricta:** `online` corre exclusivamente con parámetros base del servidor autoritativo (`60 Hz`), mientras que `arcade` y `desafio` nunca alteran récords, carrera ni ranking oficial.

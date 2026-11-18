/**
 * Configuración del servidor Liga Chaquito F8.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";
import { TICK_HZ } from "./partido_online.js";

export const PORT = Number(process.env.PORT) || 3001;
export const ROOT = dirname(fileURLToPath(import.meta.url));
export const VERSION_JUEGO = "v46";

export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_CADA = 2;
export const TICK_BUDGET_MS = TICK_MS;
export const TICK_WARN_MS = TICK_MS * 0.85;
export const TICK_WARN_COOLDOWN_MS = 2000;

export const REVANCHA_MS = 45_000;
export const RECONNECT_MS = 15_000;

export const MM_VENTANA_BASE = 80;
export const MM_VENTANA_PASO = 40;
export const MM_VENTANA_CADA_MS = 4000;
export const MM_VENTANA_MAX = 2500;
export const MM_TICK_MS = 1000;

export const CORS_ORIGIN = (process.env.CORS_ORIGIN || "").trim();
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export const CODIGO_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODIGO_LEN = 5;

export function origenPermitido(origin) {
    if (!origin) return true;
    if (!CORS_ORIGIN || CORS_ORIGIN === "same") return true;
    if (CORS_ORIGIN === "*") return true;
    const lista = CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    return lista.includes(origin);
}

export function corsOriginRespuesta(origin) {
    if (!CORS_ORIGIN || CORS_ORIGIN === "same") return origin || false;
    if (CORS_ORIGIN === "*") return "*";
    return origenPermitido(origin) ? origin : false;
}

export function esAdmin(req) {
    if (!ADMIN_TOKEN) return false;
    const h = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
    const dado = h ? h[1] : String(req.query.clave || "");
    const a = createHash("sha256").update(dado).digest();
    const b = createHash("sha256").update(ADMIN_TOKEN).digest();
    try {
        return timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

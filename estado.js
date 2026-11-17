/**
 * Estado compartido del online (mapas en memoria).
 * Lo usan matchmaking.js y salas.js sin dependencias circulares de lógica.
 */
export const cuentaPorSocket = new Map();
export const nombrePorSocket = new Map();
export const cuentaActiva = new Map();
export const presenciaPorNombre = new Map();
export const presenciaNombreDe = new Map();

/** @type {{ id: string, pts: number, desde: number }[]} */
export const cola = [];
export const enCola = new Set();

export const salas = new Map();
export const salaDe = new Map();
export const equipoDe = new Map();
export const reconnectByToken = new Map();
export const salaPrivadaPorCodigo = new Map();
export const codigoPrivadoDe = new Map();

export const tickStats = {
    n: 0,
    sumMs: 0,
    maxMs: 0,
    overBudget: 0,
    lastWarnAt: 0,
};

/** io se asigna desde server.js al arrancar */
export let io = null;
export function setIo(instance) {
    io = instance;
}

export function equipoValido(raw) {
    const id = typeof raw === "string" ? raw.trim().slice(0, 32) : "";
    return /^[a-z0-9_]+$/.test(id) ? id : "";
}

export function nombreUsuario(socketId, respaldo) {
    const n = nombrePorSocket.get(socketId);
    return n ? String(n).slice(0, 24) : respaldo;
}

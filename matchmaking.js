/**
 * Matchmaking público (ventana de nivel), colas y salas privadas (código).
 */
import {
    MM_VENTANA_BASE, MM_VENTANA_PASO, MM_VENTANA_CADA_MS, MM_VENTANA_MAX, MM_TICK_MS,
    CODIGO_ALFABETO, CODIGO_LEN,
} from "./config.js";
import {
    io,
    cola, enCola, salas, salaDe, equipoDe, cuentaPorSocket, nombrePorSocket,
    cuentaActiva, presenciaPorNombre, presenciaNombreDe,
    salaPrivadaPorCodigo, codigoPrivadoDe,
    equipoValido,
} from "./estado.js";

export function ventanaNivel(esperaMs) {
    const pasos = Math.max(0, Math.floor(Number(esperaMs) / MM_VENTANA_CADA_MS));
    return Math.min(MM_VENTANA_MAX, MM_VENTANA_BASE + pasos * MM_VENTANA_PASO);
}

export function limpiarCuentaActivaSiStale(cuentaId) {
    const a = cuentaActiva.get(cuentaId);
    if (!a) return null;
    if (a.modo === "cola") {
        if (!enCola.has(a.socketId)) {
            cuentaActiva.delete(cuentaId);
            return null;
        }
        const sock = io?.sockets.sockets.get(a.socketId);
        if (!sock?.connected) {
            sacarDeCola(a.socketId);
            cuentaActiva.delete(cuentaId);
            return null;
        }
        return a;
    }
    if (a.modo === "privada") {
        if (!codigoPrivadoDe.has(a.socketId)) {
            cuentaActiva.delete(cuentaId);
            return null;
        }
        const sock = io?.sockets.sockets.get(a.socketId);
        if (!sock?.connected) {
            liberarSalaPrivadaDe(a.socketId);
            cuentaActiva.delete(cuentaId);
            return null;
        }
        return a;
    }
    if (a.modo === "partido") {
        const sala = a.salaId ? salas.get(a.salaId) : null;
        if (!sala) {
            cuentaActiva.delete(cuentaId);
            return null;
        }
        return a;
    }
    cuentaActiva.delete(cuentaId);
    return null;
}

export function actividadBloqueante(cuentaId, socketId) {
    if (!cuentaId) return null;
    const a = limpiarCuentaActivaSiStale(cuentaId);
    if (!a) return null;
    if (a.modo === "cola" || a.modo === "privada") {
        if (a.socketId === socketId) return null;
        return a;
    }
    if (a.modo === "partido") {
        const sala = salas.get(a.salaId);
        if (!sala) return null;
        if (sala.localId === socketId || sala.visitanteId === socketId) return null;
        return a;
    }
    return a;
}

export function marcarCuentaCola(cuentaId, socketId) {
    if (!cuentaId) return;
    cuentaActiva.set(cuentaId, { modo: "cola", socketId });
}
export function marcarCuentaPrivada(cuentaId, socketId) {
    if (!cuentaId) return;
    cuentaActiva.set(cuentaId, { modo: "privada", socketId });
}
export function marcarCuentaPartido(cuentaId, salaId) {
    if (!cuentaId || !salaId) return;
    cuentaActiva.set(cuentaId, { modo: "partido", salaId });
}
export function liberarCuentaSiSocket(cuentaId, socketId) {
    if (!cuentaId) return;
    const a = cuentaActiva.get(cuentaId);
    if (!a) return;
    if ((a.modo === "cola" || a.modo === "privada") && a.socketId === socketId) {
        cuentaActiva.delete(cuentaId);
    }
}
export function liberarCuentasDeSala(sala) {
    if (!sala) return;
    for (const cid of [sala.localCuenta, sala.visitCuenta]) {
        if (!cid) continue;
        const a = cuentaActiva.get(cid);
        if (a && a.modo === "partido" && a.salaId === sala.id) cuentaActiva.delete(cid);
    }
}
export function mensajeOcupado(act) {
    if (!act) return "Ya estás en una actividad online.";
    if (act.modo === "cola") return "Esta cuenta ya está buscando partido en otra sesión.";
    if (act.modo === "privada") return "Esta cuenta ya tiene una sala privada en otra sesión.";
    if (act.modo === "partido") return "Esta cuenta ya está en un partido.";
    return "Esta cuenta ya está en uso.";
}

export function estadoPresenciaDeSocket(socketId) {
    if (salaDe.has(socketId)) return "partido";
    if (codigoPrivadoDe.has(socketId)) return "privada";
    if (enCola.has(socketId)) return "cola";
    return "menu";
}
export function publicarPresencia(socketId) {
    const key = presenciaNombreDe.get(socketId);
    if (!key) return;
    const cur = presenciaPorNombre.get(key);
    if (!cur || cur.socketId !== socketId) return;
    cur.estado = estadoPresenciaDeSocket(socketId);
    presenciaPorNombre.set(key, cur);
}
export function registrarPresencia(socket, nombre, cuentaId) {
    const n = String(nombre || "").trim().slice(0, 24);
    if (!n || n.length < 2) return;
    const key = n.toLowerCase();
    const prev = presenciaPorNombre.get(key);
    if (prev && prev.socketId !== socket.id) presenciaNombreDe.delete(prev.socketId);
    presenciaPorNombre.set(key, {
        socketId: socket.id,
        nombre: n,
        cuentaId: cuentaId || null,
        estado: estadoPresenciaDeSocket(socket.id),
    });
    presenciaNombreDe.set(socket.id, key);
}
export function quitarPresencia(socketId) {
    const key = presenciaNombreDe.get(socketId);
    if (!key) return;
    presenciaNombreDe.delete(socketId);
    const cur = presenciaPorNombre.get(key);
    if (cur && cur.socketId === socketId) presenciaPorNombre.delete(key);
}
export function consultaPresencia(nombres) {
    const out = Object.create(null);
    const list = Array.isArray(nombres) ? nombres : [];
    for (const raw of list.slice(0, 40)) {
        const key = String(raw || "").trim().toLowerCase().slice(0, 24);
        if (!key) continue;
        const p = presenciaPorNombre.get(key);
        if (!p) { out[key] = "offline"; continue; }
        const sock = io?.sockets.sockets.get(p.socketId);
        if (!sock?.connected) {
            presenciaPorNombre.delete(key);
            presenciaNombreDe.delete(p.socketId);
            out[key] = "offline";
            continue;
        }
        p.estado = estadoPresenciaDeSocket(p.socketId);
        out[key] = p.estado === "menu" ? "online" : "ocupado";
    }
    return out;
}

export function generarCodigoPrivado() {
    for (let intento = 0; intento < 40; intento++) {
        let c = "";
        for (let i = 0; i < CODIGO_LEN; i++) c += CODIGO_ALFABETO[(Math.random() * CODIGO_ALFABETO.length) | 0];
        if (!salaPrivadaPorCodigo.has(c)) return c;
    }
    let c = "";
    for (let i = 0; i < 6; i++) c += CODIGO_ALFABETO[(Math.random() * CODIGO_ALFABETO.length) | 0];
    return c;
}
export function normalizarCodigo(raw) {
    if (typeof raw !== "string") return "";
    const c = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (c.length < 4 || c.length > 6) return "";
    return c;
}
export function liberarSalaPrivadaDe(socketId) {
    const codigo = codigoPrivadoDe.get(socketId);
    if (!codigo) return false;
    codigoPrivadoDe.delete(socketId);
    const host = salaPrivadaPorCodigo.get(codigo);
    if (host === socketId) salaPrivadaPorCodigo.delete(codigo);
    const cid = cuentaPorSocket.get(socketId);
    liberarCuentaSiSocket(cid, socketId);
    return true;
}

export function encolar(socketId, pts) {
    if (salaDe.has(socketId) || enCola.has(socketId)) return false;
    const p = Number.isFinite(pts) ? Math.max(0, Math.floor(pts)) : 0;
    cola.push({ id: socketId, pts: p, desde: Date.now() });
    enCola.add(socketId);
    return true;
}
export function sacarDeCola(socketId) {
    if (!enCola.delete(socketId)) return false;
    const indice = cola.findIndex((e) => e.id === socketId);
    if (indice !== -1) cola.splice(indice, 1);
    const cid = cuentaPorSocket.get(socketId);
    liberarCuentaSiSocket(cid, socketId);
    return true;
}
export function entradaCola(socketId) {
    return cola.find((e) => e.id === socketId) || null;
}
export function payloadEnCola(entrada, posicion) {
    const espera = Math.max(0, Date.now() - entrada.desde);
    return {
        posicion,
        segundos: Math.floor(espera / 1000),
        ventana: ventanaNivel(espera),
        pts: entrada.pts,
    };
}
export function notificarCola() {
    for (let i = 0; i < cola.length; i++) {
        const e = cola[i];
        const sock = io?.sockets.sockets.get(e.id);
        if (!sock || !sock.connected) continue;
        sock.emit("en_cola", payloadEnCola(e, i + 1));
    }
}

/** @type {null | ((a: import('socket.io').Socket, b: import('socket.io').Socket) => void)} */
let _crearSala = null;
export function setCrearSala(fn) {
    _crearSala = fn;
}

export function emparejar() {
    const ahora = Date.now();
    for (let i = cola.length - 1; i >= 0; i--) {
        const e = cola[i];
        const sock = io?.sockets.sockets.get(e.id);
        if (!sock?.connected || salaDe.has(e.id)) {
            enCola.delete(e.id);
            cola.splice(i, 1);
        }
    }
    if (cola.length < 2) return;

    const orden = cola
        .map((e) => ({ e, espera: ahora - e.desde }))
        .sort((a, b) => b.espera - a.espera);

    const usados = new Set();
    const pares = [];

    for (const { e } of orden) {
        if (usados.has(e.id)) continue;
        const esperaA = ahora - e.desde;
        const venA = ventanaNivel(esperaA);
        let mejor = null;
        let mejorDiff = Infinity;
        const cuentaA = cuentaPorSocket.get(e.id) || null;
        for (const otro of cola) {
            if (otro.id === e.id || usados.has(otro.id)) continue;
            const cuentaB = cuentaPorSocket.get(otro.id) || null;
            if (cuentaA && cuentaB && cuentaA === cuentaB) continue;
            const esperaB = ahora - otro.desde;
            const venB = ventanaNivel(esperaB);
            const ven = Math.max(venA, venB);
            const diff = Math.abs(e.pts - otro.pts);
            if (diff <= ven && diff < mejorDiff) {
                mejor = otro;
                mejorDiff = diff;
            }
        }
        if (mejor) {
            usados.add(e.id);
            usados.add(mejor.id);
            pares.push([e.id, mejor.id]);
        }
    }

    for (const [idA, idB] of pares) {
        const entA = entradaCola(idA);
        const entB = entradaCola(idB);
        const ptsA = entA ? entA.pts : 0;
        const ptsB = entB ? entB.pts : 0;
        const desdeA = entA ? entA.desde : ahora;
        const desdeB = entB ? entB.desde : ahora;
        const sockA = io?.sockets.sockets.get(idA);
        const sockB = io?.sockets.sockets.get(idB);
        sacarDeCola(idA);
        sacarDeCola(idB);
        if (sockA?.connected && sockB?.connected && !salaDe.has(idA) && !salaDe.has(idB) && _crearSala) {
            if (desdeA <= desdeB) _crearSala(sockA, sockB);
            else _crearSala(sockB, sockA);
        } else {
            if (sockA?.connected && !salaDe.has(idA) && !enCola.has(idA)) {
                cola.push({ id: idA, pts: ptsA, desde: desdeA });
                enCola.add(idA);
            }
            if (sockB?.connected && !salaDe.has(idB) && !enCola.has(idB)) {
                cola.push({ id: idB, pts: ptsB, desde: desdeB });
                enCola.add(idB);
            }
        }
    }
}

export function iniciarLoopMatchmaking() {
    setInterval(() => {
        try {
            emparejar();
            notificarCola();
        } catch (e) {
            console.error("[mm]", e && e.message ? e.message : e);
        }
    }, MM_TICK_MS);
}

export { MM_TICK_MS };

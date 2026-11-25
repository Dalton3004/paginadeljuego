/**
 * Salas de partido online: creación, tick 60 Hz, reconexión, revancha, abandono.
 */
import { randomUUID } from "node:crypto";
import { Partido } from "./partido_online.js";
import {
    TICK_MS, SNAPSHOT_CADA, TICK_BUDGET_MS, TICK_WARN_MS, TICK_WARN_COOLDOWN_MS,
    REVANCHA_MS, RECONNECT_MS,
} from "./config.js";
import {
    io, salas, salaDe, equipoDe, cuentaPorSocket, nombrePorSocket,
    reconnectByToken, tickStats, nombreUsuario,
} from "./estado.js";
import {
    marcarCuentaPartido, liberarCuentasDeSala, publicarPresencia,
} from "./matchmaking.js";
import { anotarOnline } from "./persistencia.js";
import { metrics } from "./obs/metrics.js";
import { registrarError } from "./obs/errors.js";

export function cuentaDeLado(sala, lado) {
    if (lado === "local") return sala.localCuenta || cuentaPorSocket.get(sala.localId) || null;
    return sala.visitCuenta || cuentaPorSocket.get(sala.visitanteId) || null;
}

export async function guardarRankingSala(sala) {
    const p = sala.partido;
    const gl = p.golesLocal;
    const gv = p.golesVisitante;
    const resLocal = gl > gv ? "win" : gl < gv ? "loss" : "draw";
    const resVis = gv > gl ? "win" : gv < gl ? "loss" : "draw";
    const cLocal = cuentaDeLado(sala, "local");
    const cVis = cuentaDeLado(sala, "visitante");
    const statsLocal = typeof p.resumenPersistencia === "function" ? p.resumenPersistencia("local") : null;
    const statsVis = typeof p.resumenPersistencia === "function" ? p.resumenPersistencia("rival") : null;
    await Promise.all([
        cLocal ? anotarOnline({ cuentaId: cLocal, resultado: resLocal, gf: gl, gc: gv, partidoId: sala.id, stats: statsLocal }) : null,
        cVis ? anotarOnline({ cuentaId: cVis, resultado: resVis, gf: gv, gc: gl, partidoId: sala.id, stats: statsVis }) : null,
    ]);
    if (cLocal || cVis) io.to(sala.id).emit("ranking_actualizado");
}

export function payloadPartidoListo(sala, rol) {
    return {
        salaId: sala.id,
        localId: sala.localId,
        visitanteId: sala.visitanteId,
        rol,
        equipos: {
            local: sala.partido.equipoLocalId || "",
            visitante: sala.partido.equipoVisitanteId || "",
        },
        nombres: sala.partido.nombres,
        reconnectToken: rol === "Local" ? sala.localToken : sala.visitToken,
        reconnectMs: RECONNECT_MS,
    };
}

export function crearSala(sockLocal, sockVisitante) {
    const salaId = randomUUID();
    const partido = new Partido(
        salaId,
        sockLocal.id,
        sockVisitante.id,
        equipoDe.get(sockLocal.id) || "",
        equipoDe.get(sockVisitante.id) || "",
        {
            local: nombreUsuario(sockLocal.id, "Invitado 1"),
            visitante: nombreUsuario(sockVisitante.id, "Invitado 2"),
        },
    );
    const localToken = randomUUID();
    const visitToken = randomUUID();
    equipoDe.delete(sockLocal.id);
    equipoDe.delete(sockVisitante.id);
    const sala = {
        id: salaId,
        localId: sockLocal.id,
        visitanteId: sockVisitante.id,
        localToken,
        visitToken,
        localCuenta: cuentaPorSocket.get(sockLocal.id) || null,
        visitCuenta: cuentaPorSocket.get(sockVisitante.id) || null,
        partido,
        timer: setInterval(() => {
            try {
                tickSala(salaId);
            } catch (e) {
                registrarError("servidor", e, { sala: salaId });
            }
        }, TICK_MS),
        desconexion: null,
        revancha: null,
    };
    salas.set(salaId, sala);
    salaDe.set(sockLocal.id, salaId);
    salaDe.set(sockVisitante.id, salaId);
    reconnectByToken.set(localToken, { salaId, lado: "local" });
    reconnectByToken.set(visitToken, { salaId, lado: "visitante" });
    sockLocal.join(salaId);
    sockVisitante.join(salaId);

    sockLocal.emit("partido_listo", payloadPartidoListo(sala, "Local"));
    sockVisitante.emit("partido_listo", payloadPartidoListo(sala, "Visitante"));
    io.to(salaId).emit("estado_juego", partido.snapshot());
    if (sala.localCuenta) marcarCuentaPartido(sala.localCuenta, salaId);
    if (sala.visitCuenta) marcarCuentaPartido(sala.visitCuenta, salaId);
    publicarPresencia(sockLocal.id);
    publicarPresencia(sockVisitante.id);
    console.log(`[partido] ${salaId} Local=${sockLocal.id} Visitante=${sockVisitante.id}`);
}

export function tickSala(salaId) {
    const t0 = process.hrtime.bigint();
    const sala = salas.get(salaId);
    if (!sala) return;
    if (sala.desconexion) return;

    const antes = sala.partido.estado;
    sala.partido.avanzar();
    if (sala.partido.estado === "CELEBRANDO_GOL" && antes !== "CELEBRANDO_GOL") {
        const gol = sala.partido.gestor && sala.partido.gestor.ultimoGol;
        if (gol) io.to(salaId).emit("gol_partido", { salaId, gol });
    }
    if (sala.partido.estado === "FINALIZADO" && antes !== "FINALIZADO") {
        const resumen = typeof sala.partido.resumenFinal === "function" ? sala.partido.resumenFinal() : null;
        if (resumen) io.to(salaId).emit("resumen_partido", { salaId, stats: resumen });
        if (!sala.partido.rankingGuardado) {
            sala.partido.rankingGuardado = true;
            setImmediate(() => {
                guardarRankingSala(sala).catch((e) => console.error("[ranking] no se pudo guardar:", e.message));
            });
        }
        abrirVentanaRevancha(sala);
    }
    const cambio = sala.partido.estado !== antes;
    if (cambio || sala.partido.tick % SNAPSHOT_CADA === 0) {
        const confiable = cambio || sala.partido.estado !== "EN_JUEGO" || sala.partido.tick % 30 === 0;
        const destino = confiable ? io.to(salaId) : io.to(salaId).volatile;
        destino.emit("estado_juego", sala.partido.snapshot());
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    metrics.observe("tick_ms", ms);
    tickStats.n += 1;
    tickStats.sumMs += ms;
    if (ms > tickStats.maxMs) tickStats.maxMs = ms;
    if (ms > TICK_BUDGET_MS) {
        tickStats.overBudget += 1;
        const ahora = Date.now();
        if (ahora - tickStats.lastWarnAt >= TICK_WARN_COOLDOWN_MS) {
            tickStats.lastWarnAt = ahora;
            console.warn(
                `[tick] sala ${salaId} tardó ${ms.toFixed(2)} ms (presupuesto ${TICK_BUDGET_MS.toFixed(1)} ms) · ` +
                `overBudget=${tickStats.overBudget}/${tickStats.n}`
            );
        }
    } else if (ms > TICK_WARN_MS) {
        const ahora = Date.now();
        if (ahora - tickStats.lastWarnAt >= TICK_WARN_COOLDOWN_MS * 2) {
            tickStats.lastWarnAt = ahora;
            console.warn(`[tick] sala ${salaId} cerca del límite: ${ms.toFixed(2)} ms`);
        }
    }
}

function limpiarTokensSala(sala) {
    if (sala.localToken) reconnectByToken.delete(sala.localToken);
    if (sala.visitToken) reconnectByToken.delete(sala.visitToken);
}
export function cancelarEsperaReconexion(sala) {
    if (!sala || !sala.desconexion) return;
    if (sala.desconexion.timer) clearTimeout(sala.desconexion.timer);
    sala.desconexion = null;
}
function cancelarTimerRevancha(sala) {
    if (sala && sala.revancha && sala.revancha.timer) {
        clearTimeout(sala.revancha.timer);
        sala.revancha.timer = null;
    }
}
export function abrirVentanaRevancha(sala) {
    if (!sala || sala.revancha) return;
    sala.revancha = {
        local: null,
        visitante: null,
        hasta: Date.now() + REVANCHA_MS,
        timer: setTimeout(() => {
            const s = salas.get(sala.id);
            if (!s || !s.revancha) return;
            if (s.revancha.local === true && s.revancha.visitante === true) {
                iniciarRevancha(s);
                return;
            }
            emitirRevanchaResultado(s, false, "timeout");
            destruirSala(s.id, "revancha_timeout", null);
        }, REVANCHA_MS),
    };
    emitirRevanchaEstado(sala);
    console.log(`[revancha] sala ${sala.id} ventana ${REVANCHA_MS / 1000}s`);
}
function emitirRevanchaEstado(sala) {
    if (!sala || !sala.revancha) return;
    const seg = Math.max(0, Math.ceil((sala.revancha.hasta - Date.now()) / 1000));
    io.to(sala.id).emit("revancha_estado", {
        local: sala.revancha.local,
        visitante: sala.revancha.visitante,
        segundos: seg,
    });
}
function emitirRevanchaResultado(sala, ok, motivo) {
    if (!sala) return;
    io.to(sala.id).emit("revancha_resultado", { ok: !!ok, motivo: motivo || null });
}
export function iniciarRevancha(sala) {
    if (!sala || !sala.partido) return;
    cancelarTimerRevancha(sala);
    sala.revancha = null;
    cancelarEsperaReconexion(sala);

    const sockLocalNuevo = io.sockets.sockets.get(sala.visitanteId);
    const sockVisitNuevo = io.sockets.sockets.get(sala.localId);
    if (!sockLocalNuevo?.connected || !sockVisitNuevo?.connected) {
        emitirRevanchaResultado(sala, false, "desconexion");
        destruirSala(sala.id, "revancha_desconexion", null);
        return;
    }

    const eqLocal = sala.partido.equipoVisitanteId || "";
    const eqVisit = sala.partido.equipoLocalId || "";
    const nombres = {
        local: (sala.partido.nombres && sala.partido.nombres.visitante) || "Invitado 1",
        visitante: (sala.partido.nombres && sala.partido.nombres.local) || "Invitado 2",
    };
    const nuevoLocalId = sala.visitanteId;
    const nuevoVisitId = sala.localId;
    const nuevaLocalCuenta = sala.visitCuenta;
    const nuevaVisitCuenta = sala.localCuenta;

    limpiarTokensSala(sala);
    const localToken = randomUUID();
    const visitToken = randomUUID();

    sala.localId = nuevoLocalId;
    sala.visitanteId = nuevoVisitId;
    sala.localCuenta = nuevaLocalCuenta;
    sala.visitCuenta = nuevaVisitCuenta;
    sala.localToken = localToken;
    sala.visitToken = visitToken;
    sala.partido = new Partido(sala.id, nuevoLocalId, nuevoVisitId, eqLocal, eqVisit, nombres);

    reconnectByToken.set(localToken, { salaId: sala.id, lado: "local" });
    reconnectByToken.set(visitToken, { salaId: sala.id, lado: "visitante" });
    salaDe.set(nuevoLocalId, sala.id);
    salaDe.set(nuevoVisitId, sala.id);

    emitirRevanchaResultado(sala, true, "ok");
    sockLocalNuevo.emit("partido_listo", payloadPartidoListo(sala, "Local"));
    sockVisitNuevo.emit("partido_listo", payloadPartidoListo(sala, "Visitante"));
    io.to(sala.id).emit("estado_juego", sala.partido.snapshot());
    if (sala.localCuenta) marcarCuentaPartido(sala.localCuenta, sala.id);
    if (sala.visitCuenta) marcarCuentaPartido(sala.visitCuenta, sala.id);
    console.log(`[revancha] sala ${sala.id} nuevo partido (lados invertidos)`);
}
export function registrarVotoRevancha(sala, lado, aceptar) {
    if (!sala || !sala.revancha) return { ok: false, error: "no hay ventana de revancha" };
    if (lado !== "local" && lado !== "visitante") return { ok: false, error: "lado inválido" };
    if (sala.revancha[lado] != null) return { ok: false, error: "ya votaste" };
    sala.revancha[lado] = !!aceptar;
    emitirRevanchaEstado(sala);
    if (sala.revancha.local === false || sala.revancha.visitante === false) {
        cancelarTimerRevancha(sala);
        emitirRevanchaResultado(sala, false, "rechazo");
        setTimeout(() => {
            if (salas.has(sala.id)) destruirSala(sala.id, "revancha_rechazo", null);
        }, 400);
        return { ok: true, resultado: "rechazo" };
    }
    if (sala.revancha.local === true && sala.revancha.visitante === true) {
        iniciarRevancha(sala);
        return { ok: true, resultado: "inicio" };
    }
    return { ok: true, resultado: "pendiente" };
}

export function destruirSala(salaId, motivo, idQueSalio) {
    const sala = salas.get(salaId);
    if (!sala) return;
    cancelarTimerRevancha(sala);
    sala.revancha = null;
    cancelarEsperaReconexion(sala);
    clearInterval(sala.timer);
    liberarCuentasDeSala(sala);
    salas.delete(salaId);
    salaDe.delete(sala.localId);
    salaDe.delete(sala.visitanteId);
    limpiarTokensSala(sala);
    for (const id of [sala.localId, sala.visitanteId]) {
        if (!id || id === idQueSalio) continue;
        const rival = io.sockets.sockets.get(id);
        if (!rival) continue;
        rival.leave(salaId);
        rival.emit("sala_destruida", { salaId, motivo });
    }
    console.log(`[sala] ${salaId} destruida (${motivo})`);
}

export function ladoDeSocketEnSala(sala, socketId) {
    if (sala.localId === socketId) return "local";
    if (sala.visitanteId === socketId) return "visitante";
    return null;
}
export function socketRivalId(sala, lado) {
    return lado === "local" ? sala.visitanteId : sala.localId;
}

export function iniciarEsperaReconexion(sala, socketId) {
    const lado = ladoDeSocketEnSala(sala, socketId);
    if (!lado) return;
    if (sala.desconexion) {
        destruirSala(sala.id, "ambos_desconectados", socketId);
        return;
    }
    if (sala.partido.estado === "FINALIZADO") {
        if (sala.revancha) {
            const ladoR = ladoDeSocketEnSala(sala, socketId);
            if (ladoR) registrarVotoRevancha(sala, ladoR, false);
        } else {
            destruirSala(sala.id, "rival_desconectado", socketId);
        }
        return;
    }
    salaDe.delete(socketId);
    const token = lado === "local" ? sala.localToken : sala.visitToken;
    const segundos = Math.round(RECONNECT_MS / 1000);
    sala.desconexion = {
        lado,
        socketId,
        desde: Date.now(),
        token,
        timer: setTimeout(() => resolverAbandono(sala.id, lado), RECONNECT_MS),
    };
    const rivalId = socketRivalId(sala, lado);
    const rival = rivalId ? io.sockets.sockets.get(rivalId) : null;
    if (rival) {
        rival.emit("rival_reconectando", {
            salaId: sala.id,
            segundos,
            mensaje: `Rival reconectando… (${segundos}s)`,
        });
    }
    console.log(`[sala] ${sala.id} espera reconexión de ${lado} (${segundos}s)`);
}

export async function resolverAbandono(salaId, ladoQueSeFue) {
    const sala = salas.get(salaId);
    if (!sala || !sala.desconexion || sala.desconexion.lado !== ladoQueSeFue) return;
    sala.desconexion = null;
    const ladoGanador = ladoQueSeFue === "local" ? "rival" : "local";
    const ladoPartido = ladoGanador === "local" ? "local" : "rival";
    sala.partido.forzarVictoriaAbandono(ladoPartido);
    if (!sala.partido.rankingGuardado) {
        sala.partido.rankingGuardado = true;
        try { await guardarRankingSala(sala); }
        catch (e) { console.error("[ranking] abandono:", e.message); }
    }
    const rivalId = socketRivalId(sala, ladoQueSeFue);
    const snap = sala.partido.snapshot();
    if (rivalId) {
        const rival = io.sockets.sockets.get(rivalId);
        if (rival) {
            rival.emit("estado_juego", snap);
            rival.emit("victoria_abandono", {
                salaId,
                marcador: { local: sala.partido.golesLocal, visitante: sala.partido.golesVisitante },
                mensaje: "Victoria por abandono (3-0)",
            });
        }
    }
    destruirSala(salaId, "abandono_rival", null);
    console.log(`[sala] ${salaId} abandono: gana ${ladoGanador} 3-0`);
}

export function intentarReconectar(socket, token) {
    const tok = typeof token === "string" ? token.trim() : "";
    if (!tok || !/^[a-f0-9-]{36}$/i.test(tok)) return { ok: false, error: "token inválido" };
    const ref = reconnectByToken.get(tok);
    if (!ref) return { ok: false, error: "sesión expirada" };
    const sala = salas.get(ref.salaId);
    if (!sala || !sala.desconexion) return { ok: false, error: "no hay partida esperando" };
    if (sala.desconexion.token !== tok) return { ok: false, error: "token no coincide" };
    if (sala.desconexion.lado !== ref.lado) return { ok: false, error: "lado incorrecto" };

    const lado = ref.lado;
    const ladoPartido = lado === "local" ? "local" : "rival";
    cancelarEsperaReconexion(sala);
    if (lado === "local") sala.localId = socket.id;
    else sala.visitanteId = socket.id;
    sala.partido.rebindearSocket(ladoPartido, socket.id);
    salaDe.set(socket.id, sala.id);
    socket.join(sala.id);
    const cuenta = lado === "local" ? sala.localCuenta : sala.visitCuenta;
    if (cuenta) {
        cuentaPorSocket.set(socket.id, cuenta);
        marcarCuentaPartido(cuenta, sala.id);
    }
    const nombre = sala.partido.nombres[lado === "local" ? "local" : "visitante"];
    if (nombre) nombrePorSocket.set(socket.id, nombre);
    const rol = lado === "local" ? "Local" : "Visitante";
    socket.emit("partido_listo", payloadPartidoListo(sala, rol));
    socket.emit("estado_juego", sala.partido.snapshot());
    const rivalId = socketRivalId(sala, lado);
    const rival = rivalId ? io.sockets.sockets.get(rivalId) : null;
    if (rival) {
        rival.emit("rival_reconectado", { salaId: sala.id, mensaje: "Rival reconectado" });
        rival.emit("estado_juego", sala.partido.snapshot());
    }
    console.log(`[sala] ${sala.id} reconectó ${lado} como ${socket.id}`);
    return { ok: true, salaId: sala.id, rol };
}

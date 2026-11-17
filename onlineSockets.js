/**
 * Handlers Socket.IO del online (matchmaking, salas, presencia, input).
 */
import { cuentaDe } from "./persistencia.js";
import { VERSION_JUEGO } from "./config.js";
import {
    cuentaPorSocket, nombrePorSocket, equipoDe, salaDe, salas, codigoPrivadoDe,
    salaPrivadaPorCodigo, cola, enCola, equipoValido, presenciaPorNombre,
} from "./estado.js";
import {
    encolar, sacarDeCola, entradaCola, payloadEnCola, emparejar,
    actividadBloqueante, mensajeOcupado, marcarCuentaCola, marcarCuentaPrivada,
    registrarPresencia, publicarPresencia, quitarPresencia, consultaPresencia,
    generarCodigoPrivado, normalizarCodigo, liberarSalaPrivadaDe,
    estadoPresenciaDeSocket,
} from "./matchmaking.js";
import {
    crearSala, ladoDeSocketEnSala, socketRivalId, intentarReconectar,
    iniciarEsperaReconexion, registrarVotoRevancha, abrirVentanaRevancha,
    destruirSala, guardarRankingSala, cancelarEsperaReconexion,
} from "./salas.js";

function socketRate(socket, canal, maxPorSeg) {

    if (!socket._rl) socket._rl = Object.create(null);
    let b = socket._rl[canal];
    const ahora = Date.now();
    if (!b || ahora - b.t0 >= 1000) {
        b = { t0: ahora, n: 0, abusos: (b && b.abusos) || 0 };
        socket._rl[canal] = b;
    }
    b.n += 1;
    if (b.n > maxPorSeg) {
        b.abusos += 1;
        if (b.abusos >= 5) {
            console.warn(`[socket] abuso ${canal} → desconecto ${socket.id}`);
            socket.emit("error_cliente", { error: "Demasiados mensajes. Te desconectamos." });
            socket.disconnect(true);
        }
        return false;
    }
    return true;
}

function inputValido(data) {
    if (data == null || typeof data !== "object" || Array.isArray(data)) return false;
    const keys = Object.keys(data);
    if (keys.length > 16) return false;
    const permitidas = new Set(["w", "a", "s", "d", "espacio", "shift", "e", "r", "q", "arriba", "abajo", "izquierda", "derecha"]);
    for (const k of keys) {
        if (!permitidas.has(k)) return false;
        const v = data[k];
        if (typeof v !== "boolean" && typeof v !== "number") return false;
    }
    return true;
}

export function registerOnlineSockets(io) {
  io.on("connection", (socket) => {
    socket.emit("servidor_info", { version: VERSION_JUEGO });

    socket.on("presencia_hello", async (data, ack) => {
        if (!socketRate(socket, "presencia_hello", 4)) {
            if (typeof ack === "function") ack({ ok: false });
            return;
        }
        const token = data && typeof data.token === "string" ? data.token.slice(0, 80) : "";
        const yo = token ? await cuentaDe(token) : null;
        if (!socket.connected) return;
        if (yo) {
            cuentaPorSocket.set(socket.id, yo.cuenta.id);
            nombrePorSocket.set(socket.id, yo.cuenta.nombre);
            registrarPresencia(socket, yo.cuenta.nombre, yo.cuenta.id);
            publicarPresencia(socket.id);
            if (typeof ack === "function") ack({ ok: true, nombre: yo.cuenta.nombre, estado: estadoPresenciaDeSocket(socket.id) });
        } else if (typeof ack === "function") ack({ ok: false, error: "sin sesión" });
    });

    socket.on("presencia_consulta", (data, ack) => {
        if (!socketRate(socket, "presencia_consulta", 6)) {
            if (typeof ack === "function") ack({ ok: false, presencia: {} });
            return;
        }
        const nombres = data && Array.isArray(data.nombres) ? data.nombres : [];
        const presencia = consultaPresencia(nombres);
        if (typeof ack === "function") ack({ ok: true, presencia });
    });

    socket.on("invitar_amigo", async (data, ack) => {
        if (!socketRate(socket, "invitar_amigo", 3)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        if (!data || typeof data !== "object") {
            if (typeof ack === "function") ack({ ok: false, error: "datos inválidos" });
            return;
        }
        const token = typeof data.token === "string" ? data.token.slice(0, 80) : "";
        const yo = token ? await cuentaDe(token) : null;
        if (!socket.connected) return;
        if (!yo) {
            if (typeof ack === "function") ack({ ok: false, error: "tenés que iniciar sesión" });
            return;
        }
        cuentaPorSocket.set(socket.id, yo.cuenta.id);
        nombrePorSocket.set(socket.id, yo.cuenta.nombre);
        registrarPresencia(socket, yo.cuenta.nombre, yo.cuenta.id);

        if (salaDe.has(socket.id)) {
            if (typeof ack === "function") ack({ ok: false, error: "ya estás en un partido" });
            return;
        }
        const bloqueo = actividadBloqueante(yo.cuenta.id, socket.id);
        // Permitir si ya está en privada propia (reenviar código)
        const yaPrivada = codigoPrivadoDe.has(socket.id);
        if (bloqueo && !(yaPrivada && bloqueo.modo === "privada")) {
            if (typeof ack === "function") ack({ ok: false, error: mensajeOcupado(bloqueo) });
            return;
        }

        const destinoNom = String(data.nombre || "").trim().slice(0, 24);
        if (destinoNom.length < 2) {
            if (typeof ack === "function") ack({ ok: false, error: "nombre inválido" });
            return;
        }
        if (destinoNom.toLowerCase() === yo.cuenta.nombre.toLowerCase()) {
            if (typeof ack === "function") ack({ ok: false, error: "no podés invitarte a vos mismo" });
            return;
        }
        const dest = presenciaPorNombre.get(destinoNom.toLowerCase());
        if (!dest) {
            if (typeof ack === "function") ack({ ok: false, error: "tu amigo no está en línea" });
            return;
        }
        const destSock = io.sockets.sockets.get(dest.socketId);
        if (!destSock?.connected) {
            if (typeof ack === "function") ack({ ok: false, error: "tu amigo no está en línea" });
            return;
        }
        dest.estado = estadoPresenciaDeSocket(dest.socketId);
        if (dest.estado !== "menu") {
            if (typeof ack === "function") ack({ ok: false, error: "tu amigo está ocupado" });
            return;
        }

        const equipo = equipoValido(data.equipo) || equipoDe.get(socket.id) || "retoneta";
        equipoDe.set(socket.id, equipo);
        sacarDeCola(socket.id);

        let codigo = codigoPrivadoDe.get(socket.id);
        if (!codigo) {
            codigo = generarCodigoPrivado();
            salaPrivadaPorCodigo.set(codigo, socket.id);
            codigoPrivadoDe.set(socket.id, codigo);
        }
        marcarCuentaPrivada(yo.cuenta.id, socket.id);
        publicarPresencia(socket.id);

        destSock.emit("invitacion_partida", {
            de: yo.cuenta.nombre,
            codigo,
            expira: Date.now() + 60_000,
        });
        socket.emit("sala_privada_creada", { codigo });
        if (typeof ack === "function") ack({ ok: true, codigo, invitado: destinoNom });
        console.log(`[invitar] ${yo.cuenta.nombre} → ${destinoNom} código ${codigo}`);
    });

    socket.on("buscar_partido", async (data) => {
        if (!socketRate(socket, "buscar_partido", 2)) return;
        if (data != null && (typeof data !== "object" || Array.isArray(data))) return;
        const equipo = equipoValido(data && data.equipo);
        if (equipo) equipoDe.set(socket.id, equipo);
        const token = data && typeof data.token === "string" ? data.token.slice(0, 80) : "";
        const yo = token ? await cuentaDe(token) : null;
        if (!socket.connected) return;
        if (yo) {
            cuentaPorSocket.set(socket.id, yo.cuenta.id);
            nombrePorSocket.set(socket.id, yo.cuenta.nombre);
            registrarPresencia(socket, yo.cuenta.nombre, yo.cuenta.id);
            const bloqueo = actividadBloqueante(yo.cuenta.id, socket.id);
            if (bloqueo) {
                socket.emit("busqueda_rechazada", { error: mensajeOcupado(bloqueo) });
                return;
            }
        } else {
            cuentaPorSocket.delete(socket.id);
            nombrePorSocket.delete(socket.id);
        }
        if (codigoPrivadoDe.has(socket.id)) {
            socket.emit("en_cola", { posicion: 0, privada: true, codigo: codigoPrivadoDe.get(socket.id) });
            return;
        }
        if (salaDe.has(socket.id)) {
            socket.emit("busqueda_rechazada", { error: "Ya estás en un partido." });
            return;
        }
        const pts = yo && yo.jugador && Number.isFinite(yo.jugador.pts) ? yo.jugador.pts : 0;
        if (!encolar(socket.id, pts)) {
            socket.emit("busqueda_rechazada", { error: "Ya estás en cola o en un partido." });
            return;
        }
        if (yo) marcarCuentaCola(yo.cuenta.id, socket.id);
        publicarPresencia(socket.id);
        emparejar();
        const ent = entradaCola(socket.id);
        if (ent) {
            const pos = cola.findIndex((e) => e.id === socket.id) + 1;
            socket.emit("en_cola", payloadEnCola(ent, pos));
        }
    });

    socket.on("cancelar_busqueda", (_data, ack) => {
        if (!socketRate(socket, "cancelar_busqueda", 4)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        const ok = sacarDeCola(socket.id);
        if (typeof ack === "function") ack({ ok });
    });

    async function asociarCuentaSocket(data) {
        const equipo = equipoValido(data && data.equipo);
        if (equipo) equipoDe.set(socket.id, equipo);
        const token = data && typeof data.token === "string" ? data.token.slice(0, 80) : "";
        const yo = token ? await cuentaDe(token) : null;
        if (!socket.connected) return null;
        if (yo) {
            cuentaPorSocket.set(socket.id, yo.cuenta.id);
            nombrePorSocket.set(socket.id, yo.cuenta.nombre);
            registrarPresencia(socket, yo.cuenta.nombre, yo.cuenta.id);
            publicarPresencia(socket.id);
        } else {
            cuentaPorSocket.delete(socket.id);
            nombrePorSocket.delete(socket.id);
        }
        return yo;
    }

    // Sala privada: el host genera un código corto y espera a un invitado.
    socket.on("crear_sala_privada", async (data, ack) => {
        if (!socketRate(socket, "crear_sala_privada", 2)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        if (data != null && (typeof data !== "object" || Array.isArray(data))) {
            if (typeof ack === "function") ack({ ok: false, error: "datos inválidos" });
            return;
        }
        if (salaDe.has(socket.id)) {
            if (typeof ack === "function") ack({ ok: false, error: "ya estás en un partido" });
            return;
        }
        sacarDeCola(socket.id);
        const yo = await asociarCuentaSocket(data);
        if (!socket.connected) return;
        if (yo) {
            const bloqueo = actividadBloqueante(yo.cuenta.id, socket.id);
            if (bloqueo) {
                if (typeof ack === "function") ack({ ok: false, error: mensajeOcupado(bloqueo) });
                return;
            }
        }
        // Si ya hostea, devolver el mismo código.
        let codigo = codigoPrivadoDe.get(socket.id);
        if (!codigo) {
            codigo = generarCodigoPrivado();
            salaPrivadaPorCodigo.set(codigo, socket.id);
            codigoPrivadoDe.set(socket.id, codigo);
        }
        if (yo) marcarCuentaPrivada(yo.cuenta.id, socket.id);
        const payload = { ok: true, codigo };
        if (typeof ack === "function") ack(payload);
        socket.emit("sala_privada_creada", { codigo });
        console.log(`[privada] host ${socket.id} código ${codigo}`);
    });

    socket.on("unirse_sala_privada", async (data, ack) => {
        if (!socketRate(socket, "unirse_sala_privada", 3)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        if (data == null || typeof data !== "object" || Array.isArray(data)) {
            if (typeof ack === "function") ack({ ok: false, error: "datos inválidos" });
            return;
        }
        if (salaDe.has(socket.id)) {
            if (typeof ack === "function") ack({ ok: false, error: "ya estás en un partido" });
            return;
        }
        const codigo = normalizarCodigo(data.codigo);
        if (!codigo) {
            if (typeof ack === "function") ack({ ok: false, error: "código inválido (4–6 caracteres)" });
            return;
        }
        const hostId = salaPrivadaPorCodigo.get(codigo);
        if (!hostId) {
            if (typeof ack === "function") ack({ ok: false, error: "no hay sala con ese código" });
            return;
        }
        if (hostId === socket.id) {
            if (typeof ack === "function") ack({ ok: false, error: "no podés unirte a tu propia sala" });
            return;
        }
        const hostSock = io.sockets.sockets.get(hostId);
        if (!hostSock || !hostSock.connected) {
            liberarSalaPrivadaDe(hostId);
            if (typeof ack === "function") ack({ ok: false, error: "el anfitrión se desconectó" });
            return;
        }
        if (salaDe.has(hostId)) {
            liberarSalaPrivadaDe(hostId);
            if (typeof ack === "function") ack({ ok: false, error: "la sala ya empezó" });
            return;
        }
        const yo = await asociarCuentaSocket(data);
        if (!socket.connected) return;
        if (yo) {
            const bloqueo = actividadBloqueante(yo.cuenta.id, socket.id);
            if (bloqueo) {
                if (typeof ack === "function") ack({ ok: false, error: mensajeOcupado(bloqueo) });
                return;
            }
        }
        // Misma cuenta host e invitado
        const hostCuenta = cuentaPorSocket.get(hostId) || null;
        if (yo && hostCuenta && yo.cuenta.id === hostCuenta) {
            if (typeof ack === "function") ack({ ok: false, error: "no podés unirte a tu propia cuenta" });
            return;
        }
        sacarDeCola(socket.id);
        sacarDeCola(hostId);
        // Liberar código antes de crear el partido
        liberarSalaPrivadaDe(hostId);
        crearSala(hostSock, socket);
        if (typeof ack === "function") ack({ ok: true, codigo });
        console.log(`[privada] join ${socket.id} → ${codigo} (host ${hostId})`);
    });

    socket.on("cancelar_sala_privada", (_data, ack) => {
        if (!socketRate(socket, "cancelar_sala_privada", 4)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        const ok = liberarSalaPrivadaDe(socket.id);
        if (typeof ack === "function") ack({ ok });
    });

    // Medición de latencia (ida y vuelta) para la predicción del cliente: devuelve lo que le mandan.
    socket.on("ping_rtt", (t, ack) => {
        if (!socketRate(socket, "ping_rtt", 10)) return;
        if (typeof ack === "function") ack(t);
    });

    socket.on("input", (data) => {
        // ~60 Hz máximo razonable; un poco de margen
        if (!socketRate(socket, "input", 90)) return;
        if (!inputValido(data)) return;
        const salaId = salaDe.get(socket.id);
        const sala = salaId ? salas.get(salaId) : null;
        if (!sala || sala.desconexion) return;
        sala.partido.aplicarInput(socket.id, data);
    });

    // Reconexión a mitad de partido (mismo token de sesión emitido en partido_listo).
    socket.on("reconectar_partido", (data, ack) => {
        if (!socketRate(socket, "reconectar_partido", 3)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        const token = data && typeof data === "object" ? data.token : data;
        const out = intentarReconectar(socket, token);
        if (typeof ack === "function") ack(out);
        else if (!out.ok) socket.emit("reconexion_fallida", out);
    });

    // Revancha al finalizar: ambos deben aceptar → nuevo partido con lados invertidos.
    socket.on("revancha", (data, ack) => {
        if (!socketRate(socket, "revancha", 4)) {
            if (typeof ack === "function") ack({ ok: false, error: "rate" });
            return;
        }
        const salaId = salaDe.get(socket.id);
        const sala = salaId ? salas.get(salaId) : null;
        if (!sala || !sala.partido || sala.partido.estado !== "FINALIZADO") {
            if (typeof ack === "function") ack({ ok: false, error: "partido no finalizado" });
            return;
        }
        const lado = ladoDeSocketEnSala(sala, socket.id);
        if (!lado) {
            if (typeof ack === "function") ack({ ok: false, error: "no estás en la sala" });
            return;
        }
        if (!sala.revancha) abrirVentanaRevancha(sala);
        const aceptar = !!(data && typeof data === "object" ? data.aceptar : data);
        const out = registrarVotoRevancha(sala, lado, aceptar);
        if (typeof ack === "function") ack(out);
    });

    // Salida voluntaria: no da ventana de reconexión; el rival gana 3-0.
    socket.on("abandonar_partido", () => {
        if (!socketRate(socket, "abandonar_partido", 2)) return;
        const salaId = salaDe.get(socket.id);
        const sala = salaId ? salas.get(salaId) : null;
        if (!sala) return;
        const lado = ladoDeSocketEnSala(sala, socket.id);
        if (!lado) return;
        if (sala.partido.estado === "FINALIZADO") {
            if (sala.revancha) {
                const ladoR = ladoDeSocketEnSala(sala, socket.id);
                if (ladoR) registrarVotoRevancha(sala, ladoR, false);
            } else {
                destruirSala(sala.id, "fin", socket.id);
            }
            return;
        }
        cancelarEsperaReconexion(sala);
        const ladoGanadorPartido = lado === "local" ? "rival" : "local";
        sala.partido.forzarVictoriaAbandono(ladoGanadorPartido);
        const finRanking = () => {
            destruirSala(sala.id, "abandono_voluntario", socket.id);
        };
        if (!sala.partido.rankingGuardado) {
            sala.partido.rankingGuardado = true;
            const rivalId = socketRivalId(sala, lado);
            const snap = sala.partido.snapshot();
            if (rivalId) {
                const rival = io.sockets.sockets.get(rivalId);
                if (rival) {
                    rival.emit("estado_juego", snap);
                    rival.emit("victoria_abandono", {
                        salaId: sala.id,
                        marcador: { local: sala.partido.golesLocal, visitante: sala.partido.golesVisitante },
                        mensaje: "Victoria por abandono (3-0)",
                    });
                }
            }
            guardarRankingSala(sala).catch((e) => console.error("[ranking] abandonar:", e.message)).finally(finRanking);
        } else {
            finRanking();
        }
    });

    socket.on("disconnect", () => {
        equipoDe.delete(socket.id);
        // No borrar cuentaPorSocket todavía si hay sala: ranking de abandono la necesita vía sala.*Cuenta.
        quitarPresencia(socket.id);
        cuentaPorSocket.delete(socket.id);
        nombrePorSocket.delete(socket.id);
        liberarSalaPrivadaDe(socket.id);
        if (sacarDeCola(socket.id)) return;
        const salaId = salaDe.get(socket.id);
        if (!salaId) return;
        const sala = salas.get(salaId);
        if (!sala) return;
        if (sala.partido.estado === "FINALIZADO") {
            if (sala.revancha) {
                const ladoR = ladoDeSocketEnSala(sala, socket.id);
                if (ladoR) registrarVotoRevancha(sala, ladoR, false);
            } else {
                destruirSala(salaId, "rival_desconectado", socket.id);
            }
            return;
        }
        // Ventana de 15 s para volver con reconnectToken.
        iniciarEsperaReconexion(sala, socket.id);
    });
});
}

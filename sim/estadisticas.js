/**
 * ETAPA 1 — Estadísticas Reales del Partido (`MatchStats`).
 *
 * Registra únicamente eventos originados en la simulación real del motor:
 * posesión, tiempo de posesión, tiros, tiros al arco, goles (con goleador,
 * asistidor y minuto), pases, pases completados, barridas, barridas exitosas,
 * recuperaciones, pérdidas de balón, atajadas y ataques/llegadas al área.
 *
 * Nota de arquitectura: el motor arcade de Liga Chaquito F8 usa paredes de rebote
 * y contacto físico sin tiros libres ni saques de esquina, por lo que `faltas` y
 * `corners` se reportan explícitamente como no soportados en `soporteMotor` en vez
 * de inventarse.
 */

import { CONFIG } from './config.js';
import { nombreJugador } from './planteles.js';
import { calcularValoraciones } from './valoracion.js';

function crearAcumuladorEquipo() {
    return {
        goles: 0,
        asistencias: 0,
        tiros: 0,
        tirosAlArco: 0,
        pases: 0,
        pasesCompletados: 0,
        barridas: 0,
        barridasExitosas: 0,
        recuperaciones: 0,
        perdidas: 0,
        atajadas: 0,
        tiempoPosesion: 0,
        posesionPct: 50,
        ataques: 0,
        llegadasArea: 0,
    };
}

function crearAcumuladorJugador({ id, nombre, team, equipoId, isGK }) {
    return {
        id,
        nombre: nombre || id,
        team: team === 'rival' ? 'rival' : 'local',
        equipoId: equipoId || '',
        isGK: !!isGK,
        goles: 0,
        asistencias: 0,
        tiros: 0,
        tirosAlArco: 0,
        pases: 0,
        pasesCompletados: 0,
        barridas: 0,
        barridasExitosas: 0,
        recuperaciones: 0,
        perdidas: 0,
        atajadas: 0,
        tiempoConPelota: 0,
        participaciones: 0,
    };
}

function redondear1(n) {
    return Math.round((Number(n) || 0) * 10) / 10;
}

/**
 * Determina si un remate va dirigido entre los tres palos y bajo el travesaño,
 * con alcance suficiente para llegar a la línea de gol rival.
 */
export function esTiroAlArcoProyectado(ballPos, dir, power, vz = 0, team = 'local') {
    if (!ballPos || !dir || !(power > 0)) return false;
    const goal = team === 'rival' ? CONFIG.GOAL_SOUTH : CONFIG.GOAL_NORTH;
    const dy = goal.lineY - ballPos.y;
    if (team === 'local' && (dy >= 0 || dir.y >= -0.02)) return false;
    if (team === 'rival' && (dy <= 0 || dir.y <= 0.02)) return false;

    const distLinea = Math.hypot((dy / dir.y) * dir.x, dy);
    const fric = vz > 0.5 ? CONFIG.BALL_AIR_FRICTION : CONFIG.BALL_FRICTION;
    const alcanceMax = power / Math.max(0.005, 1 - fric);
    if (alcanceMax < distLinea * 0.92) return false;

    const xCruza = ballPos.x + dir.x * (dy / dir.y);
    const margenPoste = 3;
    if (xCruza < goal.x - margenPoste || xCruza > goal.x + goal.w + margenPoste) return false;

    if (vz > 0.5) {
        // Estimar cuadros de vuelo hasta cruzar la línea de gol y altura z en ese punto
        const ratio = Math.min(0.96, (distLinea * (1 - fric)) / Math.max(0.1, power));
        const frames = Math.log(1 - ratio) / Math.log(fric);
        if (Number.isFinite(frames) && frames > 0) {
            const zEnLinea = Math.max(0, vz * frames - 0.5 * CONFIG.BALL_GRAVITY * frames * frames);
            if (zEnLinea > CONFIG.BAR_HEIGHT + 2) return false;
        }
    }
    return true;
}

export class MatchStats {
    constructor(players = [], opts = {}) {
        this.iniciar(players, opts);
    }

    iniciar(players = [], opts = {}) {
        this.duracionTotalSeg = Number(opts.duracionTotalSeg) || CONFIG.MATCH_SECONDS;
        this.tiempoTranscurrido = 0;
        this.finalizado = false;
        this.equiposMeta = {
            local: opts.equipoLocalId || '',
            rival: opts.equipoRivalId || '',
        };
        this.soporteMotor = {
            faltas: false,
            corners: false,
        };

        this.equipos = {
            local: crearAcumuladorEquipo(),
            rival: crearAcumuladorEquipo(),
        };
        this._jugadoresMap = new Map();
        this._ordenJugadores = [];
        this._mapaRefJugador = new WeakMap();

        this.sincronizarJugadores(players);

        this.golesDetalle = [];
        this.eventos = [];

        // Estado transitorio de jugadas reales en curso
        this._equipoEnPosesion = null;
        this._ultimoDuenoId = null;
        this._pasePendiente = null; // { emisorId, team, elevado, t }
        this._posibleAsistencia = null; // { emisorId, receptorId, team, t }
        this._tiroActual = null; // { jugadorId, team, contoAlArco, t }
        this._ultimoTocador = null; // { jugadorId, team, accion, t }
        this._ultimoPateador = { local: null, rival: null };
        this._ultimaAtajadaAt = { local: -10, rival: -10 };
        this._enAtaque = { local: false, rival: false };
        this._enArea = { local: false, rival: false };
        this._valoracionesCache = null;
        return this;
    }

    sincronizarJugadores(players = []) {
        let idxL = 0;
        let idxR = 0;
        for (const p of players) {
            if (!p) continue;
            const team = p.team === 'rival' ? 'rival' : 'local';
            let id = p.playerId || p.mobilityId;
            if (!id || id === 'local' || id === 'rival') {
                id = p.isGK ? `${team}_gk` : `${team}_${team === 'rival' ? idxR : idxL}`;
            }
            if (!p.isGK) {
                if (team === 'rival') idxR++;
                else idxL++;
            }
            const eqId = p.equipoId || this.equiposMeta[team] || '';
            const nombre = p.nombre || nombreJugador(eqId, id, { isGK: !!p.isGK, team });
            this._mapaRefJugador.set(p, id);
            if (!this._jugadoresMap.has(id)) {
                const acum = crearAcumuladorJugador({ id, nombre, team, equipoId: eqId, isGK: !!p.isGK });
                this._jugadoresMap.set(id, acum);
                this._ordenJugadores.push(id);
            } else {
                const acum = this._jugadoresMap.get(id);
                if (p.nombre) acum.nombre = p.nombre;
                if (eqId) acum.equipoId = eqId;
            }
        }
    }

    _asegurarJugador(p, fallbackTeam = 'local') {
        if (!p) return null;
        if (typeof p === 'string') return this._jugadoresMap.get(p) || null;
        let id = this._mapaRefJugador.get(p) || p.playerId || p.mobilityId;
        const team = p.team === 'rival' ? 'rival' : (p.team === 'local' ? 'local' : fallbackTeam);
        if (!id || id === 'local' || id === 'rival') {
            id = p.isGK ? `${team}_gk` : `${team}_0`;
        }
        this._mapaRefJugador.set(p, id);
        if (!this._jugadoresMap.has(id)) {
            const eqId = p.equipoId || this.equiposMeta[team] || '';
            const nombre = p.nombre || nombreJugador(eqId, id, { isGK: !!p.isGK, team });
            const acum = crearAcumuladorJugador({ id, nombre, team, equipoId: eqId, isGK: !!p.isGK });
            this._jugadoresMap.set(id, acum);
            this._ordenJugadores.push(id);
        } else {
            const acum = this._jugadoresMap.get(id);
            if (p.nombre) acum.nombre = p.nombre;
            if (p.equipoId) acum.equipoId = p.equipoId;
        }
        return this._jugadoresMap.get(id);
    }

    minutoActual() {
        let transcurridoReloj = this.tiempoTranscurrido;
        if (this._framesRestantes != null) {
            const restSeg = Math.max(0, this._framesRestantes / CONFIG.TARGET_FPS);
            transcurridoReloj = Math.max(0, this.duracionTotalSeg - restSeg);
        }
        const prop = Math.max(0, Math.min(1, transcurridoReloj / Math.max(1, this.duracionTotalSeg)));
        return Math.max(1, Math.min(90, Math.ceil(prop * 90)));
    }

    _recalcularPosesion() {
        const tl = this.equipos.local.tiempoPosesion;
        const tr = this.equipos.rival.tiempoPosesion;
        const tot = tl + tr;
        if (tot <= 0.001) {
            this.equipos.local.posesionPct = 50;
            this.equipos.rival.posesionPct = 50;
            return;
        }
        const pctL = Math.round((tl / tot) * 100);
        this.equipos.local.posesionPct = pctL;
        this.equipos.rival.posesionPct = 100 - pctL;
    }

    /**
     * Avanza contadores continuos durante EstadoPartido.EN_JUEGO:
     * tiempo de posesión real y llegadas controladas a zona ofensiva/área.
     */
    tick({ dt = 0, framesRestantes = null, ball = null } = {}) {
        if (this.finalizado || !(dt > 0)) return;
        this.tiempoTranscurrido += dt;
        if (framesRestantes != null) {
            this._framesRestantes = framesRestantes;
        }

        const owner = ball && ball.owner;
        if (!owner) return;

        const team = owner.team === 'rival' ? 'rival' : 'local';
        const otro = team === 'local' ? 'rival' : 'local';
        this.equipos[team].tiempoPosesion += dt;
        const j = this._asegurarJugador(owner, team);
        if (j) j.tiempoConPelota += dt;

        // Si el equipo perdió la pelota, limpiar ataque del otro lado
        this._enAtaque[otro] = false;
        this._enArea[otro] = false;

        // Ataques y llegadas al área rival con pelota controlada (con histéresis)
        const py = owner.pos ? owner.pos.y : CONFIG.HEIGHT / 2;
        const px = owner.pos ? owner.pos.x : CONFIG.WIDTH / 2;
        const mitad = CONFIG.HEIGHT / 2;
        const enTercioOfensivo = team === 'local' ? py < 245 : py > CONFIG.HEIGHT - 245;
        const volvioAMitad = team === 'local' ? py > mitad + 10 : py < mitad - 10;

        if (enTercioOfensivo && !this._enAtaque[team]) {
            this._enAtaque[team] = true;
            this.equipos[team].ataques++;
        } else if (volvioAMitad) {
            this._enAtaque[team] = false;
        }

        const goalRival = team === 'local' ? CONFIG.GOAL_NORTH : CONFIG.GOAL_SOUTH;
        const distFondo = Math.abs(py - goalRival.lineY);
        const dentroArea =
            distFondo <= CONFIG.AREA_PROFUNDIDAD &&
            Math.abs(px - (goalRival.x + goalRival.w / 2)) <= CONFIG.AREA_MITAD_ANCHO;
        const salioArea = distFondo > CONFIG.AREA_PROFUNDIDAD + 28;

        if (dentroArea && !this._enArea[team]) {
            this._enArea[team] = true;
            this.equipos[team].llegadasArea++;
        } else if (salioArea) {
            this._enArea[team] = false;
        }
    }

    /**
     * Registra que un jugador tomó control real de la pelota (`ball.owner = jugador`).
     */
    registrarControl({ jugador, motivo = 'control' } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        const team = j.team;
        const ahora = this.tiempoTranscurrido;

        // 1) Resolver pase en vuelo si existía
        if (this._pasePendiente) {
            const p = this._pasePendiente;
            this._pasePendiente = null;
            if (p.team === team && p.emisorId !== j.id && ahora - p.t <= 6.5) {
                this.equipos[team].pasesCompletados++;
                const emisor = this._jugadoresMap.get(p.emisorId);
                if (emisor) emisor.pasesCompletados++;
                this._posibleAsistencia = {
                    emisorId: p.emisorId,
                    receptorId: j.id,
                    team,
                    t: ahora,
                };
            }
        }

        // 2) Cambio de posesión entre equipos → recuperación + pérdida
        if (this._equipoEnPosesion && this._equipoEnPosesion !== team) {
            const eqAnterior = this._equipoEnPosesion;
            this.equipos[team].recuperaciones++;
            j.recuperaciones++;
            j.participaciones++;

            this.equipos[eqAnterior].perdidas++;
            if (this._ultimoDuenoId) {
                const perdedor = this._jugadoresMap.get(this._ultimoDuenoId);
                if (perdedor && perdedor.team === eqAnterior) perdedor.perdidas++;
            }
            this._posibleAsistencia = null;
            this._tiroActual = null;
        }

        this._equipoEnPosesion = team;
        this._ultimoDuenoId = j.id;
        this._ultimoTocador = { jugadorId: j.id, team, accion: motivo, t: ahora };
        this._valoracionesCache = null;
    }

    /**
     * Registra un pase iniciado por un jugador (raso o elevado).
     */
    registrarPase({ jugador, elevado = false } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        const team = j.team;
        const ahora = this.tiempoTranscurrido;

        this.equipos[team].pases++;
        j.pases++;
        j.participaciones++;

        this._equipoEnPosesion = team;
        this._ultimoDuenoId = j.id;
        this._pasePendiente = { emisorId: j.id, team, elevado: !!elevado, t: ahora };
        this._tiroActual = null;
        this._ultimoTocador = { jugadorId: j.id, team, accion: elevado ? 'pase_elevado' : 'pase', t: ahora };
        this._valoracionesCache = null;
    }

    /**
     * Registra un remate al arco (de pie o cabezazo ofensivo).
     */
    registrarTiro({ jugador, alArco = false, tipo = 'pie' } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        const team = j.team;
        const ahora = this.tiempoTranscurrido;

        this.equipos[team].tiros++;
        j.tiros++;
        j.participaciones++;
        if (alArco) {
            this.equipos[team].tirosAlArco++;
            j.tirosAlArco++;
        }

        this._equipoEnPosesion = team;
        this._ultimoDuenoId = j.id;
        this._pasePendiente = null;
        this._tiroActual = { jugadorId: j.id, team, contoAlArco: !!alArco, tipo, t: ahora };
        this._ultimoPateador[team] = { jugadorId: j.id, t: ahora };
        this._ultimoTocador = { jugadorId: j.id, team, accion: 'tiro', t: ahora };
        this._valoracionesCache = null;
    }

    /**
     * Registra un despeje largo del arquero cuando no va dirigido como pase corto.
     */
    registrarDespeje({ jugador } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        const ahora = this.tiempoTranscurrido;
        this._equipoEnPosesion = j.team;
        this._ultimoDuenoId = j.id;
        this._pasePendiente = null;
        this._tiroActual = null;
        this._ultimoTocador = { jugadorId: j.id, team: j.team, accion: 'despeje', t: ahora };
    }

    /**
     * Registra el inicio real de una barrida.
     */
    registrarBarrida({ jugador } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        this.equipos[j.team].barridas++;
        j.barridas++;
        this._valoracionesCache = null;
    }

    /**
     * Registra que una barrida quitó o recuperó efectivamente la pelota.
     */
    registrarBarridaExitosa({ jugador } = {}) {
        if (this.finalizado || !jugador) return;
        const j = this._asegurarJugador(jugador);
        if (!j) return;
        this.equipos[j.team].barridasExitosas++;
        j.barridasExitosas++;
        j.participaciones++;
        this.eventos.push({
            tipo: 'barrida',
            minuto: this.minutoActual(),
            segundo: redondear1(this.tiempoTranscurrido),
            team: j.team,
            jugadorId: j.id,
            nombre: j.nombre,
        });
        this._valoracionesCache = null;
    }

    /**
     * Registra una atajada real del arquero ante pelota proveniente del rival.
     */
    registrarAtajada({ arquero, tipo = 'desvio' } = {}) {
        if (this.finalizado || !arquero) return;
        const gk = this._asegurarJugador(arquero);
        if (!gk) return;
        const team = gk.team;
        const rival = team === 'local' ? 'rival' : 'local';
        const ahora = this.tiempoTranscurrido;

        // Evita contar dos veces el mismo contacto en frames consecutivos
        if (ahora - this._ultimaAtajadaAt[team] < 0.35) return;
        this._ultimaAtajadaAt[team] = ahora;

        // Si el remate rival no había sido contado como al arco (p. ej. rozaba el poste), promoverlo
        if (this._tiroActual && this._tiroActual.team === rival && ahora - this._tiroActual.t <= 3.5) {
            if (!this._tiroActual.contoAlArco) {
                this._tiroActual.contoAlArco = true;
                this.equipos[rival].tirosAlArco++;
                const pateador = this._jugadoresMap.get(this._tiroActual.jugadorId);
                if (pateador) pateador.tirosAlArco++;
            }
            this._tiroActual = null;
        }

        this.equipos[team].atajadas++;
        gk.atajadas++;
        gk.participaciones++;
        this._pasePendiente = null;
        this._ultimoTocador = { jugadorId: gk.id, team, accion: 'atajada', t: ahora };

        this.eventos.push({
            tipo: 'atajada',
            subtipo: tipo,
            minuto: this.minutoActual(),
            segundo: redondear1(ahora),
            team,
            jugadorId: gk.id,
            nombre: gk.nombre,
        });
        this._valoracionesCache = null;
    }

    /**
     * Registra un gol real validado por `GestorPartido._verificarGoles()`.
     * Devuelve el objeto del gol registrado (con goleador, asistencia y minuto).
     */
    registrarGol({ equipoAnotador, marcadorLocal, marcadorRival } = {}) {
        const team = equipoAnotador === 'rival' ? 'rival' : 'local';
        const ahora = this.tiempoTranscurrido;
        const minuto = this.minutoActual();

        this.equipos[team].goles++;

        // Determinar autor del gol
        let autor = null;
        let enContra = false;

        if (this._ultimoTocador && this._ultimoTocador.team === team) {
            autor = this._jugadoresMap.get(this._ultimoTocador.jugadorId) || null;
        } else if (this._ultimoPateador[team] && ahora - this._ultimoPateador[team].t <= 4.0) {
            // Tiro del equipo anotador que rebotó en el arquero/defensor y entró
            autor = this._jugadoresMap.get(this._ultimoPateador[team].jugadorId) || null;
        } else if (this._ultimoTocador && this._ultimoTocador.team !== team) {
            autor = this._jugadoresMap.get(this._ultimoTocador.jugadorId) || null;
            enContra = !!autor;
        }

        if (!autor) {
            // Respaldo determinista: primer jugador de campo del equipo anotador
            for (const id of this._ordenJugadores) {
                const cand = this._jugadoresMap.get(id);
                if (cand && cand.team === team && !cand.isGK) {
                    autor = cand;
                    break;
                }
            }
        }

        // Consistencia tiro / tiro al arco cuando entra un gol propio
        if (!enContra) {
            if (this._tiroActual && this._tiroActual.team === team && ahora - this._tiroActual.t <= 4.5) {
                if (!this._tiroActual.contoAlArco) {
                    this._tiroActual.contoAlArco = true;
                    this.equipos[team].tirosAlArco++;
                    const p = this._jugadoresMap.get(this._tiroActual.jugadorId) || autor;
                    if (p) p.tirosAlArco++;
                }
            } else if (autor) {
                // Gol entrando con pelota dominada o rebote directo sin disparo previo registrado
                this.equipos[team].tiros++;
                this.equipos[team].tirosAlArco++;
                autor.tiros++;
                autor.tirosAlArco++;
            }
            if (autor) {
                autor.goles++;
                autor.participaciones++;
            }
        }

        // Asistencia: pase previo completado de un compañero al goleador
        let asistidor = null;
        if (
            !enContra &&
            autor &&
            this._posibleAsistencia &&
            this._posibleAsistencia.team === team &&
            this._posibleAsistencia.receptorId === autor.id &&
            this._posibleAsistencia.emisorId !== autor.id &&
            ahora - this._posibleAsistencia.t <= 8.0
        ) {
            asistidor = this._jugadoresMap.get(this._posibleAsistencia.emisorId) || null;
            if (asistidor) {
                this.equipos[team].asistencias++;
                asistidor.asistencias++;
                asistidor.participaciones++;
            }
        }

        const gol = {
            indice: this.golesDetalle.length,
            team,
            jugadorId: autor ? autor.id : `${team}_0`,
            nombre: autor ? autor.nombre : (team === 'local' ? 'Local' : 'Rival'),
            equipoId: (autor && autor.equipoId) || this.equiposMeta[team] || '',
            asistidorId: asistidor ? asistidor.id : null,
            asistidorNombre: asistidor ? asistidor.nombre : null,
            enContra,
            minuto,
            segundo: redondear1(ahora),
            marcadorLocal: marcadorLocal != null ? marcadorLocal : this.equipos.local.goles,
            marcadorRival: marcadorRival != null ? marcadorRival : this.equipos.rival.goles,
        };

        this.golesDetalle.push(gol);
        this.eventos.push({ tipo: 'gol', ...gol });

        // Resetear jugadas abiertas para el próximo saque del medio
        this._equipoEnPosesion = null;
        this._ultimoDuenoId = null;
        this._pasePendiente = null;
        this._posibleAsistencia = null;
        this._tiroActual = null;
        this._ultimoTocador = null;
        this._enAtaque.local = false;
        this._enAtaque.rival = false;
        this._enArea.local = false;
        this._enArea.rival = false;
        this._valoracionesCache = null;

        return gol;
    }

    /**
     * Cierra las estadísticas al finalizar el partido (incluye marcadores forzados por abandono).
     */
    finalizar({ golesLocal = null, golesRival = null } = {}) {
        if (golesLocal != null) this.equipos.local.goles = Number(golesLocal) || 0;
        if (golesRival != null) this.equipos.rival.goles = Number(golesRival) || 0;
        this._recalcularPosesion();
        if (!this.finalizado) {
            this.finalizado = true;
            this.eventos.push({
                tipo: 'fin',
                minuto: 90,
                segundo: redondear1(this.tiempoTranscurrido),
                marcadorLocal: this.equipos.local.goles,
                marcadorRival: this.equipos.rival.goles,
            });
        }
        this._valoracionesCache = null;
        return this.serializar();
    }

    obtenerValoraciones() {
        if (this._valoracionesCache) return this._valoracionesCache;
        this._recalcularPosesion();
        const lista = this._ordenJugadores.map((id) => this._jugadoresMap.get(id)).filter(Boolean);
        const res = calcularValoraciones(lista, {
            golesLocal: this.equipos.local.goles,
            golesRival: this.equipos.rival.goles,
            tirosLocal: this.equipos.local.tiros,
            tirosRival: this.equipos.rival.tiros,
            duracionJugadaSeg: this.tiempoTranscurrido,
        });
        this._valoracionesCache = res;
        return res;
    }

    /**
     * Objeto plano listo para JSON, red, persistencia y pantalla post-partido.
     */
    serializar() {
        this._recalcularPosesion();
        const val = this.obtenerValoraciones();
        const formatearEquipo = (lado) => {
            const e = this.equipos[lado];
            return {
                goles: e.goles,
                asistencias: e.asistencias,
                tiros: e.tiros,
                tirosAlArco: e.tirosAlArco,
                precisionTiro: e.tiros > 0 ? Math.round((e.tirosAlArco / e.tiros) * 100) : 0,
                pases: e.pases,
                pasesCompletados: e.pasesCompletados,
                precisionPases: e.pases > 0 ? Math.round((e.pasesCompletados / e.pases) * 100) : 0,
                barridas: e.barridas,
                barridasExitosas: e.barridasExitosas,
                recuperaciones: e.recuperaciones,
                perdidas: e.perdidas,
                atajadas: e.atajadas,
                tiempoPosesion: redondear1(e.tiempoPosesion),
                posesionPct: e.posesionPct,
                ataques: e.ataques,
                llegadasArea: e.llegadasArea,
            };
        };

        return {
            duracionJugadaSeg: redondear1(this.tiempoTranscurrido),
            finalizado: this.finalizado,
            soporteMotor: { ...this.soporteMotor },
            equipos: {
                local: formatearEquipo('local'),
                rival: formatearEquipo('rival'),
            },
            goles: this.golesDetalle.map((g) => ({ ...g })),
            eventos: this.eventos.map((ev) => ({ ...ev })),
            jugadores: val.jugadores,
            figura: val.figura,
        };
    }

    /**
     * Resumen compacto del lado indicado ('local' | 'rival') para persistir en historial/perfil.
     */
    resumenParaPersistencia(lado = 'local') {
        const s = this.serializar();
        const eq = s.equipos[lado === 'rival' ? 'rival' : 'local'];
        return {
            posesionPct: eq.posesionPct,
            tiempoPosesion: eq.tiempoPosesion,
            tiros: eq.tiros,
            tirosAlArco: eq.tirosAlArco,
            pases: eq.pases,
            pasesCompletados: eq.pasesCompletados,
            barridas: eq.barridas,
            barridasExitosas: eq.barridasExitosas,
            recuperaciones: eq.recuperaciones,
            perdidas: eq.perdidas,
            atajadas: eq.atajadas,
            ataques: eq.ataques,
            figura: s.figura
                ? {
                      nombre: s.figura.nombre,
                      team: s.figura.team,
                      rating: s.figura.rating,
                  }
                : null,
        };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.MatchStats = MatchStats;
    globalThis.esTiroAlArcoProyectado = esTiroAlArcoProyectado;
}

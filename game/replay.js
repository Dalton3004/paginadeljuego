import { Game } from '../game.js';
import { Replay } from '../sim/replay.js';
import { kitDeJugador } from '../assets/skins.js';

/**
 * ETAPA 3 — Integración del sistema de Replay con el render real, cámara, zoom,
 * controles en vivo (saltar / cámara lenta) y selector de goles en post-partido.
 * Nunca muta los objetos `this.players` ni `this.ball` de la simulación real.
 */
Object.assign(Game.prototype, {
    _initReplaySystem() {
        if (!this.replay) {
            this.replay = new Replay({ duracionSeg: 5, hz: 30, maxGoles: 16 });
        } else {
            this.replay.reiniciar();
        }
        this._replayReloj = 0;
        this._replayFrameTick = 0;
        this._replayEstado = null;
        this._replayFinDelay = 0;
        this._replayButtons = {};
        this._replayPlayersPool = [];
        this._replayBallDummy = null;
    },

    _enReplayActivo() {
        return !!(this._replayEstado && this._replayEstado.activo);
    },

    _golesReplayDisponibles() {
        return this.replay && Array.isArray(this.replay.goles) ? this.replay.goles : [];
    },

    _capturarSnapshotActual(t) {
        const b = this.ball;
        if (!b) return null;
        return {
            t,
            pelota: {
                x: b.pos.x,
                y: b.pos.y,
                z: b.z || 0,
                vx: b.vel.x,
                vy: b.vel.y,
            },
            jugadores: (this.players || []).map((p) => ({
                x: p.pos.x,
                y: p.pos.y,
                vx: p.vel.x,
                vy: p.vel.y,
                fx: p.facing.x,
                fy: p.facing.y,
                team: p.team,
                isGK: !!p.isGK,
                mobilityId: p.mobilityId,
                kitName: p.kitName || '',
                kitEquipo: p.kitEquipo || '',
                animDir: p.animDir,
                animFrame: p.animFrame,
                animClock: p.animClock,
                flipX: !!p.flipX,
                moving: !!p.moving,
                sprinting: !!p.sprinting,
                isSliding: !!p.isSliding,
                slideTimer: p.slideTimer || 0,
                kickTimer: p.kickTimer || 0,
                headTimer: p.headTimer || 0,
                gkAction: p.gkAction || 'stand',
                gkActionTimer: p.gkActionTimer || 0,
                gkDiveDir: p.gkDiveDir || 0,
            })),
        };
    },

    _updateReplayCapture(dt) {
        if (!this.replay || !this.gestor || this._enReplayActivo()) return;
        if (this.gestor.pausado) return;

        const est = this.gestor.estado;
        if (est === EstadoPartido.EN_JUEGO) {
            this._replayReloj += dt;
            this._replayFrameTick++;
            if (this._replayFrameTick % 2 === 0) {
                const snap = this._capturarSnapshotActual(this._replayReloj);
                if (snap) this.replay.grabar(snap);
            }
        } else if (est === EstadoPartido.CELEBRANDO_GOL) {
            this._replayReloj += dt;
            this._replayFrameTick++;
            if (this._replayFrameTick % 2 === 0) {
                const snap = this._capturarSnapshotActual(this._replayReloj);
                if (snap) this.replay.agregarColaGol(snap, 0.42);
            }
        }
    },

    _registrarGolEnReplay(golMeta = null) {
        if (!this.replay) this._initReplaySystem();
        this._replayReloj += 0.002;
        const snap = this._capturarSnapshotActual(this._replayReloj);
        if (snap) this.replay.grabar(snap);

        const g = this.gestor;
        const meta = golMeta
            ? { ...golMeta }
            : {
                  indice: this.replay.goles.length,
                  team: 'local',
                  nombre: 'GOL',
                  minuto: g && g.stats ? g.stats.minutoActual() : 1,
                  marcadorLocal: g ? g.golesLocal : 0,
                  marcadorRival: g ? g.golesRival : 0,
              };
        const ok = this.replay.capturarGol(meta);
        // No reproducimos encima del cartel de celebración: esperamos a que termine el festejo
        this.replay.reproduciendo = false;
        return ok;
    },

    /** Actualizar metadatos del último gol capturado (útil en Online cuando llega `gol_partido`). */
    _actualizarMetaUltimoGolReplay(golMeta) {
        if (!this.replay || !this.replay.goles.length || !golMeta) return;
        const ult = this.replay.goles[this.replay.goles.length - 1];
        ult.meta = { ...ult.meta, ...golMeta };
    },

    /** Llamado al terminar la celebración de gol en partidos offline (Solo / Liga). */
    _iniciarReplayTrasCelebracion() {
        if (this.enLinea) return false;
        if (this.prefs && this.prefs.autoReplay === false) return false;
        const goles = this._golesReplayDisponibles();
        if (!goles.length) return false;
        const idx = goles.length - 1;
        if (!this.replay.reproducirGol(idx, { velocidad: 1, camaraLentaAuto: true })) return false;
        this._soltarTodosLosControles();
        this._replayFinDelay = 0;
        this._replayEstado = {
            activo: true,
            origen: 'gol_vivo',
            info: null,
        };
        return true;
    },

    /** Abre el reproductor de repeticiones desde el Post-Partido. */
    abrirReplayPostPartido(indice = 0) {
        const goles = this._golesReplayDisponibles();
        if (!goles.length) return false;
        const idx = Math.max(0, Math.min(goles.length - 1, Number(indice) || 0));
        if (!this.replay.reproducirGol(idx, { velocidad: 1, camaraLentaAuto: true })) return false;
        if (typeof this._ocultarPostPartidoTemporal === 'function') {
            this._ocultarPostPartidoTemporal();
        }
        this._soltarTodosLosControles();
        this._replayFinDelay = 0;
        this._replayEstado = {
            activo: true,
            origen: 'postpartido',
            info: null,
        };
        return true;
    },

    _cambiarGolReplay(delta) {
        const goles = this._golesReplayDisponibles();
        if (!goles.length || !this._enReplayActivo()) return;
        const n = goles.length;
        const nuevo = (this.replay.indiceGolActual + delta + n) % n;
        this._replayFinDelay = 0;
        this.replay.reproducirGol(nuevo, {
            velocidad: this.replay.velocidad,
            camaraLentaAuto: true,
        });
    },

    _repetirGolActualReplay() {
        if (!this._enReplayActivo() || !this.replay) return;
        this._replayFinDelay = 0;
        this.replay.reproducirGol(this.replay.indiceGolActual, {
            velocidad: this.replay.velocidad,
            camaraLentaAuto: true,
        });
    },

    _alternarCamaraLentaReplay() {
        if (!this._enReplayActivo() || !this.replay) return;
        this.replay.alternarVelocidad();
    },

    _cerrarReplayActivo() {
        if (!this._replayEstado) return;
        const origen = this._replayEstado.origen;
        this._replayEstado = null;
        this._replayFinDelay = 0;
        if (this.replay) this.replay.saltar();
        this._soltarTodosLosControles();

        if (origen === 'gol_vivo' && this.gestor && this.gestor.estado === EstadoPartido.CELEBRANDO_GOL) {
            this.gestor.reanudarTrasGol();
        } else if (origen === 'postpartido') {
            if (typeof this._restaurarPostPartidoTrasReplay === 'function') {
                this._restaurarPostPartidoTrasReplay();
            }
        }
    },

    _updateReplayPlayback(dt) {
        if (!this._enReplayActivo() || !this.replay) return false;
        if (this.replay.reproduciendo) {
            const info = this.replay.avanzarConCamara(dt);
            this._replayEstado.info = info;
            if (!info || info.finalizado) {
                this._replayFinDelay = this._replayEstado.origen === 'gol_vivo' ? 0.22 : 0.65;
            }
        } else {
            this._replayFinDelay -= dt;
            if (this._replayFinDelay <= 0) {
                this._cerrarReplayActivo();
            }
        }
        return true;
    },

    _manejarTeclaReplay(code) {
        if (!this._enReplayActivo()) return false;
        if (code === 'Escape' || code === 'Backspace') {
            this._cerrarReplayActivo();
            return true;
        }
        if (code === 'Space' || code === 'Enter') {
            if (this._replayEstado.origen === 'gol_vivo') {
                this._cerrarReplayActivo();
            } else if (!this.replay.reproduciendo) {
                this._cerrarReplayActivo();
            } else {
                this._cerrarReplayActivo();
            }
            return true;
        }
        if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight') {
            this._alternarCamaraLentaReplay();
            return true;
        }
        if (code === 'KeyR') {
            this._repetirGolActualReplay();
            return true;
        }
        if (this._replayEstado.origen === 'postpartido') {
            if (code === 'ArrowLeft' || code === 'KeyA') {
                this._cambiarGolReplay(-1);
                return true;
            }
            if (code === 'ArrowRight' || code === 'KeyD') {
                this._cambiarGolReplay(1);
                return true;
            }
        }
        return true;
    },

    _manejarClickReplay(mx, my) {
        if (!this._enReplayActivo()) return false;
        const b = this._replayButtons || {};
        if (b.cerrar && this._hit(mx, my, b.cerrar)) {
            this._cerrarReplayActivo();
            return true;
        }
        if (b.lenta && this._hit(mx, my, b.lenta)) {
            this._alternarCamaraLentaReplay();
            return true;
        }
        if (b.repetir && this._hit(mx, my, b.repetir)) {
            this._repetirGolActualReplay();
            return true;
        }
        if (b.prev && this._hit(mx, my, b.prev)) {
            this._cambiarGolReplay(-1);
            return true;
        }
        if (b.next && this._hit(mx, my, b.next)) {
            this._cambiarGolReplay(1);
            return true;
        }
        // En vivo, tocar cualquier zona libre de la cancha permite saltar rápido
        if (this._replayEstado.origen === 'gol_vivo' && my > 60 && my < CONFIG.HEIGHT - 64) {
            this._cerrarReplayActivo();
            return true;
        }
        return true;
    },

    _obtenerDummyJugadorReplay(idx, snapJ) {
        let p = this._replayPlayersPool[idx];
        if (!p) {
            p = new Jugador(snapJ.x, snapJ.y, {
                team: snapJ.team || 'local',
                isGK: !!snapJ.isGK,
                isHuman: false,
                mobilityId: snapJ.mobilityId || 'local_0',
            });
            this._replayPlayersPool[idx] = p;
        }
        p.pos.set(snapJ.x, snapJ.y);
        p.vel.set(snapJ.vx || 0, snapJ.vy || 0);
        p.facing.set(snapJ.fx || 0, snapJ.fy || (snapJ.team === 'rival' ? 1 : -1));
        p.team = snapJ.team || 'local';
        p.isGK = !!snapJ.isGK;
        p.isHuman = false;
        p.mobilityId = snapJ.mobilityId || p.mobilityId;
        const eq = this._equipo(p.team === 'rival' ? (this.seleccion && this.seleccion.rival) : (this.seleccion && this.seleccion.local));
        p.kitEquipo = snapJ.kitEquipo || (eq ? eq.kit : '');
        p.kitName = snapJ.kitName || (!p.isGK && p.kitEquipo ? kitDeJugador(p.kitEquipo, p.mobilityId) : '');
        p.animDir = snapJ.animDir || (p.team === 'rival' ? 'down' : 'up');
        p.animFrame = snapJ.animFrame || 0;
        p.animClock = snapJ.animClock || 0;
        p.flipX = !!snapJ.flipX;
        p.moving = !!snapJ.moving;
        p.sprinting = !!snapJ.sprinting;
        p.isSliding = !!snapJ.isSliding;
        p.slideTimer = snapJ.slideTimer || 0;
        p.kickTimer = snapJ.kickTimer || 0;
        p.headTimer = snapJ.headTimer || 0;
        p.hitFlash = 0;
        p.hitSquash = 0;
        p.gkAction = snapJ.gkAction || 'stand';
        p.gkActionTimer = snapJ.gkActionTimer || 0;
        p.gkDiveDir = snapJ.gkDiveDir || 0;
        return p;
    },

    _drawReplayScene(ctx) {
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const est = this._replayEstado;
        const info = est && est.info;
        const frame = info && info.frame;
        if (!frame) return;

        const cam = info.camara || { offsetX: 0, offsetY: 0, zoom: 1 };

        ctx.save();
        ctx.clearRect(0, 0, W, H);
        ctx.translate(cam.offsetX, cam.offsetY);
        ctx.scale(cam.zoom, cam.zoom);

        const cancha = this.assets.cancha;
        if (cancha) ctx.drawImage(cancha, 0, 0, W, H);
        else {
            ctx.fillStyle = '#1a5c2a';
            ctx.fillRect(0, 0, W, H);
        }

        if (this.hinchada) this.hinchada.draw(ctx);

        // Dibujar jugadores ordenados por profundidad Y
        const vistas = (frame.jugadores || []).map((sj, i) => this._obtenerDummyJugadorReplay(i, sj));
        vistas.sort((a, b) => a.pos.y - b.pos.y);

        // Desactivar temporalmente pose de FX del partido en vivo para no contaminar el replay
        const fxGuardado = this.fx;
        this.fx = null;
        for (const pv of vistas) this._drawPlayer(ctx, pv);

        // Pelota del replay con estela sutil
        if (!this._replayBallDummy) this._replayBallDummy = new Pelota(frame.pelota.x, frame.pelota.y);
        const bd = this._replayBallDummy;
        bd.pos.set(frame.pelota.x, frame.pelota.y);
        bd.vel.set(frame.pelota.vx || 0, frame.pelota.vy || 0);
        bd.z = frame.pelota.z || 0;
        const sp = Math.hypot(bd.vel.x, bd.vel.y);
        if (sp > 3.5) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 224, 102, 0.38)';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(bd.pos.x, bd.pos.y - bd.z);
            ctx.lineTo(bd.pos.x - bd.vel.x * 2.4, bd.pos.y - bd.z - bd.vel.y * 2.4);
            ctx.stroke();
            ctx.restore();
        }
        this._drawBall(ctx, bd);
        this.fx = fxGuardado;

        ctx.restore();

        // Viñeta + líneas de transmisión retro TV
        ctx.save();
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, W - 8, H - 8);

        // Franja superior REPLAY
        ctx.fillStyle = 'rgba(4, 12, 28, 0.86)';
        ctx.fillRect(10, 10, W - 20, 46);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(10, 10, W - 20, 46);

        const blink = Math.floor(performance.now() / 420) % 2 === 0;
        ctx.fillStyle = blink ? '#ff3b3b' : '#8a1c1c';
        ctx.beginPath();
        ctx.arc(26, 26, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 13px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const goles = this._golesReplayDisponibles();
        const idxGol = (this.replay ? this.replay.indiceGolActual : 0) + 1;
        const tagReplay = goles.length > 1 ? `REPETICIÓN · GOL ${idxGol}/${goles.length}` : 'REPETICIÓN DEL GOL';
        ctx.fillText(tagReplay, 37, 26);

        // Indicador de cámara lenta / impacto
        if (info.enPausaImpacto || info.enCamaraLenta) {
            const badgeTxt = info.enPausaImpacto ? '¡GOL!' : 'CÁMARA LENTA 0.5x';
            ctx.fillStyle = info.enPausaImpacto ? '#ffcc00' : '#2457c9';
            ctx.fillRect(W - 154, 15, 138, 20);
            ctx.fillStyle = info.enPausaImpacto ? '#111' : '#fff';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(badgeTxt, W - 85, 25);
        }

        // Datos reales del gol (autor, minuto, asistencia y marcador)
        const meta = (this.replay && this.replay.metaActual) || {};
        const eqGol = this._equipo(
            meta.team === 'rival' ? (this.seleccion && this.seleccion.rival) : (this.seleccion && this.seleccion.local)
        );
        const nomEq = eqGol ? eqGol.corto : (meta.team === 'rival' ? 'RIVAL' : 'LOCAL');
        const autorTxt = meta.nombre
            ? `${meta.nombre.toUpperCase()}${meta.enContra ? ' (E/C)' : ''} · ${meta.minuto || 1}'`
            : `MINUTO ${meta.minuto || 1}'`;
        const asistTxt = meta.asistidorNombre ? `  (Asist: ${meta.asistidorNombre})` : '';
        const marcTxt =
            meta.marcadorLocal != null && meta.marcadorRival != null
                ? `${meta.marcadorLocal}-${meta.marcadorRival}`
                : '';

        ctx.fillStyle = '#dce8f7';
        ctx.font = 'bold 11px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(`${nomEq}: ${autorTxt}${asistTxt}`, 22, 44);

        if (marcTxt) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Courier New';
            ctx.textAlign = 'right';
            ctx.fillText(marcTxt, W - 20, 44);
        }

        // Barra inferior de progreso y controles
        const barY = H - 62;
        ctx.fillStyle = 'rgba(4, 12, 28, 0.90)';
        ctx.fillRect(10, barY, W - 20, 52);
        ctx.strokeStyle = '#2d5a96';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(10, barY, W - 20, 52);

        // Barra de tiempo del clip
        const progW = W - 40;
        ctx.fillStyle = '#11243e';
        ctx.fillRect(20, barY + 7, progW, 6);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(20, barY + 7, progW * Math.max(0, Math.min(1, info.progreso || 0)), 6);

        this._replayButtons = {};
        const drawMiniBtn = (key, x, y, w, h, label, primary = false) => {
            this._replayButtons[key] = { x, y, w, h };
            ctx.fillStyle = primary ? '#ffcc00' : '#132b4c';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = primary ? '#ffffff' : '#5b8fd4';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = primary ? '#111827' : '#ffffff';
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x + w / 2, y + h / 2);
        };

        const by = barY + 19;
        const bh = 27;
        const lentaOn = this.replay && this.replay.velocidad < 0.9;

        if (est.origen === 'postpartido') {
            let cx = 18;
            if (goles.length > 1) {
                drawMiniBtn('prev', cx, by, 42, bh, '◀ ANT');
                cx += 47;
                drawMiniBtn('next', cx, by, 42, bh, 'SIG ▶');
                cx += 49;
            }
            drawMiniBtn('repetir', cx, by, 68, bh, '↺ REPETIR');
            cx += 74;
            drawMiniBtn('lenta', cx, by, 84, bh, lentaOn ? '1x NORMAL' : '0.5x LENTA');
            drawMiniBtn('cerrar', W - 142, by, 124, bh, 'ESTADÍSTICAS ✕', true);
        } else {
            drawMiniBtn('lenta', 20, by, 110, bh, lentaOn ? 'VELOCIDAD 1x' : 'CÁMARA LENTA');
            drawMiniBtn('cerrar', W - 150, by, 130, bh, 'SALTAR ▶▶', true);
            ctx.fillStyle = '#9fb4ce';
            ctx.font = '10px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('ESPACIO / TOCAR', W / 2 - 8, by + bh / 2);
        }

        // Flash suave de transición de entrada / salida
        if (info.transicionAlpha > 0.01) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(info.transicionAlpha * 0.45).toFixed(3)})`;
            ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
    },
});

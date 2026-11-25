import { Game } from '../game.js';
import {
    SeriePenales,
    resolverEjecucionPenal,
    decisionPenalIA,
    DIRECCIONES_PENAL,
    EFECTOS_PENAL,
} from '../sim/penales_core.js';

/**
 * ETAPA 10 — Tanda de Penales Interactiva en Canvas (PC, Mouse, Gamepad y Táctil).
 *
 * Se utiliza como resolución oficial de empate en Copa Chaquito y Supercopa Chaquito,
 * y queda disponible como módulo reutilizable para otros modos especiales.
 */

const GOAL_BOX = { x: 84, y: 126, w: 312, h: 138 };

function coordObjetivoEnArco(dir, efecto) {
    const cx =
        dir === 'izq'
            ? GOAL_BOX.x + 52
            : dir === 'der'
            ? GOAL_BOX.x + GOAL_BOX.w - 52
            : GOAL_BOX.x + GOAL_BOX.w / 2;
    const cy =
        efecto === 'angulo'
            ? GOAL_BOX.y + 28
            : efecto === 'comba'
            ? GOAL_BOX.y + 66
            : GOAL_BOX.y + GOAL_BOX.h - 22;
    return { x: cx, y: cy };
}

Object.assign(Game.prototype, {
    _enPenalesActivo() {
        return !!(this._penales && this._penales.activo);
    },

    iniciarTandaPenales({ titulo = 'DEFINICIÓN POR PENALES', onFinish = null } = {}) {
        const dificultad = (this.seleccion && this.seleccion.dificultad) || 'normal';
        this._soltarTodosLosControles();
        this._penales = {
            activo: true,
            titulo,
            dificultad,
            serie: new SeriePenales({ empiezaUsuario: true, tirosReglamentarios: 5 }),
            fase: 'apuntando', // 'apuntando' | 'animando' | 'resultado_tiro' | 'fin_serie'
            timer: 0,
            // Selección actual del jugador
            dirIdx: 0, // 0=izq, 1=centro, 2=der
            efectoIdx: 1, // 0=raso, 1=comba, 2=angulo
            potencia: 0.72,
            potenciaVel: 1.35,
            // Animación del disparo en vuelo
            anim: null,
            ultimoResultado: null,
            botones: {},
            gpPrevBtn: false,
            gpNavCooldown: 0,
            onFinish,
        };
        if (typeof this._playSfx === 'function') this._playSfx('whistle');
    },

    _cancelarPenales() {
        this._penales = null;
    },

    _confirmarAccionPenal() {
        const P = this._penales;
        if (!P || !P.activo || P.fase !== 'apuntando') return;

        const esTurnoPatear = P.serie.turno === 'mio';
        let ejecucion;

        if (esTurnoPatear) {
            const direccion = DIRECCIONES_PENAL[P.dirIdx] || 'centro';
            const efecto = EFECTOS_PENAL[P.efectoIdx] || 'comba';
            const iaGK = decisionPenalIA({ rol: 'atajar', dificultad: P.dificultad });
            ejecucion = resolverEjecucionPenal({
                direccion,
                potencia: P.potencia,
                efecto,
                decisionArquero: iaGK.decisionArquero,
            });
        } else {
            const decisionArquero = DIRECCIONES_PENAL[P.dirIdx] || 'centro';
            const iaTiro = decisionPenalIA({ rol: 'patear', dificultad: P.dificultad });
            ejecucion = resolverEjecucionPenal({
                direccion: iaTiro.direccion,
                potencia: iaTiro.potencia,
                efecto: iaTiro.efecto,
                decisionArquero,
            });
        }

        const dest = coordObjetivoEnArco(ejecucion.direccion, ejecucion.efecto);
        let endX = dest.x;
        let endY = dest.y;
        if (ejecucion.desenlace === 'travesano') {
            endY = GOAL_BOX.y - 4;
        } else if (ejecucion.desenlace === 'afuera') {
            endX = ejecucion.direccion === 'izq' ? GOAL_BOX.x - 28 : GOAL_BOX.x + GOAL_BOX.w + 28;
            endY = GOAL_BOX.y + 24;
        }

        P.ultimoResultado = ejecucion;
        P.anim = {
            t: 0,
            dur: 0.58,
            startX: CONFIG.WIDTH / 2,
            startY: 432,
            endX,
            endY,
            curvaX: ejecucion.efecto === 'comba' ? (ejecucion.direccion === 'izq' ? 32 : ejecucion.direccion === 'der' ? -32 : 18) : 0,
            gkDir: ejecucion.decisionArquero,
            pateaUsuario: esTurnoPatear,
        };
        P.fase = 'animando';
        if (typeof this._playSfx === 'function') this._playSfx('kick');
    },

    _leerGamepadPenales(dt) {
        const P = this._penales;
        if (!P || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
        let pads;
        try {
            pads = navigator.getGamepads();
        } catch (_e) {
            return;
        }
        const gp = pads && (pads[0] || pads[1]);
        if (!gp) return;

        if (P.gpNavCooldown > 0) P.gpNavCooldown -= dt;
        const axX = (gp.axes && gp.axes[0]) || 0;
        const axY = (gp.axes && gp.axes[1]) || 0;
        const dLeft = gp.buttons[14] && gp.buttons[14].pressed;
        const dRight = gp.buttons[15] && gp.buttons[15].pressed;
        const dUp = gp.buttons[12] && gp.buttons[12].pressed;
        const dDown = gp.buttons[13] && gp.buttons[13].pressed;

        if (P.fase === 'apuntando' && P.gpNavCooldown <= 0) {
            if (axX < -0.45 || dLeft) {
                P.dirIdx = Math.max(0, P.dirIdx - 1);
                P.gpNavCooldown = 0.2;
            } else if (axX > 0.45 || dRight) {
                P.dirIdx = Math.min(2, P.dirIdx + 1);
                P.gpNavCooldown = 0.2;
            } else if (P.serie.turno === 'mio' && (axY < -0.45 || dUp)) {
                P.efectoIdx = Math.min(2, P.efectoIdx + 1);
                P.gpNavCooldown = 0.2;
            } else if (P.serie.turno === 'mio' && (axY > 0.45 || dDown)) {
                P.efectoIdx = Math.max(0, P.efectoIdx - 1);
                P.gpNavCooldown = 0.2;
            }
        }

        const btnA = !!(gp.buttons[0] && gp.buttons[0].pressed);
        if (btnA && !P.gpPrevBtn) {
            if (P.fase === 'apuntando') this._confirmarAccionPenal();
            else if (P.fase === 'fin_serie') this._cerrarYEntregarPenales();
        }
        P.gpPrevBtn = btnA;
    },

    _updatePenales(dt) {
        const P = this._penales;
        if (!P || !P.activo) return false;

        this._leerGamepadPenales(dt);

        if (P.fase === 'apuntando') {
            // Barra arcade de potencia oscilante cuando patea el usuario
            if (P.serie.turno === 'mio') {
                P.potencia += P.potenciaVel * dt;
                if (P.potencia >= 0.99) {
                    P.potencia = 0.99;
                    P.potenciaVel = -Math.abs(P.potenciaVel);
                } else if (P.potencia <= 0.25) {
                    P.potencia = 0.25;
                    P.potenciaVel = Math.abs(P.potenciaVel);
                }
            }
            return true;
        }

        if (P.fase === 'animando') {
            P.anim.t += dt;
            if (P.anim.t >= P.anim.dur) {
                const res = P.ultimoResultado;
                P.serie.registrarTiro(res.esGol);
                if (res.esGol) {
                    if (typeof this._playSfx === 'function') this._playSfx('goal');
                    if (this.hinchada && typeof this.hinchada.goal === 'function') {
                        this.hinchada.goal('north', { fraction: P.anim.pateaUsuario ? 1 : 0.4, duration: 1.6 });
                    }
                } else if (typeof this._playSfx === 'function') {
                    this._playSfx('whistle');
                }
                P.fase = 'resultado_tiro';
                P.timer = 1.25;
            }
            return true;
        }

        if (P.fase === 'resultado_tiro') {
            P.timer -= dt;
            if (P.timer <= 0) {
                if (P.serie.terminada) {
                    P.fase = 'fin_serie';
                    P.timer = 1.8;
                    if (typeof this._playSfx === 'function') this._playSfx('whistle');
                } else {
                    P.fase = 'apuntando';
                    P.dirIdx = 1; // arranca centrado en el nuevo turno
                    P.potencia = 0.65;
                }
            }
            return true;
        }

        if (P.fase === 'fin_serie') {
            P.timer -= dt;
            if (P.timer <= 0) {
                this._cerrarYEntregarPenales();
            }
            return true;
        }
        return true;
    },

    _cerrarYEntregarPenales() {
        const P = this._penales;
        if (!P) return;
        const est = P.serie.estado();
        const cb = P.onFinish;
        this._penales = null;
        if (typeof cb === 'function') {
            cb({
                golesMios: est.golesMios,
                golesOtro: est.golesOtro,
                ganador: est.ganador,
                historialMio: est.historialMio,
                historialRival: est.historialRival,
            });
        }
    },

    _manejarTeclaPenales(code) {
        const P = this._penales;
        if (!P || !P.activo) return false;

        if (P.fase === 'fin_serie') {
            if (code === 'Space' || code === 'Enter') this._cerrarYEntregarPenales();
            return true;
        }
        if (P.fase !== 'apuntando') return true;

        if (code === 'ArrowLeft' || code === 'KeyA') {
            P.dirIdx = Math.max(0, P.dirIdx - 1);
        } else if (code === 'ArrowRight' || code === 'KeyD') {
            P.dirIdx = Math.min(2, P.dirIdx + 1);
        } else if (P.serie.turno === 'mio' && (code === 'ArrowUp' || code === 'KeyW')) {
            P.efectoIdx = Math.min(2, P.efectoIdx + 1);
        } else if (P.serie.turno === 'mio' && (code === 'ArrowDown' || code === 'KeyS')) {
            P.efectoIdx = Math.max(0, P.efectoIdx - 1);
        } else if (code === 'Space' || code === 'Enter') {
            this._confirmarAccionPenal();
        }
        return true;
    },

    _manejarClickPenales(mx, my) {
        const P = this._penales;
        if (!P || !P.activo) return false;

        if (P.fase === 'fin_serie') {
            this._cerrarYEntregarPenales();
            return true;
        }
        if (P.fase !== 'apuntando') return true;

        // 1) Tocar directamente dentro del arco selecciona dirección + altura/efecto
        if (
            mx >= GOAL_BOX.x - 12 &&
            mx <= GOAL_BOX.x + GOAL_BOX.w + 12 &&
            my >= GOAL_BOX.y - 12 &&
            my <= GOAL_BOX.y + GOAL_BOX.h + 16
        ) {
            const relX = (mx - GOAL_BOX.x) / GOAL_BOX.w;
            P.dirIdx = relX < 0.34 ? 0 : relX > 0.66 ? 2 : 1;
            if (P.serie.turno === 'mio') {
                const relY = (my - GOAL_BOX.y) / GOAL_BOX.h;
                P.efectoIdx = relY < 0.34 ? 2 : relY < 0.68 ? 1 : 0;
            }
            if (P.serie.turno === 'rival') {
                // En modo arquero, tocar el sector del arco confirma la volada enseguida
                this._confirmarAccionPenal();
            }
            return true;
        }

        // 2) Botones de la interfaz inferior
        const B = P.botones || {};
        for (let i = 0; i < 3; i++) {
            if (B['dir_' + i] && this._hit(mx, my, B['dir_' + i])) {
                P.dirIdx = i;
                if (P.serie.turno === 'rival') this._confirmarAccionPenal();
                return true;
            }
            if (B['ef_' + i] && this._hit(mx, my, B['ef_' + i])) {
                P.efectoIdx = i;
                return true;
            }
        }
        if (B.ejecutar && this._hit(mx, my, B.ejecutar)) {
            this._confirmarAccionPenal();
            return true;
        }
        return true;
    },

    _drawPenalesScene(ctx) {
        const P = this._penales;
        if (!P || !P.activo) return;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const eqL = this._equipo(this.seleccion && this.seleccion.local);
        const eqR = this._equipo(this.seleccion && this.seleccion.rival);
        const nomMio = eqL ? eqL.corto : 'TU EQUIPO';
        const nomRiv = eqR ? eqR.corto : 'RIVAL';

        ctx.save();
        // Fondo nocturno de estadio y césped en perspectiva
        const sky = ctx.createLinearGradient(0, 0, 0, 250);
        sky.addColorStop(0, '#040c1c');
        sky.addColorStop(1, '#102a52');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, 250);

        const grass = ctx.createLinearGradient(0, 240, 0, H);
        grass.addColorStop(0, '#1c6b31');
        grass.addColorStop(1, '#134d23');
        ctx.fillStyle = grass;
        ctx.fillRect(0, 240, W, H - 240);

        // Franjas del césped
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        for (let y = 255; y < H; y += 38) {
            ctx.fillRect(0, y, W, 19);
        }

        // Líneas del área y punto penal
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(20, 264);
        ctx.lineTo(W - 20, 264);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(W / 2, 432, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Red y postes del arco grande
        ctx.fillStyle = 'rgba(10, 20, 35, 0.55)';
        ctx.fillRect(GOAL_BOX.x, GOAL_BOX.y, GOAL_BOX.w, GOAL_BOX.h);
        ctx.strokeStyle = 'rgba(220, 235, 255, 0.22)';
        ctx.lineWidth = 1;
        for (let gx = GOAL_BOX.x + 18; gx < GOAL_BOX.x + GOAL_BOX.w; gx += 18) {
            ctx.beginPath();
            ctx.moveTo(gx, GOAL_BOX.y);
            ctx.lineTo(gx, GOAL_BOX.y + GOAL_BOX.h);
            ctx.stroke();
        }
        for (let gy = GOAL_BOX.y + 18; gy < GOAL_BOX.y + GOAL_BOX.h; gy += 18) {
            ctx.beginPath();
            ctx.moveTo(GOAL_BOX.x, gy);
            ctx.lineTo(GOAL_BOX.x + GOAL_BOX.w, gy);
            ctx.stroke();
        }
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 7;
        ctx.strokeRect(GOAL_BOX.x, GOAL_BOX.y, GOAL_BOX.w, GOAL_BOX.h);

        // Marcador superior de la tanda con bolitas
        ctx.fillStyle = 'rgba(4, 12, 28, 0.92)';
        ctx.fillRect(10, 8, W - 20, 74);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 8, W - 20, 74);

        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 11px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            P.serie.enMuerteSubita ? `${P.titulo} · MUERTE SÚBITA` : P.titulo,
            W / 2,
            21
        );

        const drawBolitas = (hist, x0, y, alignRight = false) => {
            const totalMostrar = Math.max(5, hist.length);
            const slice = totalMostrar > 5 ? hist.slice(-5) : hist;
            for (let i = 0; i < 5; i++) {
                const cx = alignRight ? x0 - (4 - i) * 16 : x0 + i * 16;
                const val = slice[i];
                ctx.beginPath();
                ctx.arc(cx, y, 5.5, 0, Math.PI * 2);
                ctx.fillStyle = val === true ? '#48e078' : val === false ? '#ff5252' : '#1e3557';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        };

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Courier New';
        ctx.textAlign = 'left';
        ctx.fillText(nomMio, 22, 43);
        drawBolitas(P.serie.historialMio, 26, 63, false);

        ctx.textAlign = 'right';
        ctx.fillText(nomRiv, W - 22, 43);
        drawBolitas(P.serie.historialRival, W - 26, 63, true);

        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 26px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`${P.serie.golesMios} - ${P.serie.golesOtro}`, W / 2, 52);

        // Mira / zonas interactivas en el arco durante apuntado
        const pateaUsuario = P.serie.turno === 'mio';
        if (P.fase === 'apuntando') {
            const dirSel = DIRECCIONES_PENAL[P.dirIdx];
            const efSel = pateaUsuario ? EFECTOS_PENAL[P.efectoIdx] : 'comba';
            const target = coordObjetivoEnArco(dirSel, efSel);

            // Sombra de las 3 columnas para orientar toque/clic
            for (let c = 0; c < 3; c++) {
                const sx = GOAL_BOX.x + (GOAL_BOX.w / 3) * c;
                if (c === P.dirIdx) {
                    ctx.fillStyle = pateaUsuario ? 'rgba(255, 204, 0, 0.16)' : 'rgba(72, 224, 120, 0.20)';
                    ctx.fillRect(sx + 2, GOAL_BOX.y + 2, GOAL_BOX.w / 3 - 4, GOAL_BOX.h - 4);
                }
            }

            // Mira pulsante
            ctx.strokeStyle = pateaUsuario ? '#ffcc00' : '#48e078';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(target.x, target.y, 15 + Math.sin(performance.now() / 120) * 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(target.x - 20, target.y);
            ctx.lineTo(target.x + 20, target.y);
            ctx.moveTo(target.x, target.y - 20);
            ctx.lineTo(target.x, target.y + 20);
            ctx.stroke();
        }

        // Arquero en el arco
        let gkX = W / 2;
        let gkY = GOAL_BOX.y + GOAL_BOX.h - 14;
        let gkAngle = 0;
        if (P.anim && (P.fase === 'animando' || P.fase === 'resultado_tiro')) {
            const prog = Math.min(1, P.anim.t / P.anim.dur);
            if (P.anim.gkDir === 'izq') {
                gkX = W / 2 - 96 * prog;
                gkY -= Math.sin(prog * Math.PI) * 24;
                gkAngle = -0.55 * prog;
            } else if (P.anim.gkDir === 'der') {
                gkX = W / 2 + 96 * prog;
                gkY -= Math.sin(prog * Math.PI) * 24;
                gkAngle = 0.55 * prog;
            } else {
                gkY -= Math.sin(prog * Math.PI) * 14;
            }
        }
        const colorGK = pateaUsuario
            ? this._teamColor(eqR, '#ff5a5f')
            : this._teamColor(eqL, '#3a9bff');

        ctx.save();
        ctx.translate(gkX, gkY);
        ctx.rotate(gkAngle);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 12, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Cuerpo pixel-arcade del arquero
        ctx.fillStyle = colorGK;
        ctx.fillRect(-14, -30, 28, 28);
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.strokeRect(-14, -30, 28, 28);
        // Guantes extendidos
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(-24, -26, 9, 10);
        ctx.fillRect(15, -26, 9, 10);
        // Cabeza
        ctx.fillStyle = '#f2c6a0';
        ctx.fillRect(-8, -44, 16, 14);
        ctx.strokeRect(-8, -44, 16, 14);
        ctx.restore();

        // Pelota (en punto penal o viajando con comba)
        let bx = W / 2;
        let by = 432;
        let bRad = 10;
        if (P.anim && (P.fase === 'animando' || P.fase === 'resultado_tiro')) {
            const k = Math.min(1, P.anim.t / P.anim.dur);
            const arcoCurva = Math.sin(k * Math.PI) * P.anim.curvaX;
            bx = P.anim.startX + (P.anim.endX - P.anim.startX) * k + arcoCurva;
            by = P.anim.startY + (P.anim.endY - P.anim.startY) * k - Math.sin(k * Math.PI) * 22;
            bRad = 10 - k * 2.6;
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(bx, by, bRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pateador de espaldas
        const colorKicker = pateaUsuario
            ? this._teamColor(eqL, '#3a9bff')
            : this._teamColor(eqR, '#ff5a5f');
        const runOffset = P.anim && P.fase !== 'apuntando' ? Math.min(26, (P.anim.t / P.anim.dur) * 34) : 0;
        const kx = W / 2 - 14 + runOffset * 0.35;
        const ky = 478 - runOffset;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(kx, ky + 4, 15, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = colorKicker;
        ctx.fillRect(kx - 13, ky - 34, 26, 30);
        ctx.strokeStyle = '#111';
        ctx.strokeRect(kx - 13, ky - 34, 26, 30);
        ctx.fillStyle = '#222';
        ctx.fillRect(kx - 9, ky - 48, 18, 14);

        // Cartel de feedback tras el tiro o cierre de tanda
        if (P.fase === 'resultado_tiro' && P.ultimoResultado) {
            const esPositivo =
                (P.anim && P.anim.pateaUsuario && P.ultimoResultado.esGol) ||
                (P.anim && !P.anim.pateaUsuario && !P.ultimoResultado.esGol);
            ctx.fillStyle = 'rgba(4, 12, 28, 0.90)';
            ctx.fillRect(36, 294, W - 72, 54);
            ctx.strokeStyle = esPositivo ? '#48e078' : '#ff626c';
            ctx.lineWidth = 3;
            ctx.strokeRect(36, 294, W - 72, 54);
            ctx.fillStyle = esPositivo ? '#48e078' : '#ffd45a';
            ctx.font = 'bold 18px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(P.ultimoResultado.mensaje, W / 2, 321);
        } else if (P.fase === 'fin_serie') {
            const ganoMio = P.serie.ganador === 'mio';
            ctx.fillStyle = 'rgba(4, 12, 28, 0.94)';
            ctx.fillRect(26, 276, W - 52, 92);
            ctx.strokeStyle = ganoMio ? '#48e078' : '#ff626c';
            ctx.lineWidth = 3;
            ctx.strokeRect(26, 276, W - 52, 92);
            ctx.fillStyle = ganoMio ? '#48e078' : '#ff626c';
            ctx.font = 'bold 20px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(
                ganoMio ? `¡GANÓ ${nomMio} POR PENALES!` : `GANÓ ${nomRiv} POR PENALES`,
                W / 2,
                308
            );
            ctx.fillStyle = '#dce8f7';
            ctx.font = '12px Courier New';
            ctx.fillText(`Resultado final: ${P.serie.golesMios} - ${P.serie.golesOtro} · Tocá para continuar`, W / 2, 342);
        }

        // Panel inferior de controles (Teclado + Mouse + Táctil)
        P.botones = {};
        if (P.fase === 'apuntando') {
            const panelY = 494;
            ctx.fillStyle = 'rgba(4, 12, 28, 0.92)';
            ctx.fillRect(10, panelY, W - 20, H - panelY - 8);
            ctx.strokeStyle = pateaUsuario ? '#ffcc00' : '#48e078';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, panelY, W - 20, H - panelY - 8);

            ctx.fillStyle = pateaUsuario ? '#ffcc00' : '#48e078';
            ctx.font = 'bold 12px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(
                pateaUsuario
                    ? 'TU TURNO: ELEGÍ DIRECCIÓN, EFECTO Y POTENCIA'
                    : 'TURNO DE ATAJAR: ELEGÍ ADÓNDE VOLAR',
                W / 2,
                panelY + 15
            );

            const drawChoiceBtn = (key, x, y, w, h, label, active, gold = false) => {
                P.botones[key] = { x, y, w, h };
                ctx.fillStyle = active ? (gold ? '#ffcc00' : '#2457c9') : '#0d1f3a';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = active ? '#ffffff' : '#3a669c';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = active && gold ? '#111827' : '#ffffff';
                ctx.font = 'bold 10px Courier New';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, x + w / 2, y + h / 2);
            };

            const labelsDir = pateaUsuario
                ? ['◀ IZQUIERDA', '● CENTRO', 'DERECHA ▶']
                : ['🧤 VOLAR IZQ', '🧤 QUEDARSE', 'VOLAR DER 🧤'];
            for (let i = 0; i < 3; i++) {
                drawChoiceBtn('dir_' + i, 20 + i * 149, panelY + 28, 142, 28, labelsDir[i], P.dirIdx === i, !pateaUsuario);
            }

            if (pateaUsuario) {
                const labelsEf = ['RASO', 'COMBA', 'ÁNGULO'];
                for (let i = 0; i < 3; i++) {
                    drawChoiceBtn('ef_' + i, 20 + i * 96, panelY + 62, 90, 24, labelsEf[i], P.efectoIdx === i);
                }

                // Barra de potencia
                const bxP = 20;
                const byP = panelY + 94;
                const bwP = 280;
                const bhP = 18;
                ctx.fillStyle = '#091528';
                ctx.fillRect(bxP, byP, bwP, bhP);
                const grad = ctx.createLinearGradient(bxP, 0, bxP + bwP, 0);
                grad.addColorStop(0, '#3a9bff');
                grad.addColorStop(0.65, '#48e078');
                grad.addColorStop(0.88, '#ffcc00');
                grad.addColorStop(1, '#ff4545');
                ctx.fillStyle = grad;
                ctx.fillRect(bxP + 2, byP + 2, (bwP - 4) * P.potencia, bhP - 4);
                ctx.strokeStyle = '#ffffff';
                ctx.strokeRect(bxP, byP, bwP, bhP);

                drawChoiceBtn('ejecutar', 312, panelY + 62, 148, 50, '¡PATEAR! (ESP)', true, true);
            } else {
                drawChoiceBtn('ejecutar', 110, panelY + 72, 260, 38, 'CONFIRMAR VOLADA (ESPACIO)', true, true);
            }
        }

        ctx.restore();
    },
});

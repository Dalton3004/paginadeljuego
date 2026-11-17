import { Game } from '../game.js';
// Game — HUD del partido (marcador, cartel, prematch).
Object.assign(Game.prototype, {
    render() {
        const ctx = this.ctx;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;

        ctx.clearRect(0, 0, W, H);
        const shaking = this.fx ? this.fx.beginShake(ctx) : false;

        const cancha = this.assets.cancha;
        if (cancha) ctx.drawImage(cancha, 0, 0, W, H);
        else {
            ctx.fillStyle = '#1a5c2a';
            ctx.fillRect(0, 0, W, H);
        }

        if (this.hinchada) this.hinchada.draw(ctx);   // hinchada animada sobre las gradas

        if (this.fx) this.fx.drawUnder(ctx);   // polvo, pasto, ondas

        // Jugadores (rivales primero, luego locales, humano encima)
        const mi = (this.socket && this.socket.id) || this.miId;
        const sorted = [...this.players].sort((a, b) => {
            if (this.enLinea) {
                if (a.id && a.id === mi) return 1;
                if (b.id && b.id === mi) return -1;
            } else {
                if (a.isHuman) return 1;
                if (b.isHuman) return -1;
            }
            return a.pos.y - b.pos.y;
        });
        for (const p of sorted) this._drawPlayer(ctx, p);
        // La interfaz local muestra únicamente la resistencia del jugador
        // manejado por la persona; no revela las barras de compañeros ni rivales.
        for (const p of sorted) {
            if (p.isHuman && !p.isGK && (p.sprinting || p.stamina < CONFIG.STAMINA_MAX - 1)) {
                this._drawStaminaBar(ctx, p);
            }
        }
        for (const p of sorted) if (p.shotCharging) this._drawShotChargeBar(ctx, p);

        if (this.fx) this.fx.drawBallTrail(ctx);
        this._drawBall(ctx);
        this._drawShotAimArrow(ctx);
        if (this.fx) this.fx.drawOver(ctx);    // estrellas, confeti, sudor, chispas
        if (shaking) this.fx.endShake(ctx);
        this._drawMatchUI(ctx);
        this._drawCartel(ctx);
        this._drawPrematchAndCountdown(ctx);

        if (this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO) {
            this._drawEndMenu(ctx);
        }
        if (this.gestor && (this.gestor.pausado ||
            (this.enLinea && this._menuOnline && this.gestor.estado !== EstadoPartido.FINALIZADO))) this._drawPauseMenu(ctx);
    },

    // Flecha de dirección de tiro mientras se carga el remate,
    _drawPrematchAndCountdown(ctx) {
        const g = this.gestor;
        if (!g) return;
        const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;

        if (g.estado === EstadoPartido.PREPARANDO) {
            const t = Math.max(0, g.prematchTimer);
            const progress = 1 - (t / CONFIG.PREMATCH_LOAD_SEC);
            const eqL = this._equipo(this.seleccion && this.seleccion.local);
            const eqR = this._equipo(this.seleccion && this.seleccion.rival);
            const titulo = this.enLinea ? 'PARTIDO EN LÍNEA' : 'PREPARANDO PARTIDO';

            ctx.save();
            ctx.fillStyle = 'rgba(2, 8, 23, 0.88)';
            ctx.fillRect(0, 0, W, H);

            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 22px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.strokeText(titulo, W / 2, H * 0.12);
            ctx.fillText(titulo, W / 2, H * 0.12);

            const badgeH = 96, badgeW = 80;
            const cy = H * 0.38;
            const leftX = W * 0.28;
            const rightX = W * 0.72;

            const dibujarEquipo = (eq, cx, lado) => {
                const color = this._teamColor(eq, lado === 'L' ? '#4da3ff' : '#ff6b6b');
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy - 8, 58, 0, Math.PI * 2);
                ctx.fillStyle = color + '22';
                ctx.fill();
                ctx.restore();

                const img = eq ? this._badgeImage(eq) : null;
                if (img && img.width) {
                    const k = Math.min(badgeW / img.width, badgeH / img.height);
                    const dw = img.width * k, dh = img.height * k;
                    ctx.drawImage(img, cx - dw / 2, cy - dh / 2 - 10, dw, dh);
                } else {
                    ctx.fillStyle = color;
                    ctx.fillRect(cx - 36, cy - 48, 72, 86);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cx - 36, cy - 48, 72, 86);
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 22px Courier New';
                    ctx.fillText(eq && eq.siglas ? eq.siglas : '?', cx, cy - 5);
                }

                const nombre = eq ? (eq.corto || eq.nombre || eq.id) : (lado === 'L' ? 'LOCAL' : 'VISITANTE');
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px Courier New';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                let label = String(nombre).toUpperCase();
                if (label.length > 12) label = label.slice(0, 11) + '…';
                label = this._nombreOnline(lado, label);
                ctx.strokeText(label, cx, cy + 58);
                ctx.fillText(label, cx, cy + 58);

                ctx.fillStyle = color;
                ctx.font = '10px Courier New';
                const tag = this.enLinea
                    ? (lado === 'L' ? 'LOCAL' : 'VISITANTE')
                    : (lado === 'L' ? 'TU EQUIPO' : 'RIVAL');
                ctx.fillText(tag, cx, cy + 74);
            };

            dibujarEquipo(eqL, leftX, 'L');
            dibujarEquipo(eqR, rightX, 'R');

            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 36px Courier New';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.strokeText('VS', W / 2, cy - 4);
            ctx.fillText('VS', W / 2, cy - 4);

            ctx.strokeStyle = 'rgba(255,204,0,0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(W * 0.12, H * 0.58);
            ctx.lineTo(W * 0.88, H * 0.58);
            ctx.stroke();

            const bw = 260, bh = 12, bx = W / 2 - bw / 2, by = H * 0.64;
            ctx.fillStyle = '#111a2e';
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(bx + 2, by + 2, Math.max(0, (bw - 4) * progress), bh - 4);
            ctx.fillStyle = '#aab6c9';
            ctx.font = '12px Courier New';
            ctx.fillText('Cargando… ' + Math.ceil(t) + 's', W / 2, by + 26);

            ctx.fillStyle = '#9ecbff';
            ctx.font = '11px Courier New';
            ctx.fillText('Joystick · SPRINT · TIRO · PASE · CAMBIAR', W / 2, H * 0.78);
            ctx.restore();
            return;
        }

        if (g.estado === EstadoPartido.CUENTA_REGRESIVA) {
            const n = g.countdownNumber > 0 ? g.countdownNumber : '¡YA!';
            ctx.save();
            ctx.fillStyle = 'rgba(2, 8, 23, 0.35)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 96px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 6;
            const label = String(n);
            ctx.strokeText(label, W / 2, H * 0.45);
            ctx.fillText(label, W / 2, H * 0.45);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px Courier New';
            ctx.fillText('EL PARTIDO COMIENZA', W / 2, H * 0.58);
            ctx.restore();
        }
    },

    _pauseOptions() {
        // Online: el partido no se detiene en el servidor.
        if (this.enLinea) {
            return [
                { label: 'CONTINUAR', action: 'continuar' },
                { label: 'COMO JUGAR', action: 'ayuda' },
                { label: 'SALIR DEL PARTIDO', action: 'salir' }
            ];
        }
        return [
            { label: 'CONTINUAR', action: 'continuar' },
            { label: 'COMO JUGAR', action: 'ayuda' },
            { label: 'REINICIAR', action: 'reiniciar' },
            { label: 'SALIR DEL PARTIDO', action: 'salir' }
        ];
    },

    _esTactil() {
        if (this._tactil === undefined) {
            this._tactil = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
        }
        return this._tactil;
    },
    _drawMatchUI(ctx) {
        if (!this.gestor) return;
        const W = CONFIG.WIDTH;
        const g = this.gestor;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, 42);
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(0, 40, W, 2);

        const eqL = this._equipo(this.seleccion && this.seleccion.local);
        const eqR = this._equipo(this.seleccion && this.seleccion.rival);
        this._drawScoreBox(ctx, 12, 6, g.golesLocal, this._teamColor(eqL, '#3a9bff'), this._nombreOnline('L', eqL ? eqL.corto : 'LOCAL'), eqL);

        const timeStr = g.getTiempoFormateado();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(W / 2 - 38, 7, 76, 26);
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(W / 2 - 38, 7, 76, 26);
        ctx.fillStyle = g.framesRestantes < 30 * CONFIG.TARGET_FPS ? '#ff4444' : '#ffffff';
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeStr, W / 2, 20);
        if (this.enLinea) {
            ctx.font = 'bold 8px Courier New';
            ctx.fillStyle = '#ffcc00';
            ctx.textAlign = 'center';
            ctx.fillText('EN LÍNEA · ' + (this.rolEnLinea || '').toUpperCase(), W / 2, 37);
        } else {
            const nivel = DIFICULTADES[(this.seleccion && this.seleccion.dificultad) || 'normal'];
            if (nivel) {
                ctx.font = 'bold 8px Courier New';
                ctx.fillStyle = nivel.id === 'dificil' ? '#ff6b5e' : (nivel.id === 'facil' ? '#7be07b' : '#ffcc00');
                ctx.fillText(nivel.nombre, W / 2, 37);
            }
        }

        this._drawScoreBox(ctx, W - 112, 6, g.golesRival, this._mismoEquipoOnline() ? '#7a86c8' : this._teamColor(eqR, '#ff5555'), this._nombreOnline('R', eqR ? eqR.corto : 'RIVAL'), eqR);

        if (this._tactil === undefined) this._tactil = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
        // Ping en línea (esquina inferior izquierda)
        if (this.enLinea && this.socket && this.socket.connected) {
            const ms = Math.round(this._rttMs || 0);
            const label = ms <= 0 ? 'PING …' : (ms >= 250 ? ('PING ' + ms + ' · MALO') : (ms >= 150 ? ('PING ' + ms + ' · alto') : ('PING ' + ms)));
            const col = ms <= 0 ? '#aab6c9' : (ms < 80 ? '#5fd35f' : (ms < 150 ? '#ffcc00' : '#ff6b5e'));
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(4, CONFIG.HEIGHT - 20, 120, 16);
            ctx.fillStyle = col;
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, 8, CONFIG.HEIGHT - 12);
            ctx.restore();
        }

        if (g.estado === EstadoPartido.EN_JUEGO && !this._tactil) {   // en el celular no hay teclado: no tapar la cancha
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, CONFIG.HEIGHT - 22, W, 22);
            ctx.fillStyle = '#ccc';
            ctx.font = '9px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('WASD · SHIFT · MANTENER ESPACIO: cargar tiro · SOLTAR: patear · E pase · R pase elevado', W / 2, CONFIG.HEIGHT - 11);
        }
    },
    _drawScoreBox(ctx, x, y, score, color, label, team) {
        const w = team ? 100 : 66;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, y, w, 28);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, 28);
        let tx = x + 5;
        const img = team ? this._badgeImage(team) : null;
        if (img && img.width) {
            // Escudo (La Retoneta usa su logo; sobre fondo claro para que se vea)
            if (team.logo) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x + 3, y + 3, 22, 22);
                ctx.drawImage(img, x + 4, y + 4, 20, 20);
            } else {
                const bh = 22, bw = bh * (img.width / img.height || 0.83);
                ctx.drawImage(img, x + 3 + (22 - bw) / 2, y + 3, bw, bh);
            }
            tx = x + 30;
        }
        ctx.fillStyle = team ? '#ffffff' : color;
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label, tx, y + 3);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Courier New';
        ctx.textAlign = 'right';
        ctx.fillText(String(score), x + w - 6, y + 12);
    },
    _drawCartel(ctx) {
        const g = this.gestor;
        if (!g || !g.cartel) return;
        // En FINALIZADO el menú se dibuja aparte; el cartel de resultado va más arriba
        if (g.estado === EstadoPartido.FINALIZADO) return;

        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const alpha = g.cartelAlpha;
        const scale = g.cartelScale;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgba(0,0,0,${0.35 * alpha})`;
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2;
        const cy = H / 2 - 10;
        let drawn = false;

        // Cartel recortado sin fondo (assets/ui/*.png). Si el PNG no cargó (caché vieja, archivo
        // faltante, servidor distinto…) se recorta en el momento desde la hoja ui_goles, quitándole
        // el fondo: el cartel NUNCA se dibuja con el rectángulo gris de la hoja.
        let cut = this.assets['cartel_' + g.cartel];
        if (!cut || cut.__missing || cut.width <= 1) cut = this._cartelRecortado(g.cartel);
        if (cut && cut.width > 1) {
            const maxW = 360 * scale;
            const maxH = 190 * scale;
            const k = Math.min(maxW / cut.width, maxH / cut.height);
            const dw = cut.width * k, dh = cut.height * k;
            const wob = g.estado === EstadoPartido.CELEBRANDO_GOL ? Math.sin(performance.now() / 140) * 0.02 : 0;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(wob);
            ctx.drawImage(cut, -dw / 2, -dh / 2, dw, dh);
            ctx.restore();
            drawn = true;
        }

        if (!drawn) {
            const colors = { 'GOL': '#ffcc00', 'VICTORIA': '#2ecc40', 'DERROTA': '#ff4444', 'EMPATE': '#aaaaaa' };
            const label = g.cartel === 'GOL' ? '¡GOL!' : g.cartel;
            ctx.font = `bold ${Math.floor(48 * scale)}px Courier New`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillText(label, cx + 3, cy + 3);
            ctx.fillStyle = colors[g.cartel] || '#ffcc00';
            ctx.fillText(label, cx, cy);
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.strokeText(label, cx, cy);
        }

        if (g.estado === EstadoPartido.CELEBRANDO_GOL) {
            ctx.font = 'bold 18px Courier New';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`${g.golesLocal}  -  ${g.golesRival}`, cx, cy + 90 * scale);
        }
        ctx.restore();
    },

    // Recorta un cartel (GOL / VICTORIA / DERROTA / EMPATE) de la hoja ui_goles y le quita el
    // fondo: se pinta transparente todo lo que, partiendo de los bordes, se parece al color de
    // fondo. Se hace una sola vez por cartel y queda en caché.
    _cartelRecortado(nombre) {
        this._cartelCache = this._cartelCache || {};
        if (this._cartelCache[nombre] !== undefined) return this._cartelCache[nombre];
        this._cartelCache[nombre] = null;
        const sheet = this.assets && this.assets.ui_goles;
        const regions = {
            'GOL':      { sx: 35,   sy: 70,  sw: 1190, sh: 445 },
            'VICTORIA': { sx: 1260, sy: 125, sw: 1100, sh: 350 },
            'DERROTA':  { sx: 95,   sy: 575, sw: 1050, sh: 330 },
            'EMPATE':   { sx: 1360, sy: 575, sw: 900,  sh: 320 }
        };
        const reg = regions[nombre];
        if (!sheet || sheet.__missing || !reg) return null;
        try {
            // Se trabaja a 1/2 de tamaño: más que suficiente para un cartel de ~360 px.
            const w = Math.round(reg.sw / 2), h = Math.round(reg.sh / 2);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const c = cv.getContext('2d', { willReadFrequently: true });
            c.drawImage(sheet, reg.sx, reg.sy, reg.sw, reg.sh, 0, 0, w, h);
            const img = c.getImageData(0, 0, w, h);
            const d = img.data;
            // Color de fondo: promedio de las 4 esquinas
            const esq = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
            let br = 0, bg = 0, bb = 0;
            for (const [x, y] of esq) { const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; }
            br /= 4; bg /= 4; bb /= 4;
            const TOL = 46;
            const esFondo = i => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb) < TOL;
            const visto = new Uint8Array(w * h);
            const pila = [];
            const empujar = (x, y) => {
                if (x < 0 || y < 0 || x >= w || y >= h) return;
                const p = y * w + x;
                if (visto[p] || !esFondo(p * 4)) return;
                visto[p] = 1; pila.push(p);
            };
            for (let x = 0; x < w; x++) { empujar(x, 0); empujar(x, h - 1); }
            for (let y = 0; y < h; y++) { empujar(0, y); empujar(w - 1, y); }
            while (pila.length) {
                const p = pila.pop();
                const x = p % w, y = (p / w) | 0;
                d[p * 4 + 3] = 0;
                empujar(x + 1, y); empujar(x - 1, y); empujar(x, y + 1); empujar(x, y - 1);
            }
            // Borde suave: los píxeles pegados al fondo quitado quedan semitransparentes
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const p = y * w + x;
                    if (visto[p]) continue;
                    if (visto[p - 1] || visto[p + 1] || visto[p - w] || visto[p + w]) d[p * 4 + 3] = 200;
                }
            }
            c.putImageData(img, 0, 0);
            this._cartelCache[nombre] = cv;
            return cv;
        } catch (e) {
            console.warn('[Cartel] no se pudo recortar', nombre, e);
            return null;
        }
    },

    /**
     * Menú final grande: REVANCHA / MENÚ PRINCIPAL
     */
    _teamColor(team, fallback) {
        if (!team) return fallback;
        const lum = h => { const n = parseInt(h.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
        return [...team.colores].sort((a, b) => lum(b) - lum(a))[0];
    },

    /** true si es partido online y ambos usuarios eligieron el mismo equipo. */
    _mismoEquipoOnline() {
        const s = this.seleccion;
        return !!(this.enLinea && s && s.local && s.local === s.rival);
    },

    /** En online se muestra el nombre de usuario en lugar del nombre del equipo. */
    _nombreOnline(lado, respaldo) {
        if (!this.enLinea || !this.nombresOnline) return respaldo;
        const n = lado === 'L' ? this.nombresOnline.local : this.nombresOnline.visitante;
        if (!n) return respaldo;
        const t = String(n).toUpperCase();
        return t.length > 12 ? t.slice(0, 11) + '…' : t;
    },
});

import { Game } from '../game.js';
// Game — dibujo de mundo (jugadores, pelota, barras).
Object.assign(Game.prototype, {
    _drawShotAimArrow(ctx) {
        const p = this.player;
        const ball = this.ball;
        if (!p || !ball || !p.shotCharging || !p.hasBall || ball.owner !== p) return;
        if (!this.gestor || this.gestor.estado !== EstadoPartido.EN_JUEGO) return;

        // Misma lógica de asistencia que patear()
        const goal = new Vector2D(CONFIG.WIDTH / 2,
            p.team === 'local' ? CONFIG.GOAL_NORTH.y + CONFIG.GOAL_NORTH.h / 2
                               : CONFIG.GOAL_SOUTH.y + CONFIG.GOAL_SOUTH.h / 2);
        const goalDir = p.pos.directionTo(goal).normalize();
        const aimDir = p.facing.clone();
        if (aimDir.length() < 0.1) aimDir.copy(goalDir);
        aimDir.normalize();
        const dir = aimDir.scale(0.32).add(goalDir, 0.68).normalize();

        const charge = Math.max(0, Math.min(1, p.shotCharge / p.shotChargeMax));
        const len = 28 + charge * 42;
        const bx = ball.pos.x, by = ball.pos.y;
        const ex = bx + dir.x * len, ey = by + dir.y * len;

        ctx.save();
        ctx.globalAlpha = 0.55 + charge * 0.4;
        // Línea
        ctx.strokeStyle = charge > 0.95 ? '#ff4545' : '#ffcc00';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx + dir.x * (ball.radius + 4), by + dir.y * (ball.radius + 4));
        ctx.lineTo(ex, ey);
        ctx.stroke();
        // Punta de flecha
        const ang = Math.atan2(dir.y, dir.x);
        const ah = 9 + charge * 4;
        ctx.fillStyle = charge > 0.95 ? '#ff4545' : '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.45) * ah, ey - Math.sin(ang - 0.45) * ah);
        ctx.lineTo(ex - Math.cos(ang + 0.45) * ah, ey - Math.sin(ang + 0.45) * ah);
        ctx.closePath();
        ctx.fill();
        // Anillo de carga alrededor de la pelota
        ctx.strokeStyle = charge > 0.95 ? '#ff4545' : '#ffe36b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, ball.radius + 5 + charge * 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
        ctx.stroke();
        ctx.restore();
    },
    _drawBall(ctx) {
        const b = this.ball;
        if (!b) return;
        // Altura: la sombra queda en el piso (más chica y tenue cuanto más alta va) y la pelota se dibuja elevada.
        const z = Math.max(0, b.z || 0);
        const alto = Math.min(1, z / 60);
        ctx.fillStyle = 'rgba(0,0,0,' + (0.35 - alto * 0.17).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(b.pos.x, b.pos.y + 4, b.radius * (0.9 - alto * 0.3), b.radius * (0.4 - alto * 0.12), 0, 0, Math.PI * 2);
        ctx.fill();
        const bx = b.pos.x, by = b.pos.y - z;
        // Estirón de la pelota según su velocidad (fx.js)
        const bs = this.fx ? this.fx.ballStretch() : null;
        if (bs) {
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(bs.angle);
            ctx.scale(bs.sx, bs.sy);
            ctx.rotate(-bs.angle);
            ctx.translate(-bx, -by);
        }
        ctx.beginPath();
        ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f5f5f5';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Spray de paneles y acentos de color, recortado al contorno de la pelota.
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, b.radius - 0.8, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(bx, by);
        ctx.rotate(Math.atan2(b.vel.y, b.vel.x) + (this.fx ? this.fx.ballSpin : 0));
        ctx.fillStyle = '#252b32';
        ctx.beginPath();
        ctx.moveTo(-2, -8); ctx.lineTo(3, -5); ctx.lineTo(2, -1);
        ctx.lineTo(-3, 1); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5, 1); ctx.lineTo(8, 4); ctx.lineTo(4, 8);
        ctx.lineTo(0, 5); ctx.lineTo(1, 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#38a9e8';
        ctx.beginPath(); ctx.arc(-5, 5, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(3, -7); ctx.lineTo(7, -5); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
        ctx.restore();
        if (bs) ctx.restore();
    },
    _drawPlayer(ctx, p) {
        if (!p) return;
        const A = (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null;
        const atlas = this.assets.atlas;
        if (!A || !atlas || !atlas.width) return this._drawPlayerLegacy(ctx, p);

        const kitName = p.isGK ? (p.team === 'local' ? 'gk_local' : 'gk_rival')
            : ((p.kitName && A.kits[p.kitName]) ? p.kitName : p.team);
        let kit = A.kits[kitName];
        // Seguro anti-invisibles: si el atlas.webp cargado es más corto de lo que pide el kit (copia vieja
        // en la caché del navegador), drawImage no dibuja nada y el jugador "desaparece". En ese caso se
        // usa la camiseta del equipo, que siempre está en las primeras filas del atlas.
        if (!p.isGK) {
            const g = A.groups[kit.group];
            if (g._alto === undefined) g._alto = Math.max(...Object.values(g.frames).map(fr => fr.y + fr.h));
            if (kit.y + g._alto > atlas.height) {
                const base = (p.kitEquipo && A.kits[p.kitEquipo]) ? p.kitEquipo : p.team;
                kit = A.kits[base];
            }
        }
        const frames = A.groups[kit.group].frames;
        const anims = A.anims[kit.group];
        const X = this.fx ? this.fx.playerPose(p) : null;   // pose extra de fx.js (null = sin efectos)
        const viewDir = (X && X.view) ? X.view.dir : p.animDir;
        const isSide = viewDir === 'side';

        // --- qué cuadro mostrar ---
        let frameName;
        if (X && X.frameName && frames[X.frameName]) {
            frameName = X.frameName;
        } else if (X && X.slide && anims.slide) {
            frameName = anims.slide[Math.min(anims.slide.length - 1, Math.floor(X.slide.prog * anims.slide.length))];
        } else if (p.isGK && anims[p.gkAction]) {
            const actionFrames = anims[p.gkAction];
            const progress = p.gkActionTimer > 0 ? 1 - p.gkActionTimer / (p.gkAction === 'catch' ? 0.34 : 0.48) : 0;
            frameName = actionFrames[Math.min(actionFrames.length - 1, Math.floor(progress * actionFrames.length))];
        } else if (p.isSliding && anims.slide) {
            const prog = 1 - Math.max(0, p.slideTimer) / CONFIG.SLIDE_DURATION;
            frameName = anims.slide[Math.min(anims.slide.length - 1, Math.floor(prog * anims.slide.length))];
        } else if (p.kickTimer > 0 && isSide && anims.kick_side) {
            frameName = anims.kick_side[0];
        } else {
            const list = anims[`${viewDir}_${p.moving ? 'run' : 'idle'}`] || anims.down_idle;
            frameName = list[p.moving ? p.animFrame % list.length : 0];
        }
        const f = frames[frameName] || frames[anims.down_idle[0]];

        const S = A.scale || CONFIG.SPRITE_SCALE;
        const t = p.animClock;
        const footY = p.pos.y + 4;

        // Rebote al correr / respiración parado
        let bob = p.moving
            ? -Math.abs(Math.sin(t * (p.sprinting ? 22 : 15))) * 2.4
            : Math.sin(t * 2.2) * 0.6;
        const dirSign = p.facing.x >= 0 ? 1 : -1;
        let angle = p.moving ? (p.sprinting ? 0.09 : 0.03) * dirSign * (isSide ? 1 : 0.6) : 0;
        let flip = isSide && ((X && X.view) ? X.view.flip : p.flipX);
        if (p.isGK && p.gkAction.startsWith('dive')) flip = p.gkDiveDir < 0;
        let sx = 1, sy = 1, dy = 0;

        // Patada de frente/espalda: estirón corto (de costado ya usa su cuadro propio)
        if (p.kickTimer > 0 && !isSide) {
            const k = p.kickTimer / CONFIG.KICK_ANIM_SEC;
            sx = 1 + 0.12 * k;
            sy = 1 - 0.08 * k;
        }
        // Barrida: el cuadro mira a la derecha; se gira hacia donde se tira
        if (p.isSliding && anims.slide) {
            flip = p.facing.x < 0;
            angle = Math.atan2(p.facing.y, Math.abs(p.facing.x));
            bob = 0;
        }

        // Animaciones extra (fx.js): rebote, inclinación, festejos, tics...
        let px = p.pos.x, shadowK = 1;
        if (X) {
            bob *= X.bobMul; angle += X.angle; sx *= X.sx; sy *= X.sy; dy += X.dy; px += X.dx; shadowK = X.shadow;
            if (X.flipToggle && isSide) flip = !flip;
            if (X.slide) { flip = X.slide.dir < 0; angle = X.angle; bob = 0; }
        }

        // Salto de cabezazo: el jugador se despega un poco del piso (la sombra se queda abajo).
        if (p.headTimer > 0) {
            const salto = Math.sin((1 - p.headTimer / 0.30) * Math.PI);
            dy -= salto * 9;
            shadowK = Math.min(shadowK, 1 - 0.3 * salto);
        }

        if (this._esMiJugador(p)) this._drawPlayerIndicator(ctx, p);

        // Impacto: aplastamiento + flash
        if (p.hitSquash > 0) {
            const k = Math.min(1, p.hitSquash / 0.14);
            sx *= 1 + 0.10 * k;
            sy *= 1 - 0.08 * k;
            bob += 0.6 * k;
        }

        // Sombra (se achica un poco cuando "salta" por el rebote)
        ctx.fillStyle = `rgba(0,0,0,${(0.28 * shadowK).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(px, p.pos.y + 4, Math.max(1, ((p.isSliding || (X && X.slide)) ? 17 : 12) + bob * 0.5) * (0.75 + 0.25 * shadowK), 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Polvo al sprintar
        if (p.moving && p.sprinting) {
            const len = Math.hypot(p.vel.x, p.vel.y) || 1;
            const bx = -p.vel.x / len, by = -p.vel.y / len;
            ctx.fillStyle = 'rgba(230,230,210,0.22)';
            ctx.beginPath(); ctx.arc(p.pos.x + bx * 9, p.pos.y + 3 + by * 6, 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(230,230,210,0.12)';
            ctx.beginPath(); ctx.arc(p.pos.x + bx * 17, p.pos.y + 3 + by * 11, 2.2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.save();
        // Pixel art: mantener el anclaje visual estable en píxeles lógicos.
        // El framebuffer de alta resolución se encarga del escalado final;
        // no suavizamos el atlas porque eso puede producir un pequeño
        // desplazamiento/borrosidad aparente entre frames.
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(px), Math.round(footY + bob + dy));
        ctx.rotate(angle);
        ctx.scale(flip ? -sx : sx, sy);
        if (p.hitFlash > 0) ctx.globalAlpha = 0.82 + 0.18 * Math.sin(performance.now() / 40);
        ctx.drawImage(atlas, f.x, f.y + kit.y, f.w, f.h,
            -f.px * S, -f.py * S, f.w * S, f.h * S);
        // Online: si los dos eligieron el mismo equipo, el visitante juega con la camiseta más oscura.
        if (this._mismoEquipoOnline() && p.team === 'rival' && !p.isGK) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(8,10,40,0.45)';
            ctx.fillRect(-f.px * S, -f.py * S, f.w * S, f.h * S);
            ctx.globalCompositeOperation = 'source-over';
        }
        if (p.hitFlash > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = 'rgba(255,230,120,0.12)';
            ctx.fillRect(-f.px * S, -f.py * S, f.w * S, f.h * S);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();

        if (p.isGK) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(p.pos.x - 10, p.pos.y + 8, 20, 10);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GK', p.pos.x, p.pos.y + 13);
        }

    },

    // Dibujo anterior (imágenes fijas). Se usa solo si falta el atlas.,
    _drawPlayerLegacy(ctx, p) {

        // Elegir sprite estático limpio según equipo / rol / dirección
        let img = null;
        if (p.team === 'local') {
            if (p.isGK) {
                img = this.assets.blue_gk || this.assets.blue_front;
            } else {
                // Según dirección aproximada
                const ax = Math.abs(p.facing.x), ay = Math.abs(p.facing.y);
                if (ay >= ax) {
                    img = (p.facing.y < 0) ? (this.assets.blue_back || this.assets.blue_front)
                                           : (this.assets.blue_front || this.assets.blue_front2);
                } else {
                    img = this.assets.blue_front2 || this.assets.blue_front;
                }
            }
        } else {
            if (p.isGK) {
                img = this.assets.red_front2 || this.assets.red_front;
            } else {
                img = this.assets.red_front || this.assets.red_front2 || this.assets.red_side;
            }
        }

        const drawH = p.isGK ? 66 : 62;
        const drawW = img ? (img.width / img.height) * drawH : 40;
        const drawX = p.pos.x - drawW / 2;
        const drawY = p.pos.y - drawH + 6;

        if (this._esMiJugador(p)) this._drawPlayerIndicator(ctx, p);

        // Sombra
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.ellipse(p.pos.x, p.pos.y + 3, drawW * 0.28, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();

        if (img && img.width) {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } else {
            // fallback círculo
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y - 14, 13, 0, Math.PI * 2);
            ctx.fillStyle = p.team === 'local' ? '#1a6aff' : '#e63939';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Etiqueta GK
        if (p.isGK) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(p.pos.x - 10, p.pos.y + 6, 20, 10);
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 8px Courier New';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('GK', p.pos.x, p.pos.y + 11);
        }

        if (p.isSliding) {
            ctx.strokeStyle = 'rgba(255, 220, 80, 0.4)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(p.pos.x - p.facing.x * 14, p.pos.y - p.facing.y * 14);
            ctx.lineTo(p.pos.x, p.pos.y);
            ctx.stroke();
        }
    },
    _drawPlayerIndicator(ctx, p) {
        const x = p.pos.x;
        const y = p.pos.y + 10;
        const yb = y + (this.fx ? this.fx.indicatorBounce(p) : 0);   // el triángulo "late"
        if (this.fx) this.fx.drawIndicatorExtras(ctx, p);            // onda al pasar a ser el jugador activo
        ctx.fillStyle = p.hasBall ? 'rgba(50, 220, 80, 0.55)' : 'rgba(255, 210, 40, 0.55)';
        ctx.beginPath();
        ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.hasBall ? '#2ecc40' : '#ffcc00';
        ctx.beginPath();
        ctx.moveTo(x, yb - 5);
        ctx.lineTo(x - 6, yb + 4);
        ctx.lineTo(x + 6, yb + 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    },
    _drawStaminaBar(ctx, p) {
        const progress = Math.max(0, Math.min(1, p.stamina / CONFIG.STAMINA_MAX));
        // Debajo de los pies del jugador (sin salirse del lienzo)
        const w = 34, h = 5, x = p.pos.x - w / 2, y = Math.min(p.pos.y + 20, CONFIG.HEIGHT - h - 4);
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
        ctx.fillStyle = progress > 0.55 ? '#42d66b' : (progress > 0.25 ? '#ffd43b' : '#ff4545');
        ctx.fillRect(x, y, w * progress, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    },
    _drawShotChargeBar(ctx, p) {
        const progress = Math.max(0, Math.min(1, p.shotCharge / p.shotChargeMax));
        // Debajo de los pies (por debajo de la barra de resistencia, sin salirse del lienzo)
        const w = 46, h = 7, x = p.pos.x - w / 2, y = Math.min(p.pos.y + 46, CONFIG.HEIGHT - 12);
        const full = progress >= 0.98;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(x - 2, y - 11, w + 4, h + 15);
        ctx.font = 'bold 8px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = full ? (Math.floor(performance.now() / 90) % 2 ? '#ff4545' : '#ffd43b') : '#fff';
        ctx.fillText(full ? '¡MAX!' : 'POTENCIA', p.pos.x, y - 6);
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);
        const gradient = ctx.createLinearGradient(x, y, x + w, y);
        gradient.addColorStop(0, '#42d66b');
        gradient.addColorStop(0.7, '#ffd43b');
        gradient.addColorStop(1, '#ff4545');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w * progress, h);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    },

    // Color del marcador: el más claro de los colores del equipo (para que se lea sobre fondo oscuro).,
});

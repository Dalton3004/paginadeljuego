import { Game } from '../game.js';
// Game — menús de pausa y fin de partido.
Object.assign(Game.prototype, {
    _drawPauseMenu(ctx) {
        const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
        const g = this.gestor;
        ctx.save();
        ctx.fillStyle = 'rgba(3, 10, 22, 0.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (this._pauseHelpOpen) {
            this._drawComoJugar(ctx);
            ctx.restore();
            return;
        }

        ctx.font = 'bold 38px Courier New';
        ctx.fillStyle = '#ffcc00';
        const online = this.enLinea;
        ctx.fillText(online ? 'MENÚ' : 'PARTIDO EN PAUSA', W / 2, 150);

        const opts = this._pauseOptions();
        const n = opts.length;
        if (g.pauseMenuSelection < 0 || g.pauseMenuSelection >= n) g.pauseMenuSelection = 0;

        const y0 = 220, gap = 58, btnW = 280, btnH = 46;
        opts.forEach((opt, i) => {
            const btn = { x: (W - btnW) / 2, y: y0 + i * gap, w: btnW, h: btnH };
            this.pauseButtons[opt.action] = btn;
            const selected = g.pauseMenuSelection === i;
            ctx.fillStyle = selected ? '#ffcc00' : 'rgba(20, 35, 55, 0.96)';
            ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
            ctx.fillStyle = selected ? '#111827' : '#ffffff';
            ctx.font = 'bold 18px Courier New';
            ctx.fillText(opt.label, W / 2, btn.y + btn.h / 2);
        });
        ctx.font = '12px Courier New';
        ctx.fillStyle = '#d6deeb';
        ctx.fillText(online ? 'EL PARTIDO SIGUE EN CURSO  ·  ESC PARA VOLVER'
                            : '↑ ↓ PARA ELEGIR  ·  ENTER PARA CONFIRMAR  ·  ESC PARA VOLVER', W / 2, H - 34);
        ctx.restore();
    },
    _drawComoJugar(ctx) {
        const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
        const tactil = this._esTactil();
        ctx.font = 'bold 28px Courier New';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('CÓMO JUGAR', W / 2, 70);
        ctx.font = 'bold 13px Courier New';
        ctx.fillStyle = '#8ecbff';
        ctx.fillText(tactil ? 'CONTROLES TÁCTILES' : 'CONTROLES DE TECLADO', W / 2, 102);

        const lineas = tactil ? [
            ['Joystick', 'Mover al jugador'],
            ['SPRINT', 'Correr más rápido (gasta resistencia)'],
            ['PASE', 'Pasa al compañero hacia donde mirás'],
            ['CAMBIAR', 'Cambia de jugador controlado'],
            ['TIRO', 'Con la pelota: mantener para cargar y soltar'],
            ['BARRER', 'Sin la pelota: entrada / barrida'],
            ['PAUSA / MENÚ', 'Abre este menú']
        ] : [
            ['WASD / Flechas', 'Mover al jugador'],
            ['SHIFT', 'Sprint (gasta resistencia)'],
            ['ESPACIO', 'Con pelota: cargar tiro · sin pelota: barrer'],
            ['E', 'Pase al compañero hacia donde mirás'],
            ['R', 'Pase elevado (por el aire)'],
            ['Q', 'Cambiar de jugador'],
            ['ESC', 'Pausar / reanudar']
        ];

        const boxX = 36, boxW = W - 72;
        const rowH = 34;
        let y = 130;
        ctx.font = '13px Courier New';
        lineas.forEach(([tecla, desc], i) => {
            const by = y + i * rowH;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(15, 30, 50, 0.9)' : 'rgba(10, 22, 40, 0.9)';
            ctx.fillRect(boxX, by, boxW, rowH - 4);
            ctx.fillStyle = '#ffcc00';
            ctx.textAlign = 'left';
            ctx.font = 'bold 12px Courier New';
            ctx.fillText(tecla, boxX + 12, by + (rowH - 4) / 2);
            ctx.fillStyle = '#e8eef8';
            ctx.font = '12px Courier New';
            ctx.fillText(desc, boxX + 130, by + (rowH - 4) / 2);
        });

        const btnW = 220, btnH = 44;
        const btn = { x: (W - btnW) / 2, y: H - 78, w: btnW, h: btnH };
        this.pauseButtons.volverAyuda = btn;
        ctx.fillStyle = '#ffcc00';
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 18px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText('VOLVER', W / 2, btn.y + btn.h / 2);
        ctx.font = '11px Courier New';
        ctx.fillStyle = '#c5d0e0';
        ctx.fillText('ESC O TOCÁ VOLVER PARA REGRESAR AL MENÚ', W / 2, H - 22);
    },
    _drawEndMenu(ctx) {
        const g = this.gestor;
        const W = CONFIG.WIDTH;
        const H = CONFIG.HEIGHT;
        const alpha = Math.max(0, Math.min(1, g.cartelAlpha || 0));
        const result = g.cartel || 'FIN';
        const resultColors = {
            VICTORIA: '#48e078',
            DERROTA: '#ff626c',
            EMPATE: '#ffd45a'
        };
        const resultColor = resultColors[result] || '#ffcc00';

        // En línea, el visitante ve primero su propio resultado y marcador.
        const soyVisitante = this.enLinea && this.rolEnLinea === 'Visitante';
        const golesMios = soyVisitante ? g.golesRival : g.golesLocal;
        const golesRival = soyVisitante ? g.golesLocal : g.golesRival;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Pantalla completa de resultado, compartida por los modos local y online.
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#071326');
        bg.addColorStop(0.55, '#102b4d');
        bg.addColorStop(1, '#050b16');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Viñeta y resplandor del resultado.
        const glow = ctx.createRadialGradient(W / 2, 155, 8, W / 2, 155, 250);
        glow.addColorStop(0, resultColor + '38');
        glow.addColorStop(1, '#00000000');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Marco decorativo.
        ctx.strokeStyle = resultColor;
        ctx.globalAlpha = alpha * 0.75;
        ctx.lineWidth = 3;
        ctx.strokeRect(13, 13, W - 26, H - 26);
        ctx.globalAlpha = alpha;

        // Encabezado.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#a9c2df';
        ctx.font = 'bold 13px Courier New';
        ctx.fillText('LIGA CHAQUITO F8', W / 2, 66);

        ctx.shadowColor = resultColor;
        ctx.shadowBlur = 18;
        ctx.fillStyle = resultColor;
        ctx.font = `bold ${result === 'EMPATE' ? 39 : 43}px Courier New`;
        ctx.fillText(result === 'VICTORIA' ? '¡VICTORIA!' :
                     result === 'DERROTA' ? 'DERROTA' :
                     result === 'EMPATE' ? '¡EMPATE!' : 'PARTIDO FINALIZADO', W / 2, 137);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#dce8f7';
        ctx.font = '12px Courier New';
        ctx.fillText(result === 'VICTORIA' ? '¡Gran partido! Te llevás los tres puntos.' :
                     result === 'DERROTA' ? 'Fin del partido. ¡A buscar la revancha!' :
                     'Un partido muy parejo.', W / 2, 181);

        // Marcador principal.
        const panelX = 42, panelY = 218, panelW = W - 84, panelH = 112;
        ctx.fillStyle = 'rgba(2, 8, 20, 0.72)';
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = '#42658c';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        ctx.fillStyle = '#9fb4ce';
        ctx.font = 'bold 10px Courier New';
        ctx.fillText('TU EQUIPO', W / 2 - 91, panelY + 25);
        ctx.fillText('RIVAL', W / 2 + 91, panelY + 25);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 43px Courier New';
        ctx.fillText(String(golesMios), W / 2 - 91, panelY + 73);
        ctx.fillText(String(golesRival), W / 2 + 91, panelY + 73);
        ctx.fillStyle = '#ffcc00';
        ctx.font = 'bold 30px Courier New';
        ctx.fillText('-', W / 2, panelY + 69);

        // Acciones.
        if (this.modoLiga) {
            g.endMenuSelection = 0;
            this.endButtons.revancha = { x: 85, y: 390, w: 310, h: 58 };
            this.endButtons.menu = { x: -999, y: -999, w: 0, h: 0 };
            ctx.fillStyle = '#9fe39f';
            ctx.font = '12px Courier New';
            ctx.fillText('RESULTADO GUARDADO EN LA LIGA', W / 2, 365);
            this._drawEndButton(ctx, this.endButtons.revancha, 'CONTINUAR', true);
        } else {
            this.endButtons.revancha = { x: 85, y: 365, w: 310, h: 58 };
            this.endButtons.menu = { x: 85, y: 445, w: 310, h: 58 };
            this._drawEndButton(ctx, this.endButtons.revancha, 'REVANCHA', g.endMenuSelection === 0);
            this._drawEndButton(ctx, this.endButtons.menu, 'MENÚ PRINCIPAL', g.endMenuSelection === 1);
        }

        ctx.fillStyle = '#8195ad';
        ctx.font = '10px Courier New';
        ctx.fillText('↑ ↓ / W S PARA ELEGIR  ·  ENTER O CLIC PARA CONFIRMAR', W / 2, H - 48);
        ctx.restore();
    },
    _drawEndButton(ctx, btn, label, selected) {
        // Fondo
        if (selected) {
            ctx.fillStyle = '#ffcc00';
            ctx.fillRect(btn.x - 3, btn.y - 3, btn.w + 6, btn.h + 6);
            ctx.fillStyle = '#1a1a1a';
        } else {
            ctx.fillStyle = 'rgba(30,30,30,0.9)';
        }
        ctx.fillRect(btn.x, btn.y, btn.w, btn.h);

        // Borde
        ctx.strokeStyle = selected ? '#fff' : '#666';
        ctx.lineWidth = selected ? 3 : 1.5;
        ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);

        // Texto
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = selected ? '#ffcc00' : '#cccccc';
        if (selected) {
            // texto sobre fondo oscuro ya pintado
            ctx.fillStyle = '#ffcc00';
        }
        ctx.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    },
});

import { Game } from '../game.js';
const DIFICULTAD_ORDEN = ['facil', 'normal', 'dificil'];
// Game — selección de equipo, rival y dificultad.
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    // --------------------------------------------------------
    // SELECCIÓN DE EQUIPO (tocar JUGAR -> elegir equipo -> elegir rival)
    // --------------------------------------------------------
    _teamsAvailable() {
        return typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) && EQUIPOS.length >= 2
            && !!document.getElementById('team-select');
    },

    _equipo(id) {
        if (typeof EQUIPOS === 'undefined') return null;
        return EQUIPOS.find(e => e.id === id) || null;
    },

    _startMatchFromMenu() {
        const go = () => {
            const menu = document.getElementById('main-menu');
            this.menuVisible = false;
            if (menu) menu.style.display = 'none';
            const sel = document.getElementById('team-select');
            if (sel) sel.hidden = true;
            this._playSoundtrack();
            this._initMatch();
        };
        if (typeof this._ensureMatchAssets === 'function') this._ensureMatchAssets(go);
        else go();
    },

    // Dos equipos "se parecen" si sus dos colores principales son casi iguales (en cualquier orden).
    _equiposParecidos(a, b) {
        const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
        const [a0, a1] = [a.colores[0], a.colores[1] || a.colores[0]];
        const [b0, b1] = [b.colores[0], b.colores[1] || b.colores[0]];
        return Math.min(d(a0, b0) + d(a1, b1), d(a0, b1) + d(a1, b0)) < 90;
    },

    // Escudo de un equipo como SVG (La Retoneta usa su logo propio).
    _badgeSVG(team) {
        const c = team.colores;
        const n = Math.min(3, c.length);
        const w = 100 / n;
        const stripes = c.slice(0, n).map((col, i) => `<rect x="${i * w}" y="0" width="${w + 0.5}" height="120" fill="${col}"/>`).join('');
        const ini = team.siglas.replace(/&/g, '&amp;');
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">`
            + `<defs><clipPath id="s"><path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z"/></clipPath></defs>`
            + `<g clip-path="url(#s)">${stripes}</g>`
            + `<path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z" fill="none" stroke="#fff" stroke-width="5"/>`
            + `<path d="M6 6h88v54c0 30-26 46-44 54C32 106 6 90 6 60z" fill="none" stroke="#111" stroke-width="1.5"/>`
            + `<text x="50" y="68" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="38" `
            + `fill="#fff" stroke="#111" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${ini}</text></svg>`;
    },

    _badgeURL(team) {
        return team.logo ? ('assets/' + team.logo) : ('data:image/svg+xml;utf8,' + encodeURIComponent(this._badgeSVG(team)));
    },

    // Imagen del escudo para dibujar en el lienzo (marcador). Se crea una sola vez por equipo.
    _badgeImage(team) {
        if (!team) return null;
                if (!this.badgeImgs[team.id]) {
            const img = new Image();
            img.src = this._badgeURL(team);
            this.badgeImgs[team.id] = img;
        }
        return this.badgeImgs[team.id];
    },

    _teamSprite(team, canvas) {
        const A = (typeof SPRITE_ATLAS !== 'undefined') ? SPRITE_ATLAS : null;
        const atlas = this.assets && this.assets.atlas;
        if (!A || !atlas || !atlas.width || !A.kits[team.kit]) return;
        const kit = A.kits[team.kit];
        const f = A.groups[kit.group].frames.P_idle;
        const ctx = canvas.getContext('2d');
        const k = Math.min(canvas.width / f.w, canvas.height / f.h);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(atlas, f.x, f.y + kit.y, f.w, f.h,
            (canvas.width - f.w * k) / 2, canvas.height - f.h * k, f.w * k, f.h * k);
    },

    _openTeamSelect(modo) {
        this.modoSeleccion = modo === 'online' ? 'online' : (modo === 'liga' ? 'liga' : 'solo');
        this._teamStep = 1;
        this._renderTeamSelect();
        document.getElementById('team-select').hidden = false;
        const first = document.querySelector('#ts-grid .ts-tile');
        if (first) first.focus({ preventScroll: true });
    },

    _closeTeamSelect() {
        document.getElementById('team-select').hidden = true;
    },

    _renderTeamSelect() {
        const step = this.modoSeleccion === 'online' ? 1 : (this._teamStep || 1);
        const grid = document.getElementById('ts-grid');
        const title = document.getElementById('ts-title');
        const sub = document.getElementById('ts-sub');
        const mine = this._equipo(this.seleccion.local);
        grid.innerHTML = '';
        grid.classList.toggle('diff-grid', step >= 3);
        const rndBtn = document.getElementById('ts-random');
        if (rndBtn) rndBtn.hidden = step >= 3;
        if (step === 4) {
            title.textContent = 'ELEGÍ TU TÁCTICA';
            sub.textContent = (mine ? mine.nombre : '') + ' · ¿Cómo querés que juegue tu equipo?';
            document.getElementById('ts-back').textContent = 'CAMBIAR DIFICULTAD';
            TACTICA_ORDEN.forEach((id, i) => {
                const t = TACTICAS[id];
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ts-diff ts-diff-' + ['normal', 'dificil', 'facil'][i] + ' ts-tac' + (this.seleccion.tactica === id || (!this.seleccion.tactica && i === 0) ? ' current' : '');
                b.dataset.tac = id;
                b.setAttribute('aria-label', t.nombre + ': ' + t.lema);
                b.innerHTML = '<span class="ts-diff-name">' + ((typeof window !== 'undefined' && window.esc) ? window.esc(t.nombre) : String(t.nombre).replace(/</g,'&lt;')) + '</span>'
                    + '<span class="ts-diff-lema">' + t.lema + '</span>'
                    + '<span class="ts-diff-det">' + t.detalle + '</span>';
                grid.appendChild(b);
            });
            return;
        }
        if (step === 3) {
            const rival = this._equipo(this.seleccion.rival);
            title.textContent = 'ELEGÍ LA DIFICULTAD';
            sub.textContent = this.modoSeleccion === 'liga'
                ? (mine ? mine.nombre : '') + ' · ¿Qué tan buenos son tus rivales en la liga?'
                : (mine ? mine.nombre : '') + ' vs ' + (rival ? rival.nombre : '') + ' · ¿Qué tan bueno es el rival?';
            document.getElementById('ts-back').textContent = this.modoSeleccion === 'liga' ? 'CAMBIAR MI EQUIPO' : 'CAMBIAR RIVAL';
            DIFICULTAD_ORDEN.forEach((id, i) => {
                const d = DIFICULTADES[id];
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ts-diff ts-diff-' + id + (this.seleccion.dificultad === id ? ' current' : '');
                b.dataset.diff = id;
                b.setAttribute('aria-label', d.nombre + ': ' + d.lema);
                const pips = [0, 1, 2].map(n => '<i class="' + (n <= i ? 'on' : '') + '"></i>').join('');
                b.innerHTML = '<span class="ts-diff-pips">' + pips + '</span>'
                    + '<span class="ts-diff-name">' + d.nombre + '</span>'
                    + '<span class="ts-diff-lema">' + d.lema + '</span>'
                    + '<span class="ts-diff-det">' + d.detalle + '</span>';
                grid.appendChild(b);
            });
            return;
        }
        if (step === 1) {
            title.textContent = 'ELEGÍ TU EQUIPO';
            sub.textContent = this.modoSeleccion === 'online'
                ? 'En línea. Después te quedás esperando a que aparezca un rival.'
                : this.modoSeleccion === 'liga'
                    ? 'Liga offline. Jugás solo tus partidos y el resto se simula.'
                    : (step === 1 ? 'Primero el tuyo. Después elegís al rival.' : 'El rival juega con este equipo.');
        } else {
            title.textContent = 'ELEGÍ TU RIVAL';
            sub.textContent = 'Jugás con ' + (mine ? mine.nombre : '') + ' · ¿Contra quién?';
        }
        document.getElementById('ts-random').textContent = step === 1 ? 'EQUIPO AL AZAR' : 'RIVAL AL AZAR';
        document.getElementById('ts-back').textContent = step === 1 ? 'VOLVER AL MENÚ' : 'CAMBIAR MI EQUIPO';
        for (const team of EQUIPOS) {
            if (step === 2 && mine && team.id === mine.id) continue;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ts-tile';
            b.dataset.id = team.id;
            b.style.setProperty('--c1', team.colores[0]);
            b.style.setProperty('--c2', team.colores[1] || team.colores[0]);
            b.style.setProperty('--c3', team.colores[2] || team.colores[1] || team.colores[0]);
            b.setAttribute('aria-label', team.nombre);
            const similar = step === 2 && mine && this._equiposParecidos(mine, team);
            if (step === 1 && team.id === this.seleccion.local) b.classList.add('current');
            b.innerHTML = '<span class="ts-bar"></span>'
                + '<span class="ts-art"><canvas width="96" height="150" class="ts-sprite"></canvas>'
                + '<img class="ts-badge" alt="" src="' + this._badgeURL(team) + '"></span>'
                + '<span class="ts-name">' + team.nombre + '</span>'
                + (similar ? '<span class="ts-warn">COLORES PARECIDOS</span>' : '');
            this._teamSprite(team, b.querySelector('canvas'));
            grid.appendChild(b);
        }
    },

    _pickTeam(id) {
        if (this.modoSeleccion === 'online') {
            this.seleccion.local = id;
            this._mostrarLobbyOnline();
            return;
        }
        if (this._teamStep === 1) {
            this.seleccion.local = id;
            if (this.seleccion.rival === id) this.seleccion.rival = null;
            this._teamStep = this.modoSeleccion === 'liga' ? 3 : 2;   // la liga no elige rival: va a dificultad
            this._renderTeamSelect();
            document.getElementById('team-select').scrollTop = 0;
            const first = document.querySelector('#ts-grid .ts-tile');
            if (first) first.focus({ preventScroll: true });
        } else {
            this.seleccion.rival = id;
            this._teamStep = 3;                       // paso 3: elegir la dificultad
            this._renderTeamSelect();
            document.getElementById('team-select').scrollTop = 0;
            const first = document.querySelector('#ts-grid .ts-diff.current') || document.querySelector('#ts-grid .ts-diff');
            if (first) first.focus({ preventScroll: true });
        }
    },

    _pickDificultad(id) {
        if (!DIFICULTADES[id]) return;
        this.seleccion.dificultad = id;
        this._teamStep = 4;                           // paso 4: elegir la táctica
        this._renderTeamSelect();
        document.getElementById('team-select').scrollTop = 0;
        const first = document.querySelector('#ts-grid .ts-tac.current') || document.querySelector('#ts-grid .ts-tac');
        if (first) first.focus({ preventScroll: true });
    },

    _pickTactica(id) {
        if (!TACTICAS[id]) return;
        this.seleccion.tactica = id;
        const id2 = this.seleccion.dificultad;
        if (this.modoSeleccion === 'liga' && this.liga) {
            this._closeTeamSelect();
            this.liga.crearNueva(this.seleccion.local, id2);
            return;
        }
        this._startMatchFromMenu();
    },

    // Vuelve un paso atrás en la selección (3 -> 2 -> 1 -> menú).
    _teamBack() {
        if (this.modoSeleccion === 'online') { this._closeTeamSelect(); return; }
        if (this._teamStep === 4) { this._teamStep = 3; this._renderTeamSelect(); return; }
        if (this.modoSeleccion === 'liga' && this._teamStep >= 3) { this._teamStep = 1; this._renderTeamSelect(); return; }
        if (this._teamStep >= 2) { this._teamStep--; this._renderTeamSelect(); }
        else this._closeTeamSelect();
    },

    _randomRival() {
        const mine = this._equipo(this.seleccion.local);
        let pool = EQUIPOS.filter(t => !mine || t.id !== mine.id);
        const distintos = pool.filter(t => !mine || !this._equiposParecidos(mine, t));
        if (distintos.length) pool = distintos;       // se evitan camisetas casi iguales
        return pool[Math.floor(Math.random() * pool.length)].id;
    },

    _bindTeamSelect() {
        const root = document.getElementById('team-select');
        if (!root) return;
        root.addEventListener('click', e => {
            const tacBtn = e.target.closest('.ts-tac');
            if (tacBtn) { this._pickTactica(tacBtn.dataset.tac); return; }
            const diffBtn = e.target.closest('.ts-diff');
            if (diffBtn) { this._pickDificultad(diffBtn.dataset.diff); return; }
            const tile = e.target.closest('.ts-tile');
            if (tile) { this._pickTeam(tile.dataset.id); return; }
            if (e.target.closest('#ts-random')) {
                if (this._teamStep === 1) this._pickTeam(EQUIPOS[Math.floor(Math.random() * EQUIPOS.length)].id);
                else this._pickTeam(this._randomRival());
            } else if (e.target.closest('#ts-back')) {
                this._teamBack();
            }
        });
        root.addEventListener('keydown', e => {
            if (e.code === 'Escape') {
                this._teamBack();
                e.stopPropagation();
            }
        });
    },

    _showMainMenu() {
        // Si se estaba jugando un partido de la liga, se vuelve a la pantalla de la liga.
        if (this.modoLiga && this.liga && this.liga.liga) {
            this.modoLiga = null;
            this.liga.mostrar();
            this._updateMatchMusic();
            return;
        }
        this.modoLiga = null;
        const modeMenu = document.getElementById('mode-menu');
        if (modeMenu) modeMenu.hidden = true;
        if (this.liga) this.liga.ocultar();
        this.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'flex';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        this._ocultarEspera();
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        this._updateMatchMusic();
    },
});

import { SettingsStore, AuthStore } from './settings.js';
import { RankingStore } from './ranking.js';
import { LigaModo } from './liga.js';
import { kitDeJugador } from './assets/skins.js';
import { EQUIPOS } from './assets/equipos.js';
// CONFIG / EstadoPartido / GestorPartido etc. via sim side-effect globals
import './sim/browser-globals.js';
import { Preloader } from './game/preloader.js';
import { FX } from './fx.js';
import { NetSync } from './net/netsync.js';
import { Crowd } from './assets/hinchada/fans.js';
import './assets/sprites/atlas.js';
import './assets/animaciones.js';
import './assets/hinchada/fans_atlas.js';

// ============================================================
// GAME
// ============================================================
export class Game {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        // Renderizado de alta resolución: mantenemos intactas las coordenadas lógicas
        // del juego (480x640), pero usamos un framebuffer 2x adicional para que el
        // partido se vea mucho más definido al mostrarse grande en PC.
        // En pantallas HiDPI se combina con el DPR real, limitado a 2x para no
        // disparar innecesariamente el consumo de memoria.
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderScale = 2;
        this.canvas.width = Math.round(CONFIG.WIDTH * this.dpr * this.renderScale);
        this.canvas.height = Math.round(CONFIG.HEIGHT * this.dpr * this.renderScale);
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.setTransform(this.dpr * this.renderScale, 0, 0, this.dpr * this.renderScale, 0, 0);

        this.assets = {};
        this.soundtrack = null;
        this._soundtrackStarted = false;
        this._musicTracks = [
            'assets/MUSICA-SOUNDTRACK.mp3',
            'assets/Final_Surge.mp3',
            'assets/Before_the_Final_Whistle.mp3'
        ];
        this._musicIndex = 0;
        this._faseMusicaActual = 'menu';
        // Música bajo demanda: no se descarga ninguna pista hasta que haga falta.
        this._cancha = null;
        this._canchaAudioReady = false;
        this._cantoBuffer = null;
        this._cantoSrc = null;
        this._cantoGain = null;
        this._cantoPendiente = false;
        this._matchAssetsReady = false;
        this._matchAssetsLoading = false;
        // Efectos por Web Audio: disparan en el mismo instante de la acción.
        this._sfx = null;
        this._sfxKickIdx = 0;
        this._prevMatchEstado = null;
        this._prevBallOwner = null;
        this._audioCtx = null;
        this._sfxBuffers = null;
        this._sfxNodes = {};
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
            try { this._audioCtx = new AudioCtx({ latencyHint: 'interactive' }); }
            catch (e) {
                try { this._audioCtx = new AudioCtx(); } catch (e2) { this._audioCtx = null; }
            }
        }
        if (typeof Audio !== 'undefined') {
            const mk = (src) => {
                const a = new Audio(src);
                a.preload = 'auto';
                a.volume = 0.85;
                return a;
            };
            this._sfx = {
                whistle: mk('assets/sfx/whistle.mp3'),
                goal: mk('assets/sfx/goal.mp3'),
                kicks: [
                    mk('assets/sfx/kick1.mp3'),
                    mk('assets/sfx/kick2.mp3'),
                    mk('assets/sfx/kick3.mp3'),
                    mk('assets/sfx/kick4.mp3')
                ]
            };
        }
        // Preferencias guardadas (música, volumen, dificultad por defecto, etc.)
        this.prefs = (typeof SettingsStore !== 'undefined') ? SettingsStore.get() : {
            musicEnabled: true, musicVolume: 0.10, sfxEnabled: true, sfxVolume: 0.85,
            defaultDifficulty: 'normal', showHints: true, reduceMotion: false, vibration: true
        };
        this._aplicarPreferencias(this.prefs);
        this._cargarSfx();
        this.isRunning = false;
        this.lastTime = 0;
        this.accumulator = 0;
        this.frameTime = 1000 / CONFIG.TARGET_FPS;

        this.player = null;
        this.ball = null;
        this.gestor = null;
        this.players = [];

        // Capa de animaciones y game feel (fx.js). Es opcional: si no carga, el juego sigue igual.
        this.fx = (typeof FX !== 'undefined') ? new FX.Mundo(this) : null;

        // Menú final: botones
        this.endButtons = {
            revancha: { x: 0, y: 0, w: 200, h: 48 },
            menu:     { x: 0, y: 0, w: 200, h: 48 }
        };
        this.pauseButtons = {
            continuar: { x: 0, y: 0, w: 240, h: 48 },
            ayuda: { x: 0, y: 0, w: 240, h: 48 },
            reiniciar: { x: 0, y: 0, w: 240, h: 48 },
            salir: { x: 0, y: 0, w: 240, h: 48 },
            volverAyuda: { x: 0, y: 0, w: 240, h: 48 }
        };
        this._pauseHelpOpen = false;

        this.loadingBar = document.getElementById('loading-bar');
        this.loadingText = document.getElementById('loading-text');
        this.loadingScreen = document.getElementById('loading-screen');

        this.menuVisible = true;
        // Equipos (assets/equipos.js): el jugador elige el suyo y el rival al tocar JUGAR.
        this.seleccion = { local: 'retoneta', rival: 'el_boguero', dificultad: 'normal' };
        this.modoSeleccion = 'solo';
        this.modoLiga = null;          // {fecha, registrado} mientras se juega un partido de la liga
        this._formatoLiga = 'ida';
        this.liga = new LigaModo(this);
        this.badgeImgs = {};
        this.enLinea = false;
        this._menuOnline = false;   // menú de pausa del modo en línea (el partido sigue corriendo en el servidor)
        this.buscando = false;
        this.socket = null;
        this.miId = '';
        this.rolEnLinea = null;
        this.textoRed = '';
        this._netListo = false;
        this._vistas = new Map();
        this._inputFrame = 0;
        this._inputDirty = false;
        this.teclas = { w: false, a: false, s: false, d: false, espacio: false, tiro: false, barrer: false, shift: false, e: false, r: false, q: false };
        // Dirección/sprint que el jugador mantiene apretados (teclado o joystick).
        // Al cambiar de jugador con Q (o al pasar la pelota) se reaplican: no hay que volver a tocar las teclas.
        this._heldMove = { up: false, down: false, left: false, right: false, shift: false };
        this._bindInput();
        this._bindMenu();
        this._bindTouchControls();
        this._bindEspera();
    }

    _aplicarPreferencias(prefs) {
        this.prefs = prefs || this.prefs || {};
        if (this.prefs.defaultDifficulty) {
            this.dificultadPreferida = this.prefs.defaultDifficulty;
        }
        if (this.soundtrack || this._cancha) {
            this._faseMusicaActual = '';
            this._updateMatchMusic();
        }
    }

    // --------------------------------------------------------
    // HINCHADA (assets/hinchada/fans.js)
    // Tribunas animadas sobre las gradas pintadas de cancha.webp.
    // Coordenadas en el espacio lógico 480x640 del juego.
    // --------------------------------------------------------
    _initHinchada() {
        this.hinchada = null;
        if (typeof Crowd === 'undefined' || !this.assets || !this.assets.fans) return;
        try {
            const side = 0.4, top = 0.3;   // escala: acorde al tamaño de las gradas pintadas
            const stands = [
                // laterales izquierdos / derechos (arriba y abajo de los banquillos)
                { x: 4,   y: 64,  w: 42, h: 170, scale: side, clip: { x: 2,   y: 62,  w: 46, h: 174 } },
                { x: 3,   y: 396, w: 36, h: 160, scale: side, clip: { x: 2,   y: 394, w: 40, h: 164 } },
                { x: 434, y: 64,  w: 42, h: 170, scale: side, clip: { x: 432, y: 62,  w: 46, h: 174 } },
                { x: 442, y: 396, w: 36, h: 160, scale: side, clip: { x: 440, y: 394, w: 40, h: 164 } },
                // tribuna de fondo (detrás del arco rival)
                { x: 94,  y: 4,   w: 92, h: 46,  scale: top,  clip: { x: 92,  y: 2,   w: 96, h: 48 } },
                { x: 194, y: 4,   w: 94, h: 40,  scale: top,  clip: { x: 192, y: 2,   w: 98, h: 42 } },
                { x: 306, y: 4,   w: 86, h: 46,  scale: top,  clip: { x: 304, y: 2,   w: 90, h: 48 } }
            ];
            this.hinchada = new Crowd({ image: this.assets.fans, stands, seed: 11, waveSpeed: 260, groupChance: 0.2, standChance: 0.45 });
            this._hinchadaChanceT = 0;
        } catch (e) {
            console.warn('[Hinchada] desactivada:', e);
            this.hinchada = null;
        }
    }

    _updateHinchada(dt) {
        const h = this.hinchada;
        if (!h) return;
        if (this.gestor && this.gestor.pausado) return;
        h.update(dt);
        // Tiros peligrosos: la tribuna hace "uuh" cuando la pelota viaja rápido hacia un arco
        const g = this.gestor, b = this.ball;
        this._hinchadaChanceT -= dt;
        if (!g || !b || g.estado !== EstadoPartido.EN_JUEGO || this._hinchadaChanceT > 0) return;
        const sp = Math.hypot(b.vel.x, b.vel.y);
        if (sp < 6) return;
        const haciaNorte = b.vel.y < -3 && b.pos.y < 250 && b.pos.x > 150 && b.pos.x < 330;
        const haciaSur = b.vel.y > 3 && b.pos.y > 390 && b.pos.x > 150 && b.pos.x < 330;
        if (haciaNorte || haciaSur) {
            h.chance(Math.min(1, 0.45 + sp / 20));
            this._hinchadaChanceT = 2.2;
        }
    }

    getMenuAssetManifest() {
        // Solo lo necesario para mostrar el menú (portada ya va por CSS).
        return [
            { key: 'pantalla',  src: 'opt/pantalla.webp',  type: 'image', bytes: 284000 },
            { key: 'logo',      src: 'CHAQUITO FUTBOL.jpg', type: 'image', bytes: 4000 },
            { key: 'ui_rangos', src: 'opt/ui_rangos.webp', type: 'image', bytes: 54000 }
        ];
    }

    getMatchAssetManifest() {
        // Assets del partido: se cargan en segundo plano tras el menú (o al tocar Jugar).
        return [
            { key: 'cancha',          src: 'opt/cancha.webp',          type: 'image', bytes: 136000 },
            { key: 'ui_goles',        src: 'opt/ui_goles.webp',        type: 'image', bytes: 144000 },
            { key: 'cartel_GOL',      src: 'ui/gol.webp',              type: 'image', bytes: 32000 },
            { key: 'cartel_VICTORIA', src: 'ui/victoria.webp',         type: 'image', bytes: 35000 },
            { key: 'cartel_DERROTA',  src: 'ui/derrota.webp',          type: 'image', bytes: 24000 },
            { key: 'cartel_EMPATE',   src: 'ui/empate.webp',           type: 'image', bytes: 24000 },
            // ?v=41: el servidor cachea /assets 1 año (immutable). Subí este número cada vez que cambie atlas.webp.
            { key: 'atlas',          src: 'sprites/atlas.webp?v=41',  type: 'image', bytes: 880000 },
            { key: 'fans',           src: 'hinchada/fans_atlas.webp', type: 'image', bytes: 98000 },
            // Respaldo si falta el atlas (poco peso)
            { key: 'blue_front',  src: 'sprites/blue_front.png',  type: 'image', bytes: 7000 },
            { key: 'blue_front2', src: 'sprites/blue_front2.png', type: 'image', bytes: 7000 },
            { key: 'blue_back',   src: 'sprites/blue_back.png',   type: 'image', bytes: 7000 },
            { key: 'blue_gk',     src: 'sprites/blue_gk.png',     type: 'image', bytes: 7000 },
            { key: 'red_front',   src: 'sprites/red_front.png',   type: 'image', bytes: 7000 },
            { key: 'red_front2',  src: 'sprites/red_front2.png',  type: 'image', bytes: 7000 },
            { key: 'red_side',    src: 'sprites/red_side.png',    type: 'image', bytes: 7000 }
        ];
    }

    /** Compat: lista completa (menú + partido). */
    getAssetManifest() {
        return this.getMenuAssetManifest().concat(this.getMatchAssetManifest());
    }

    _fmtBytes(n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    _setLoadingProgress(percent, key, detail) {
        if (this.loadingBar) this.loadingBar.style.width = Math.max(0, Math.min(100, percent)) + '%';
        if (!this.loadingText) return;
        const d = detail || {};
        if (d.bytesTotal > 0) {
            this.loadingText.textContent = `Cargando ${this._fmtBytes(d.bytesLoaded)} / ${this._fmtBytes(d.bytesTotal)} (${percent}%)`
                + (key ? ` · ${key}` : '');
        } else {
            this.loadingText.textContent = key
                ? `Cargando: ${key} (${percent}%)`
                : `Cargando… (${percent}%)`;
        }
    }

    _ensureMatchAssets(done) {
        if (this._matchAssetsReady) {
            if (done) done();
            return;
        }
        if (this._matchAssetsLoading) {
            this._matchAssetsWaiters = this._matchAssetsWaiters || [];
            if (done) this._matchAssetsWaiters.push(done);
            return;
        }
        this._matchAssetsLoading = true;
        this._matchAssetsWaiters = done ? [done] : [];
        if (this.loadingScreen) {
            this.loadingScreen.classList.remove('hidden');
            if (this.loadingText) this.loadingText.textContent = 'Cargando partido…';
            if (this.loadingBar) this.loadingBar.style.width = '0%';
        }
        const extra = this.getMatchAssetManifest().filter(a => !this.assets[a.key]);
        const pre = new Preloader(extra);
        pre.onProgress = (percent, key, detail) => this._setLoadingProgress(percent, key, detail);
        pre.onComplete = (assets) => {
            Object.assign(this.assets, assets);
            this._matchAssetsReady = true;
            this._matchAssetsLoading = false;
            this._initHinchada();
            if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
            const waiters = this._matchAssetsWaiters || [];
            this._matchAssetsWaiters = [];
            waiters.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
        };
        pre.load();
    }

    start() {
        console.log('%c[Liga Chaquito F8] Controles: E pase · R pase elevado · mantener ESPACIO carga el tiro / soltar patea', 'color: #ffcc00; font-weight: bold;');

        // Fase 1: solo menú (progreso real por bytes).
        const preloader = new Preloader(this.getMenuAssetManifest());
        preloader.onProgress = (percent, key, detail) => this._setLoadingProgress(percent, key, detail);
        preloader.onComplete = (assets) => {
            this.assets = assets;
            this._initMatch();
            this._showMainMenu();
            setTimeout(() => {
                if (this.loadingScreen) this.loadingScreen.classList.add('hidden');
                this.isRunning = true;
                this.lastTime = performance.now();
                requestAnimationFrame(t => this.loop(t));
                // Fase 2: partido en segundo plano (sin bloquear el menú si ya se ocultó el loading).
                const extra = this.getMatchAssetManifest();
                const bg = new Preloader(extra);
                bg.onProgress = (percent, key, detail) => {
                    // Solo actualizar barra si el loading sigue visible (usuario aún no entró).
                    if (this.loadingScreen && !this.loadingScreen.classList.contains('hidden')) {
                        this._setLoadingProgress(percent, key, detail);
                    }
                };
                bg.onComplete = (more) => {
                    Object.assign(this.assets, more);
                    this._matchAssetsReady = true;
                    this._initHinchada();
                };
                bg.load();
            }, 280);
        };
        preloader.load();
        if (typeof AuthStore !== 'undefined' && AuthStore.restaurar) {
            AuthStore.restaurar().then(() => {
                if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) RankingStore.sincronizar();
            });
        }
    }


    _anotarResultadoRanking(cartel) {
        if (this._rankingAnotado) return;
        this._rankingAnotado = true;
        if (typeof RankingStore === 'undefined' || !RankingStore.registrarPartido) return;
        const yo = (typeof AuthStore !== 'undefined' && AuthStore.current) ? AuthStore.current() : null;
        if (!yo) return;
        const resultado = cartel === 'VICTORIA' ? 'win' : (cartel === 'DERROTA' ? 'loss' : 'draw');
        const gf = this.gestor ? this.gestor.golesLocal : 0;
        const gc = this.gestor ? this.gestor.golesRival : 0;
        const modo = this.modoLiga ? 'liga' : 'solo';
        RankingStore.registrarPartido(yo.nombre, resultado, null, { gf, gc, modo });
    }

    _initMatch() {
        this._rankingAnotado = false;
        const cx = CONFIG.WIDTH / 2;
        const cy = CONFIG.HEIGHT / 2;

        // AZUL = equipo controlable (local), abajo. ROJO = rival, arriba.
        // Formación inicial simétrica: ambos equipos ocupan las mismas posiciones relativas
        // respecto del centro de la cancha; el rival se espeja verticalmente para no
        // arrancar más cerca del centro que el equipo controlable.
        // Tácticas: el jugador elige la formación de su equipo; el rival sortea la suya (casi siempre equilibrada).
        const tacLocal = TACTICAS[(this.seleccion && this.seleccion.tactica)] || TACTICAS.equilibrada;
        const r = Math.random();
        const tacRival = TACTICAS[r < 0.55 ? 'equilibrada' : (r < 0.80 ? 'ofensiva' : 'defensiva')];
        const [l0, l1, l2] = tacLocal.f;
        const [r0, r1, r2] = tacRival.f;
        this.tacticaRival = tacRival.id;

        this.player = new Jugador(cx + l0[0], l0[1], { isHuman: true, team: 'local', mobilityId: 'local_0' });

        const localMates = [
            new Jugador(cx + l1[0], l1[1], { team: 'local', mobilityId: 'local_1' }),
            new Jugador(cx + l2[0], l2[1], { team: 'local', mobilityId: 'local_2' }),
            new Jugador(cx, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }) // arquero
        ];

        // El rival usa su formación espejada sobre el eje horizontal central (mismo orden, Y = alto − Y).
        const rivals = [
            new Jugador(cx + r0[0], CONFIG.HEIGHT - r0[1], { team: 'rival', mobilityId: 'rival_0' }),
            new Jugador(cx + r1[0], CONFIG.HEIGHT - r1[1], { team: 'rival', mobilityId: 'rival_1' }),
            new Jugador(cx + r2[0], CONFIG.HEIGHT - r2[1], { team: 'rival', mobilityId: 'rival_2' }),
            new Jugador(cx, 95,       { team: 'rival', isGK: true, mobilityId: 'rival_gk' }) // arquero rival
        ];

        this.players = [this.player, ...localMates, ...rivals];
        // Camiseta de cada equipo (colores de assets/equipos.js). Los arqueros conservan la suya.
        const eqLocal = this._equipo(this.seleccion && this.seleccion.local);
        const eqRival = this._equipo(this.seleccion && this.seleccion.rival);
        const dificultad = DIFICULTADES[(this.seleccion && this.seleccion.dificultad) || 'normal'] || DIFICULTADES.normal;
        // Estrellas del plantel (assets/equipos.js): ajustan ±6 % a la IA de cada equipo (nunca al jugador que manejás).
        const estLocal = eqLocal ? eqLocal.estrellas : 3, estRival = eqRival ? eqRival.estrellas : 3;
        const difRival = perfilConEstrellas(dificultad, estRival);
        const gkLocal = perfilConEstrellas(DIFICULTADES.normal, estLocal);
        const kLocal = factorEstrellas(estLocal);
        for (const p of this.players) {
            const eq = p.team === 'local' ? eqLocal : eqRival;
            if (!p.isGK && eq) { p.kitName = kitDeJugador(eq.kit, p.mobilityId); p.kitEquipo = eq.kit; }
            if (p.team === 'rival') p.diff = difRival;   // el rival juega con el nivel elegido (y el nivel de su plantel)
            // El arquero del jugador usa el perfil de arquero NORMAL siempre: así la dificultad la
            // pone el rival (mejores remates y presión) y no un arquero propio indefenso.
            else if (p.isGK) p.diff = gkLocal;
            else if (!p.isHuman) p.mobilityMultiplier *= kLocal;   // compañeros de IA: según las estrellas del equipo
            if (!p.isHuman) p.kEstrellas = p.team === 'local' ? kLocal : factorEstrellas(estRival);
            if (!p.isGK) p.tacticaAvance = (p.team === 'local' ? tacLocal : tacRival).avance;
        }
        this.ball = new Pelota(cx, cy);
        this.gestor = new GestorPartido(this.ball, this.players);
        this.controllableIndex = 0;
        this._prevMatchEstado = null;
        this._prevBallOwner = null;
        this._prevAnyKick = false;
        this._sfxKickCooldown = 0;
        this._faseMusicaActual = '';
        this._updateMatchMusic();
    }

    _keysVacias() {
        return { up: false, down: false, left: false, right: false, shift: false };
    }

    /** Copia del estado mantenido (WASD/flechas/Shift o joystick). */
    _keysDesdeHeld() {
        const h = this._heldMove || this._keysVacias();
        return { up: !!h.up, down: !!h.down, left: !!h.left, right: !!h.right, shift: !!h.shift };
    }

    /** Aplica al jugador activo las teclas que siguen apretadas. */
    _aplicarTeclasMantenidas(jugador) {
        if (!jugador) return;
        jugador.keys = this._keysDesdeHeld();
    }

    _syncActivePlayerToBall() {
        const owner = this.ball && this.ball.owner;
        if (!owner || owner.team !== 'local' || owner.isGK || owner === this.player) return;
        const locals = this.players.filter(p => p.team === 'local' && !p.isGK);
        const index = locals.indexOf(owner);
        if (index < 0) return;
        if (this.player) {
            this.player.isHuman = false;
            this.player.keys = this._keysVacias();
        }
        this.controllableIndex = index;
        this.player = owner;
        this.player.isHuman = true;
        // Sigue corriendo/caminando si WASD o el stick siguen activos.
        this._aplicarTeclasMantenidas(this.player);
    }

    _switchPlayer() {
        // Solo jugadores de campo del equipo local (no el arquero, más cómodo)
        const locals = this.players.filter(p => p.team === 'local' && !p.isGK);
        if (locals.length < 2) return;

        this.player.isHuman = false;
        this.player.keys = this._keysVacias();

        this.controllableIndex = ((this.controllableIndex || 0) + 1) % locals.length;
        this.player = locals[this.controllableIndex];
        this.player.isHuman = true;
        // No forzar a soltar WASD/Shift: el nuevo controlado hereda lo que sigue apretado.
        this._aplicarTeclasMantenidas(this.player);
    }

    // --------------------------------------------------------
    // LOOP
    // --------------------------------------------------------
    loop(timestamp) {
        if (!this.isRunning) return;
        const delta = timestamp - this.lastTime;
        this.lastTime = timestamp;
        this.accumulator += delta;
        while (this.accumulator >= this.frameTime) {
            this.update(this.frameTime / 1000);
            this.accumulator -= this.frameTime;
        }
        this.render();
        requestAnimationFrame(t => this.loop(t));
    }

    update(dt) {
        this._ligarSonidos();
        this._updateHinchada(dt);
        this._actualizarBotonesTactiles();
        if (this.enLinea) {
            this._updateMatchMusic();
            this._sincronizarRed(dt);
            if (this._netListo) this._cosmeticaEnLinea(dt);
            if (this.fx && this._netListo && this.gestor && !this.gestor.pausado) this.fx.update(dt);
            this._updateMatchSfx(dt);
            this._inputFrame++;
            if (this._inputDirty || this._inputFrame % 6 === 0) {
                this._emitirInput();
                this._inputDirty = false;
            }
            return;
        }
        if (!this.gestor || this.menuVisible) {
            this._updateMatchMusic();
            return;
        }
        this.gestor.update(dt);
        this._updateMatchMusic();
        this._updateMatchSfx(dt);
        if (this.modoLiga && !this.modoLiga.registrado && this.gestor.estado === EstadoPartido.FINALIZADO && this.liga) {
            this.modoLiga.registrado = true;
            this.liga.registrarJugado(this.gestor.golesLocal, this.gestor.golesRival);
        }
        if (!this.enLinea && this.gestor.estado === EstadoPartido.FINALIZADO && !this._rankingAnotado) {
            this._anotarResultadoRanking(this.gestor.cartel);
        }
        this._syncActivePlayerToBall();
        if (this.fx && !this.gestor.pausado) this.fx.update(dt);
    }
}

// El resto de los métodos de Game vive en game/*.js (mixins cargados después de este archivo).

// ============================================================
// BOOT
// ============================================================
export function startGame(canvasId = 'gameCanvas') {
    const game = new Game(canvasId);
    if (typeof window !== 'undefined') window.__game = game;
    game.start();
    return game;
}

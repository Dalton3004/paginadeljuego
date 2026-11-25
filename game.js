import { SettingsStore, AuthStore } from './settings.js';
import { RankingStore } from './ranking.js';
import { LigaCore, LigaModo } from './liga.js';
import { CopaCore, CopaModo } from './copa.js';
import { SupercopaModo } from './supercopa.js';
import { CarreraStore } from './career/store.js';
import { aplicarClasesAccesibilidadDOM } from './career/accesibilidad.js';
import { HistorialLocalStore } from './perfil.js';
import { kitDeJugador } from './assets/skins.js';
import { resolverCamisetasPartido } from './assets/kits_alternativos.js';
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
        this.seleccion = { local: 'retoneta', rival: 'el_boguero', dificultad: 'normal', clima: 'auto', kitAlternativo: false };
        this.modoSeleccion = 'solo';
        this.modoLiga = null;          // {fecha, registrado} mientras se juega un partido de la liga
        this.modoCopa = null;          // {rondaNombre, esFinal, registrado, penalesResueltos}
        this.modoSupercopa = null;     // {claveEdicion, miEquipo, rival, registrado, penalesResueltos}
        this.modoDesafio = null;
        this.modoArcade = null;
        this.modoHistoria = null;
        this._formatoLiga = 'ida';
        this._formatoCopa = 'unico';
        this._resultadoPenales = null;
        this._ultimoPaqueteCarrera = null;
        this._ultimoResultadoCopa = null;
        this._ultimoResultadoSupercopa = null;
        this._carreraProcesada = false;
        this._eventoEspecial = null;
        this._climaEstado = null;
        this._kitsPartido = null;
        this._finalEspecialCelebrado = false;
        this._woodworkFrame = null;
        this.liga = new LigaModo(this);
        this.copa = new CopaModo(this);
        this.supercopa = new SupercopaModo(this);
        if (typeof this._initNoticiasUI === 'function') this._initNoticiasUI();
        if (typeof this._initMiClubUI === 'function') this._initMiClubUI();
        if (typeof this._initModosExtraUI === 'function') this._initModosExtraUI();
        if (typeof this._initNavegacionUI === 'function') this._initNavegacionUI();
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
        aplicarClasesAccesibilidadDOM(this.prefs);
        if (typeof this._actualizarIndicadorNoticias === 'function') this._actualizarIndicadorNoticias();
    }

    _aplicarPreferencias(prefs) {
        this.prefs = prefs || this.prefs || {};
        aplicarClasesAccesibilidadDOM(this.prefs);
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
        if (this.gestor && this.gestor.pausado) return;
        if (h) h.update(dt);

        const g = this.gestor;
        const b = this.ball;
        if (b && b._hitWoodwork) {
            this._woodworkFrame = { ...b._hitWoodwork };
        }
        if (this._ctrlHinchada && g && !this.menuVisible) {
            const out = this._ctrlHinchada.actualizar(dt, {
                estadoPartido: g.estado,
                framesRestantes: g.framesRestantes,
                fps: CONFIG.TARGET_FPS,
                golesLocal: g.golesLocal,
                golesRival: g.golesRival,
                ball: b,
                statsEventos: (g.stats && g.stats.eventos) || [],
            });
            if (h && typeof h.setIntensity === 'function') {
                h.setIntensity(out.intensidad);
            }
            for (const acc of out.acciones) {
                if (acc.tipo === 'chance' && h && typeof h.chance === 'function') {
                    h.chance(acc.power);
                } else if (acc.tipo === 'goal' && h && typeof h.goal === 'function') {
                    h.goal(acc.side, { fraction: acc.fraction, duration: acc.duration });
                }
                if (acc.sfx && typeof this._sonarExclamacionTribuna === 'function') {
                    this._sonarExclamacionTribuna(acc.sfx);
                }
            }
            if (typeof this._aplicarVolumenHinchadaDinamica === 'function') {
                this._aplicarVolumenHinchadaDinamica(out.volumenMultiplicador);
            }
        }

        if (!h) return;
        // Tiros peligrosos: la tribuna hace "uuh" cuando la pelota viaja rápido hacia un arco
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
                if (typeof AuthStore.sincronizarCarreraRemota === 'function') {
                    AuthStore.sincronizarCarreraRemota().catch(() => null);
                }
            });
        }
    }


    _anotarResultadoRanking(cartel) {
        if (this._rankingAnotado) return;
        this._rankingAnotado = true;
        // Etapas 19 y 20: Desafíos y Chaquito Arcade tienen su propio registro y no alteran récords oficiales
        if (this.modoDesafio || this.modoArcade) return;

        let resultado = cartel === 'VICTORIA' ? 'win' : (cartel === 'DERROTA' ? 'loss' : 'draw');
        if (this._resultadoPenales && this._resultadoPenales.ganador) {
            resultado = this._resultadoPenales.ganador === 'mio' ? 'win' : 'loss';
        }
        const soyVis = this.enLinea && this.rolEnLinea === 'Visitante';
        const gf = this.gestor ? (soyVis ? this.gestor.golesRival : this.gestor.golesLocal) : 0;
        const gc = this.gestor ? (soyVis ? this.gestor.golesLocal : this.gestor.golesRival) : 0;
        const modo = this.enLinea
            ? 'online'
            : this.modoHistoria
            ? 'historia'
            : this.modoLiga
            ? 'liga'
            : this.modoCopa
            ? 'copa'
            : this.modoSupercopa
            ? 'supercopa'
            : 'solo';
        const ladoMio = soyVis ? 'rival' : 'local';

        let stats = null;
        if (this.enLinea && this._ultimoResumenOnline && this._ultimoResumenOnline.equipos) {
            const eqSt = this._ultimoResumenOnline.equipos[ladoMio];
            if (eqSt) stats = { ...eqSt, figura: this._ultimoResumenOnline.figura || null };
        } else if (this.gestor && this.gestor.stats) {
            stats = this.gestor.stats.resumenParaPersistencia(ladoMio);
        }

        const eqMioId = soyVis
            ? (this.seleccion && this.seleccion.rival)
            : (this.seleccion && this.seleccion.local);
        const eqRivalId = soyVis
            ? (this.seleccion && this.seleccion.local)
            : (this.seleccion && this.seleccion.rival);

        HistorialLocalStore.registrar({
            resultado,
            gf,
            gc,
            modo,
            equipoLocal: eqMioId || '',
            equipoRival: eqRivalId || '',
            stats,
        });

        // En online el servidor ya persiste el partido y el ranking de forma autoritativa
        if (this.enLinea) return;
        if (typeof RankingStore === 'undefined' || !RankingStore.registrarPartido) return;
        const yo = (typeof AuthStore !== 'undefined' && AuthStore.current) ? AuthStore.current() : null;
        if (!yo) return;
        RankingStore.registrarPartido(yo.nombre, resultado, null, {
            gf,
            gc,
            modo,
            equipoLocal: eqMioId || '',
            equipoRival: eqRivalId || '',
            stats,
        });
    }

    _procesarCarreraFinPartido() {
        if (this._carreraProcesada || !this.gestor) return;
        this._carreraProcesada = true;
        if (this.modoDesafio || this.modoArcade) return;

        const soyVis = !!(this.enLinea && this.rolEnLinea === 'Visitante');
        const ladoMio = soyVis ? 'rival' : 'local';
        const eqMioId = soyVis ? (this.seleccion && this.seleccion.rival) : (this.seleccion && this.seleccion.local);
        const eqRivId = soyVis ? (this.seleccion && this.seleccion.local) : (this.seleccion && this.seleccion.rival);
        const eqMioObj = this._equipo(eqMioId);
        const eqRivObj = this._equipo(eqRivId);

        const nombreMio = this.enLinea
            ? this._nombreOnline(soyVis ? 'R' : 'L', eqMioObj ? eqMioObj.corto : 'Tu Equipo')
            : (eqMioObj ? (eqMioObj.corto || eqMioObj.nombre) : 'Tu Equipo');
        const nombreRival = this.enLinea
            ? this._nombreOnline(soyVis ? 'L' : 'R', eqRivObj ? eqRivObj.corto : 'Rival')
            : (eqRivObj ? (eqRivObj.corto || eqRivObj.nombre) : 'Rival');

        const golesMios = soyVis ? this.gestor.golesRival : this.gestor.golesLocal;
        const golesOtro = soyVis ? this.gestor.golesLocal : this.gestor.golesRival;

        let serial = null;
        if (this.enLinea && this._ultimoResumenOnline) serial = this._ultimoResumenOnline;
        else if (this.gestor.stats) serial = this.gestor.stats.serializar();

        const modo = this.enLinea
            ? 'online'
            : this.modoHistoria
            ? 'historia'
            : this.modoSupercopa
            ? 'supercopa'
            : this.modoCopa
            ? 'copa'
            : this.modoLiga
            ? 'liga'
            : 'solo';

        const impLiga = this._ultimoImpactoLiga;
        const resCopa = this._ultimoResultadoCopa;
        const resSup = this._ultimoResultadoSupercopa;

        const esFinal =
            modo === 'supercopa' ||
            !!(resCopa && resCopa.esFinal) ||
            !!(this.modoHistoria && this.modoHistoria.esFinal);
        const esEliminatoria =
            modo === 'copa' ||
            modo === 'supercopa' ||
            !!(this.modoHistoria && this.modoHistoria.definirPorPenalesSiEmpata);
        const victoriaSobreLider =
            !!(modo === 'liga' && impLiga && impLiga.liderAntesId && impLiga.liderAntesId === eqRivId && golesMios > golesOtro);
        const tituloGanado =
            !!(resSup && resSup.campeon) ||
            !!(resCopa && resCopa.campeon) ||
            !!(impLiga && impLiga.proximo && impLiga.proximo.terminada && impLiga.proximo.salioCampeon) ||
            !!(this.modoHistoria && this.modoHistoria.esFinal && this.modoHistoria.evaluacion && this.modoHistoria.evaluacion.superado);

        const contextoTorneo =
            modo === 'historia' && this.modoHistoria
                ? `HISTORIA · ${this.modoHistoria.titulo}`
                : modo === 'supercopa'
                ? 'SUPERCOPA CHAQUITO'
                : modo === 'copa'
                ? `COPA CHAQUITO · ${(resCopa && resCopa.rondaJugada) || 'ELIMINATORIA'}`
                : modo === 'liga'
                ? `LIGA CHAQUITO · FECHA ${(impLiga && impLiga.fechaJugada) || 1}`
                : modo === 'online'
                ? 'EN LÍNEA 1 VS 1'
                : 'AMISTOSO';

        this._ultimoPaqueteCarrera = CarreraStore.procesarPartido({
            modo,
            miEquipoId: eqMioId || '',
            rivalId: eqRivId || '',
            nombreMio,
            nombreRival,
            ladoMio,
            golesMios,
            golesOtro,
            penales: this._resultadoPenales,
            golesDetalle: (serial && serial.goles) || [],
            figura: (serial && serial.figura) || null,
            impactoLiga: impLiga,
            infoCopa: resCopa,
            infoSupercopa: resSup,
            esFinal,
            esEliminatoria,
            partidoImportante: esFinal || victoriaSobreLider || modo === 'historia' || !!(impLiga && impLiga.posDespues <= 2),
            victoriaSobreLider,
            tituloGanado,
            contextoTorneo,
            clima: (this._climaEstado && this._climaEstado.id) || 'dia',
            forzarConferencia: !!(this.modoHistoria && this.modoHistoria.forzarConferencia),
        });

        if (typeof this._actualizarIndicadorNoticias === 'function') {
            this._actualizarIndicadorNoticias();
        }
        if (typeof AuthStore !== 'undefined' && typeof AuthStore.respaldarCarreraRemota === 'function') {
            AuthStore.respaldarCarreraRemota().catch(() => null);
        }
    }

    _initMatch() {
        this._rankingAnotado = false;
        this._carreraProcesada = false;
        this._finalEspecialCelebrado = false;
        this._resultadoPenales = null;
        this._ultimoPaqueteCarrera = null;
        this._ultimoResultadoCopa = null;
        this._ultimoResultadoSupercopa = null;
        if (typeof this._cancelarPenales === 'function') this._cancelarPenales();
        if (typeof this._resetPostPartido === 'function') this._resetPostPartido();
        if (typeof this._initReplaySystem === 'function') this._initReplaySystem();
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
        // Camiseta de cada equipo (colores de assets/equipos.js) y soporte de camiseta alternativa (Etapa 15).
        const eqLocal = this._equipo(this.seleccion && this.seleccion.local);
        const eqRival = this._equipo(this.seleccion && this.seleccion.rival);
        const kitsRes = !this.enLinea
            ? resolverCamisetasPartido(eqLocal, eqRival, {
                  localUsaAlt: !!(this.seleccion && this.seleccion.kitAlternativo),
              })
            : { localAlt: false, rivalAlt: false, localInfo: null, rivalInfo: null };
        this._kitsPartido = kitsRes;

        const dificultad = DIFICULTADES[(this.seleccion && this.seleccion.dificultad) || 'normal'] || DIFICULTADES.normal;
        // Estrellas del plantel (assets/equipos.js): ajustan ±6 % a la IA de cada equipo (nunca al jugador que manejás).
        const estLocal = eqLocal ? eqLocal.estrellas : 3, estRival = eqRival ? eqRival.estrellas : 3;
        const difRival = perfilConEstrellas(dificultad, estRival);
        const gkLocal = perfilConEstrellas(DIFICULTADES.normal, estLocal);
        const kLocal = factorEstrellas(estLocal);
        for (const p of this.players) {
            const eq = p.team === 'local' ? eqLocal : eqRival;
            if (!p.isGK && eq) {
                p.kitName = kitDeJugador(eq.kit, p.mobilityId);
                p.kitEquipo = eq.kit;
                p.altKitTint =
                    p.team === 'local'
                        ? (kitsRes.localAlt && kitsRes.localInfo ? kitsRes.localInfo.tint : null)
                        : (kitsRes.rivalAlt && kitsRes.rivalInfo ? kitsRes.rivalInfo.tint : null);
            } else {
                p.altKitTint = null;
            }
            if (p.team === 'rival') p.diff = difRival;   // el rival juega con el nivel elegido (y el nivel de su plantel)
            // El arquero del jugador usa el perfil de arquero NORMAL siempre: así la dificultad la
            // pone el rival (mejores remates y presión) y no un arquero propio indefenso.
            else if (p.isGK) p.diff = gkLocal;
            else if (!p.isHuman) p.mobilityMultiplier *= kLocal;   // compañeros de IA: según las estrellas del equipo
            if (!p.isHuman) p.kEstrellas = p.team === 'local' ? kLocal : factorEstrellas(estRival);
            if (!p.isGK) p.tacticaAvance = (p.team === 'local' ? tacLocal : tacRival).avance;
        }
        this.ball = new Pelota(cx, cy);
        this.gestor = new GestorPartido(this.ball, this.players, {
            equipoLocalId: (this.seleccion && this.seleccion.local) || '',
            equipoRivalId: (this.seleccion && this.seleccion.rival) || '',
        });
        this.gestor.onGoal = (golInfo) => {
            if (typeof this._registrarGolEnReplay === 'function') this._registrarGolEnReplay(golInfo);
            if (typeof this._onGolFaseD === 'function') this._onGolFaseD(golInfo);
        };
        this.gestor.onCelebrationEnd = () => {
            if (typeof this._iniciarReplayTrasCelebracion === 'function') {
                return this._iniciarReplayTrasCelebracion();
            }
            return false;
        };

        // Etapas 14, 15 y 16: clasificación de evento especial, clima de estadio e hinchada dinámica
        const rivInfo = !this.enLinea
            ? CarreraStore.rivalidadEntre(eqLocal && eqLocal.id, eqRival && eqRival.id)
            : null;
        this._eventoEspecial =
            typeof this._clasificarEventoPartido === 'function'
                ? this._clasificarEventoPartido({
                      enLinea: this.enLinea,
                      modoSupercopa: this.modoSupercopa,
                      modoCopa: this.modoCopa,
                      modoLiga: this.modoLiga,
                      ligaActual: this.liga && this.liga.liga,
                      LigaCoreRef: LigaCore,
                      rivalidadInfo: rivInfo,
                      rivalId: (eqRival && eqRival.id) || '',
                  })
                : { tipo: 'normal', esEspecial: false, esFinal: false, intensidadBaseHinchada: 0.12 };
        if (this.modoHistoria && this.modoHistoria.esFinal) {
            this._eventoEspecial = {
                tipo: 'final_historia',
                esEspecial: true,
                esFinal: true,
                etiqueta: '👑 GRAN FINAL · MODO HISTORIA',
                subtitulo: this.modoHistoria.titulo,
                color: '#ffcc00',
                mostrarTrofeo: true,
                confetiInicial: true,
                intensidadBaseHinchada: 0.52,
            };
        }

        if (typeof this._initClimaPartido === 'function') {
            this._initClimaPartido({
                esFinal: !!(this._eventoEspecial && this._eventoEspecial.esFinal),
                esSupercopa: !!this.modoSupercopa,
                esClasico: !!(rivInfo && rivInfo.esClasico),
            });
        }
        if (typeof this._initControladorHinchada === 'function') {
            this._initControladorHinchada({
                esClasico: !!(rivInfo && rivInfo.esClasico),
                esFinal: !!(this._eventoEspecial && this._eventoEspecial.esFinal),
                intensidadBase: (this._eventoEspecial && this._eventoEspecial.intensidadBaseHinchada) || 0.12,
            });
        }
        if (typeof this._initSistemasFaseDPartido === 'function') {
            this._initSistemasFaseDPartido();
        }
        if (!this.enLinea && this.hinchada && typeof this.hinchada.chance === 'function') {
            if ((rivInfo && rivInfo.esClasico) || (this._eventoEspecial && this._eventoEspecial.esEspecial)) {
                this.hinchada.chance(0.88);
            }
        }
        if (
            this._eventoEspecial &&
            this._eventoEspecial.confetiInicial &&
            this.fx &&
            !(this.prefs && this.prefs.reduceMotion)
        ) {
            for (let i = 0; i < 16; i++) {
                this.fx.confetti(50 + Math.random() * (CONFIG.WIDTH - 100), 48 + Math.random() * 26, 1);
            }
        }
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

        // Sin posesión: el compañero más cercano a la pelota. Con posesión: el siguiente (ver GestorPartido).
        const nuevo = this.gestor.siguienteJugadorControlado('local', this.player);
        if (!nuevo || nuevo === this.player) return;

        this.player.isHuman = false;
        this.player.keys = this._keysVacias();

        this.controllableIndex = locals.indexOf(nuevo);
        this.player = nuevo;
        this.player.isHuman = true;
        // No forzar a soltar WASD/Shift: el nuevo controlado hereda lo que sigue apretado.
        this._aplicarTeclasMantenidas(this.player);
    }

    // --------------------------------------------------------
    // LOOP
    // --------------------------------------------------------
    loop(timestamp) {
        if (!this.isRunning) return;
        if (!this.lastTime) this.lastTime = timestamp;
        let delta = timestamp - this.lastTime;
        this.lastTime = timestamp;
        // Un tab en segundo plano dispara un delta enorme. Sin tope, el while
        // simula cientos de cuadros de una y el partido queda congelado.
        if (!(delta > 0)) delta = 0;
        if (delta > 250) delta = 250;
        this.accumulator += delta;
        let steps = 0;
        try {
            while (this.accumulator >= this.frameTime && steps < 5) {
                this.update(this.frameTime / 1000);
                this.accumulator -= this.frameTime;
                steps++;
            }
        } catch (err) {
            console.error('[loop]', err);
        }
        if (this.accumulator > this.frameTime) this.accumulator = 0;
        try { this.render(); } catch (err) { console.error('[render]', err); }
        requestAnimationFrame(t => this.loop(t));
    }

    update(dt) {
        this._woodworkFrame = null;
        this._ligarSonidos();
        this._updateHinchada(dt);
        if (!this.menuVisible && typeof this._updateClima === 'function') {
            this._updateClima(dt);
        }
        this._actualizarBotonesTactiles();
        if (typeof this._enReplayActivo === 'function' && this._enReplayActivo()) {
            this._updateMatchMusic();
            this._updateReplayPlayback(dt);
            return;
        }
        if (typeof this._enPenalesActivo === 'function' && this._enPenalesActivo()) {
            this._updateMatchMusic();
            this._updatePenales(dt);
            return;
        }
        if (this.enLinea) {
            this._updateMatchMusic();
            this._sincronizarRed(dt);
            if (this._netListo) {
                this._cosmeticaEnLinea(dt);
                if (typeof this._updateFaseDEnPartido === 'function') {
                    this._updateFaseDEnPartido(dt, this._woodworkFrame);
                }
                if (typeof this._updateReplayCapture === 'function') this._updateReplayCapture(dt);
            }
            if (this.fx && this._netListo && this.gestor && !this.gestor.pausado) this.fx.update(dt);
            this._updateMatchSfx(dt);
            if (this.gestor && this.gestor.estado === EstadoPartido.FINALIZADO && !this._carreraProcesada) {
                this._procesarCarreraFinPartido();
            }
            if (typeof this._updatePostPartido === 'function') this._updatePostPartido(dt);
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
        const dtSim =
            typeof this._obtenerDtPartidoEfectivo === 'function' ? this._obtenerDtPartidoEfectivo(dt) : dt;
        this.gestor.update(dtSim);
        if (typeof this._updateFaseDEnPartido === 'function') {
            this._updateFaseDEnPartido(dt, this._woodworkFrame);
        }
        if (typeof this._updateReplayCapture === 'function') this._updateReplayCapture(dt);
        this._updateMatchMusic();
        this._updateMatchSfx(dt);

        if (this.gestor.estado === EstadoPartido.FINALIZADO) {
            // Etapa 9 y 10: definición por penales en Copa Chaquito si empató la llave
            if (
                this.modoCopa &&
                !this.modoCopa.penalesResueltos &&
                this.copa &&
                this.copa.copa &&
                typeof this.iniciarTandaPenales === 'function' &&
                CopaCore.requierePenalesTrasResultado(this.copa.copa, this.gestor.golesLocal, this.gestor.golesRival)
            ) {
                if (!this.modoCopa.penalesEnCurso) {
                    this.modoCopa.penalesEnCurso = true;
                    this.iniciarTandaPenales({
                        titulo: `COPA CHAQUITO · ${this.modoCopa.rondaNombre || 'PENALES'}`,
                        onFinish: (resPen) => {
                            this._resultadoPenales = resPen;
                            if (this.modoCopa) this.modoCopa.penalesResueltos = true;
                        },
                    });
                }
                return;
            }

            // Etapa 10 y 11: definición por penales en Supercopa Chaquito si terminó igualada
            if (
                this.modoSupercopa &&
                !this.modoSupercopa.penalesResueltos &&
                typeof this.iniciarTandaPenales === 'function' &&
                this.gestor.golesLocal === this.gestor.golesRival
            ) {
                if (!this.modoSupercopa.penalesEnCurso) {
                    this.modoSupercopa.penalesEnCurso = true;
                    this.iniciarTandaPenales({
                        titulo: 'SUPERCOPA CHAQUITO · PENALES',
                        onFinish: (resPen) => {
                            this._resultadoPenales = resPen;
                            if (this.modoSupercopa) this.modoSupercopa.penalesResueltos = true;
                        },
                    });
                }
                return;
            }

            // Etapa 24: definición por penales en capítulos eliminatorios del Modo Historia
            if (
                this.modoHistoria &&
                this.modoHistoria.definirPorPenalesSiEmpata &&
                !this.modoHistoria.penalesResueltos &&
                typeof this.iniciarTandaPenales === 'function' &&
                this.gestor.golesLocal === this.gestor.golesRival
            ) {
                if (!this.modoHistoria.penalesEnCurso) {
                    this.modoHistoria.penalesEnCurso = true;
                    this.iniciarTandaPenales({
                        titulo: `📖 ${this.modoHistoria.etapa} · PENALES`,
                        onFinish: (resPen) => {
                            this._resultadoPenales = resPen;
                            if (this.modoHistoria) this.modoHistoria.penalesResueltos = true;
                        },
                    });
                }
                return;
            }

            if (this.modoDesafio && !this.modoDesafio.registrado && typeof this._cerrarDesafioAlFinalizar === 'function') {
                this._cerrarDesafioAlFinalizar();
            }
            if (this.modoArcade && !this.modoArcade.registrado && typeof this._cerrarArcadeAlFinalizar === 'function') {
                this._cerrarArcadeAlFinalizar();
            }
            if (this.modoHistoria && !this.modoHistoria.registrado && typeof this._cerrarHistoriaAlFinalizar === 'function') {
                this._cerrarHistoriaAlFinalizar();
            }

            if (this.modoLiga && !this.modoLiga.registrado && this.liga) {
                this.modoLiga.registrado = true;
                const statsSerial = this.gestor.stats ? this.gestor.stats.serializar() : null;
                this._ultimoImpactoLiga = this.liga.registrarJugado(
                    this.gestor.golesLocal,
                    this.gestor.golesRival,
                    statsSerial
                );
            }
            if (this.modoCopa && !this.modoCopa.registrado && this.copa) {
                this.modoCopa.registrado = true;
                this._ultimoResultadoCopa = this.copa.registrarJugado(
                    this.gestor.golesLocal,
                    this.gestor.golesRival,
                    this._resultadoPenales
                );
            }
            if (this.modoSupercopa && !this.modoSupercopa.registrado && this.supercopa) {
                this._ultimoResultadoSupercopa = this.supercopa.registrarJugado(
                    this.gestor.golesLocal,
                    this.gestor.golesRival,
                    this._resultadoPenales
                );
            }
            if (!this._finalEspecialCelebrado) {
                this._finalEspecialCelebrado = true;
                if (typeof this._dispararCelebracionEspecialFinal === 'function') {
                    this._dispararCelebracionEspecialFinal();
                }
            }
            if (!this._carreraProcesada) {
                this._procesarCarreraFinPartido();
            }
            if (!this._rankingAnotado) {
                this._anotarResultadoRanking(this.gestor.cartel);
            }
        }

        if (typeof this._updatePostPartido === 'function') this._updatePostPartido(dt);
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

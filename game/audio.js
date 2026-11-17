import { Game } from '../game.js';
// Game — música, efectos de sonido y cantos de la hinchada.
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    // Tope general de la música: el slider (0-100%) se multiplica por esto, así
    // que incluso el valor por defecto suena suave. Los mp3 vienen masterizados fuertes.
    _MUSIC_MASTER: 0.35,
    _MUSIC_FADE_MS: 2000,

    // Volumen de la música según el slider, sin fundido.
    _volMusica() {
        const v = Number(this.prefs && this.prefs.musicVolume);
        const base = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.10));
        return base * this._MUSIC_MASTER;
    },

    // Arranca un fundido de entrada (de 0 al volumen elegido) para que nunca entre de golpe.
    _iniciarFade() {
        this._fadeStart = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    },

    _factorFade() {
        if (!this._fadeStart) return 1;
        const ahora = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        const t = (ahora - this._fadeStart) / this._MUSIC_FADE_MS;
        return t >= 1 ? 1 : Math.max(0, t * t);   // curva suave: arranca casi mudo
    },

    _volMenu() {
        return Math.max(0, Math.min(1, this._volMusica() * this._factorFade()));
    },

    // Soundtrack del partido: casi mute (o menos si el usuario bajó el slider).
    _volCancha() {
        return Math.min(0.02, this._volMenu());
    },

    // Canto de hinchada: es la canción del partido, audible pero debajo de los efectos.
    _volCanto() {
        if (this._volMusica() <= 0.001) return 0;
        return 0.14;
    },

    _faseMusica() {
        if (this.menuVisible || !this.gestor) return 'menu';
        const e = this.gestor.estado;
        if (e === EstadoPartido.PREPARANDO || e === EstadoPartido.CUENTA_REGRESIVA) return 'prematch';
        if (e === EstadoPartido.EN_JUEGO || e === EstadoPartido.CELEBRANDO_GOL || e === EstadoPartido.FINALIZADO) return 'partido';
        return 'menu';
    },

    _pausarAudio(el) {
        if (!el) return;
        try { el.pause(); } catch (e) { /* ignore */ }
    },

    /** Crea el elemento de soundtrack y descarga SOLO la pista actual. */
    _ensureSoundtrack() {
        if (this.soundtrack || typeof Audio === 'undefined') return this.soundtrack;
        if (!this._musicTracks || !this._musicTracks.length) return null;
        const a = new Audio(this._musicTracks[this._musicIndex || 0]);
        a.loop = false;
        a.preload = 'auto';
        this._iniciarFade();
        a.volume = this._volMenu();
        a.addEventListener('ended', () => this._nextTrack());
        this.soundtrack = a;
        return a;
    },

    /** Canto de hinchada: se descarga recién al entrar al partido. */
    _ensureCanchaAudio() {
        if (this._cancha || typeof Audio === 'undefined') return this._cancha;
        const a = new Audio('assets/hinchada_cancha.mp3');
        a.loop = true;
        a.preload = 'auto';
        a.volume = 0.14;
        a.addEventListener('timeupdate', () => {
            if (this._faseMusica() === 'partido' && a.currentTime < 1.5) {
                try { a.currentTime = 1.74; } catch (e) { /* ignore */ }
            }
        });
        this._cancha = a;
        this._canchaAudioReady = true;
        return a;
    },

    _asegurarSoundtrack(volumen) {
        this._ensureSoundtrack();
        if (!this.soundtrack) return;
        this.soundtrack.muted = false;
        if (this.soundtrack.paused) this._iniciarFade();
        this.soundtrack.volume = Math.min(volumen, this._volMenu());
        if (!this.soundtrack.paused) return;
        const p = this.soundtrack.play();
        if (p && typeof p.then === 'function') {
            p.then(() => { this._soundtrackStarted = true; }).catch(() => {});
        }
    },

    _playSoundtrack() {
        this._unlockAudio();
        if (this.prefs && this.prefs.musicEnabled === false) {
            this._pausarAudio(this.soundtrack);
            this._stopCanto();
            return;
        }
        this._ensureSoundtrack();
        const fase = this._faseMusica();
        if (fase === 'partido') {
            this._asegurarSoundtrack(this._volCancha());
            if (!this._cantoSrc && !(this._cancha && !this._cancha.paused)) this._startCanto();
            return;
        }
        this._stopCanto();
        this._asegurarSoundtrack(fase === 'prematch' ? this._volCancha() : this._volMenu());
    },

    // Al cargar el partido la soundtrack baja al 5%. Al pitazo entra el canto.
    _updateMatchMusic() {
        const fase = this._faseMusica();
        if (fase === this._faseMusicaActual) {
            if (!(this.prefs && this.prefs.musicEnabled === false) && this.soundtrack) {
                if (fase === 'partido' || fase === 'prematch') this.soundtrack.volume = this._volCancha();
                else this.soundtrack.volume = this._volMenu();
            }
            return;
        }
        const anterior = this._faseMusicaActual;
        this._faseMusicaActual = fase;
        const enabled = !(this.prefs && this.prefs.musicEnabled === false);
        if (!enabled) {
            this._pausarAudio(this.soundtrack);
            this._stopCanto();
            return;
        }
        if (fase === 'partido') {
            this._asegurarSoundtrack(this._volCancha());
            this._startCanto();
            return;
        }
        this._stopCanto();
        this._ensureSoundtrack();
        if (!this.soundtrack) return;
        this.soundtrack.volume = fase === 'prematch' ? this._volCancha() : this._volMenu();
        if (this.soundtrack.paused || anterior === 'partido') {
            if (this.soundtrack.paused) this._iniciarFade();
            const p = this.soundtrack.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
    },

    _startCanto() {
        this._stopCanto();
        this._ensureCanchaAudio();
        this._ensureCantoBuffer();
        const vol = this._volCanto();
        const ctx = this._audioCtx;
        const buf = this._cantoBuffer;
        if (ctx && buf) {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.loop = true;
            const offset = Math.min(1.74, Math.max(0, buf.duration - 1));
            src.loopStart = offset;
            src.loopEnd = buf.duration;
            const gain = ctx.createGain();
            gain.gain.value = vol;
            src.connect(gain);
            gain.connect(ctx.destination);
            try { src.start(0, offset); } catch (e) { return; }
            this._cantoSrc = src;
            this._cantoGain = gain;
            this._cantoPendiente = false;
            return;
        }
        this._cantoPendiente = true;
        if (!this._cancha) return;
        try { this._cancha.currentTime = 1.74; } catch (e) { /* ignore */ }
        this._cancha.volume = vol;
        const p = this._cancha.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    },

    _stopCanto() {
        this._cantoPendiente = false;
        if (this._cantoSrc) {
            try { this._cantoSrc.stop(); } catch (e) { /* ignore */ }
            this._cantoSrc = null;
            this._cantoGain = null;
        }
        this._pausarAudio(this._cancha);
    },

    _unlockAudio() {
        const ctx = this._audioCtx;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    _ligarSonidos() {
        if (this.ball) this.ball.onKick = this._kickSfxFn || (this._kickSfxFn = () => this._playSfx('kick'));
        if (this.gestor) this.gestor.onAudio = this._audioFn || (this._audioFn = (k) => this._playSfx(k));
    },

    /** Decodifica el canto de hinchada solo cuando hace falta (partido). */
    _ensureCantoBuffer() {
        const ctx = this._audioCtx;
        if (!ctx || this._cantoBuffer || this._cantoBufferLoading) return;
        this._cantoBufferLoading = true;
        fetch('assets/hinchada_cancha.mp3')
            .then((res) => res.arrayBuffer())
            .then((raw) => ctx.decodeAudioData(raw.slice(0)))
            .then((buf) => {
                this._cantoBuffer = buf;
                this._cantoBufferLoading = false;
                if (this._cantoPendiente && this._faseMusica() === 'partido') this._startCanto();
            })
            .catch(() => {
                this._cantoBuffer = null;
                this._cantoBufferLoading = false;
            });
    },

    _cargarSfx() {
        const ctx = this._audioCtx;
        if (!ctx || this._sfxCargando) return;
        this._sfxCargando = true;
        // Solo SFX chicos al inicio. La música de menú/partido y el canto se cargan bajo demanda.
        const decodificar = (url, recortar) => fetch(url)
            .then((res) => res.arrayBuffer())
            .then((raw) => ctx.decodeAudioData(raw.slice(0)))
            .then((buf) => recortar ? this._recortarAtaque(buf) : buf);
        Promise.all([
            decodificar('assets/sfx/whistle.mp3', true),
            decodificar('assets/sfx/goal.mp3', true),
            Promise.all([
                decodificar('assets/sfx/kick1.mp3', true),
                decodificar('assets/sfx/kick2.mp3', true),
                decodificar('assets/sfx/kick3.mp3', true),
                decodificar('assets/sfx/kick4.mp3', true)
            ])
        ]).then(([whistle, goal, kicks]) => {
            this._sfxBuffers = { whistle, goal, kicks };
        }).catch(() => { this._sfxBuffers = null; });
    },

    // Si el archivo todavía trae aire antes del golpe, lo salta.
    // Un ataque ya pegado al inicio (menos de 12 ms) no se toca.
    _recortarAtaque(buffer) {
        const ctx = this._audioCtx;
        if (!ctx || !buffer) return buffer;
        const rate = buffer.sampleRate;
        const ch0 = buffer.getChannelData(0);
        const win = Math.max(1, Math.floor(rate * 0.004));
        const umbral = 0.02;
        let start = -1;
        for (let i = 0; i + win < ch0.length; i += win) {
            let sum = 0;
            for (let j = 0; j < win; j++) {
                const s = ch0[i + j];
                sum += s * s;
            }
            if (Math.sqrt(sum / win) >= umbral) { start = i; break; }
        }
        if (start < 0) return buffer;
        start = Math.max(0, start - Math.floor(rate * 0.002));
        if (start < rate * 0.008) return buffer;
        const len = ch0.length - start;
        const out = ctx.createBuffer(buffer.numberOfChannels, len, rate);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            out.getChannelData(c).set(buffer.getChannelData(c).subarray(start));
        }
        return out;
    },

    _playBuffer(buffer, volume) {
        const ctx = this._audioCtx;
        if (!ctx || !buffer) return null;
        const fire = () => {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = Math.max(0, Math.min(1, volume));
            src.connect(gain);
            gain.connect(ctx.destination);
            try { src.start(0); } catch (e) { return null; }
            return src;
        };
        if (ctx.state !== 'running') {
            ctx.resume().then(() => { if (ctx.state === 'running') fire(); }).catch(() => {});
            return null;
        }
        return fire();
    },

    // Vibración suave (F8 8.4). Respeta el ajuste y «Reducir animaciones»; no hace nada si el dispositivo no vibra.
    _vibrar(patron) {
        const p = this.prefs || {};
        if (p.vibration === false || p.reduceMotion) return false;
        const nav = typeof navigator !== 'undefined' ? navigator : null;
        if (!nav || typeof nav.vibrate !== 'function') return false;
        const ahora = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (this._vibAt && ahora - this._vibAt < 1500) return false; // un gol puede avisarse por dos caminos
        this._vibAt = ahora;
        try { return !!nav.vibrate(patron); } catch (e) { return false; }
    },

    _playSfx(kind) {
        if (kind === 'goal') this._vibrar([120, 60, 180]);
        if (this.prefs && this.prefs.sfxEnabled === false) return;
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (!this._sfxAt) this._sfxAt = {};
        if (this._sfxAt[kind] && now - this._sfxAt[kind] < 45) return;
        this._sfxAt[kind] = now;
        this._unlockAudio();
        const vol = Math.max(0, Math.min(1, Number(this.prefs && this.prefs.sfxVolume) || 0.85));
        if (this._cantoGain && this._audioCtx && this._faseMusica() === 'partido') {
            const g = this._cantoGain.gain;
            const t = this._audioCtx.currentTime;
            const base = this._volCanto();
            const dip = kind === 'goal' ? 0.22 : (kind === 'whistle' ? 0.35 : 0.62);
            const back = kind === 'goal' ? 1.05 : 0.32;
            try {
                g.cancelScheduledValues(t);
                g.setValueAtTime(Math.max(0.0001, g.value), t);
                g.linearRampToValueAtTime(Math.max(0.0001, base * dip), t + 0.015);
                g.linearRampToValueAtTime(base, t + back);
            } catch (e) { /* ignore */ }
        }
        const bufs = this._sfxBuffers;
        if (bufs && this._audioCtx) {
            let buffer = null;
            if (kind === 'whistle') buffer = bufs.whistle;
            else if (kind === 'goal') buffer = bufs.goal;
            else if (kind === 'kick') {
                const kicks = bufs.kicks;
                if (!kicks || !kicks.length) return;
                this._sfxKickIdx = (this._sfxKickIdx + 1) % kicks.length;
                buffer = kicks[this._sfxKickIdx];
            }
            if (!buffer) return;
            if (kind === 'whistle' || kind === 'goal') {
                const prev = this._sfxNodes[kind];
                if (prev) { try { prev.stop(); } catch (e) { /* ya terminó */ } }
            }
            const node = this._playBuffer(buffer, vol);
            if (node && kind !== 'kick') this._sfxNodes[kind] = node;
            return;
        }
        if (!this._sfx) return;
        let audio = null;
        if (kind === 'whistle') audio = this._sfx.whistle;
        else if (kind === 'goal') audio = this._sfx.goal;
        else if (kind === 'kick') {
            const kicks = this._sfx.kicks;
            if (!kicks || !kicks.length) return;
            this._sfxKickIdx = (this._sfxKickIdx + 1) % kicks.length;
            audio = kicks[this._sfxKickIdx];
        }
        if (!audio) return;
        try {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = vol;
            const p = audio.play();
            if (p && typeof p.then === 'function') p.catch(() => {});
        } catch (e) { /* ignore */ }
    },

    // Respaldo (online y por si el golpe no pasó por Pelota.kick).
    _updateMatchSfx() {
        const g = this.gestor;
        if (!g) {
            this._prevMatchEstado = null;
            this._prevBallOwner = null;
            return;
        }
        const estado = g.estado;
        const prev = this._prevMatchEstado;

        if (estado === EstadoPartido.EN_JUEGO &&
            (prev === EstadoPartido.CUENTA_REGRESIVA || prev === EstadoPartido.CELEBRANDO_GOL)) {
            this._playSfx('whistle');
        }
        if (estado === EstadoPartido.FINALIZADO && prev !== EstadoPartido.FINALIZADO && prev !== null) {
            this._playSfx('whistle');
        }
        if (estado === EstadoPartido.CELEBRANDO_GOL && prev !== EstadoPartido.CELEBRANDO_GOL) {
            this._playSfx('goal');
        }
        if (estado === EstadoPartido.EN_JUEGO && this.ball && this.ball._justKicked) {
            this._playSfx('kick');
        }
        if (this.ball) this.ball._justKicked = false;
        this._prevBallOwner = this.ball ? this.ball.owner : null;
        this._prevMatchEstado = estado;
    },

    _nextTrack() {
        if (!this._musicTracks || !this._musicTracks.length) return;
        if (this._faseMusica() === 'partido') return;
        this._musicIndex = (this._musicIndex + 1) % this._musicTracks.length;
        this._ensureSoundtrack();
        if (!this.soundtrack) return;
        const muted = this.soundtrack.muted;
        this.soundtrack.src = this._musicTracks[this._musicIndex];
        this.soundtrack.loop = false;
        const fase = this._faseMusica();
        this._iniciarFade();
        this.soundtrack.volume = fase === 'prematch' ? this._volCancha() : this._volMenu();
        this.soundtrack.muted = muted;
        this.soundtrack.preload = 'auto';
        this.soundtrack.onended = () => this._nextTrack();
        if (this.prefs && this.prefs.musicEnabled !== false && this._faseMusica() !== 'partido') {
            const result = this.soundtrack.play();
            if (result && typeof result.then === 'function') {
                result.then(() => { this._soundtrackStarted = true; }).catch(() => {});
            }
        }
    },
});

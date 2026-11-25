import { Game } from '../game.js';
import { kitDeJugador } from '../assets/skins.js';
import { aislarClienteParaOnline } from '../career/integracion_online.js';
// Game — partido en línea (socket, estado del servidor, entrada).
// Mixin de Game: se carga después de la clase base y agrega estos métodos a su prototipo.
Object.assign(Game.prototype, {

    // --------------------------------------------------------
    // RED (cliente tonto): no simula. Manda teclas y pinta estado_juego.
    // --------------------------------------------------------
    _urlServidor() {
        if (window.LIGA_SERVIDOR) return window.LIGA_SERVIDOR;
        const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
        if (location.protocol !== 'file:' && !local) return location.origin; // producción (Railway)
        if (location.protocol !== 'file:' && location.port === '3001') return location.origin;
        return 'http://127.0.0.1:3001';
    },

    _estadoRed(texto) {
        this.textoRed = texto || '';
        const el = document.getElementById('estado-red');
        if (el) el.textContent = this.textoRed;
        const sub = document.getElementById('espera-sub');
        if (sub && this.textoRed) sub.textContent = this.textoRed;
    },

    _fmtColaSeg(seg) {
        seg = Math.max(0, Math.floor(Number(seg) || 0));
        const m = Math.floor(seg / 60);
        const s = seg % 60;
        return m + ':' + String(s).padStart(2, '0');
    },

    _actualizarUICola(data) {
        const seg = data && Number.isFinite(data.segundos) ? data.segundos : (this._colaSegLocal || 0);
        const ven = data && Number.isFinite(data.ventana) ? data.ventana : null;
        const pts = data && Number.isFinite(data.pts) ? data.pts : null;
        const pos = data && data.posicion ? data.posicion : null;
        const timer = document.getElementById('espera-timer');
        if (timer) {
            timer.hidden = false;
            timer.textContent = this._fmtColaSeg(seg);
        }
        let msg = 'Buscando rival… ' + this._fmtColaSeg(seg);
        if (pos) msg += ' · puesto ' + pos;
        if (ven != null) msg += ' · ventana ±' + ven + ' pts';
        if (pts != null) msg += ' · tus pts ' + pts;
        this._estadoRed(msg);
    },

    _iniciarTimerCola() {
        this._detenerTimerCola();
        this._colaDesde = Date.now();
        this._colaSegLocal = 0;
        const timer = document.getElementById('espera-timer');
        if (timer) { timer.hidden = false; timer.textContent = '0:00'; }
        this._colaTimer = setInterval(() => {
            if (!this.buscando) { this._detenerTimerCola(); return; }
            this._colaSegLocal = Math.floor((Date.now() - (this._colaDesde || Date.now())) / 1000);
            // Si el servidor manda en_cola, ya actualiza; si no, refrescar con local
            if (!this._colaServerAt || Date.now() - this._colaServerAt > 1500) {
                this._actualizarUICola({ segundos: this._colaSegLocal });
            } else {
                const t = document.getElementById('espera-timer');
                if (t && !t.hidden) t.textContent = this._fmtColaSeg(this._colaSegLocal);
            }
        }, 250);
    },

    _detenerTimerCola() {
        if (this._colaTimer) { clearInterval(this._colaTimer); this._colaTimer = null; }
        this._colaDesde = null;
        this._colaServerAt = null;
        const timer = document.getElementById('espera-timer');
        if (timer) { timer.hidden = true; timer.textContent = ''; }
    },

    _bindEspera() {
        const btn = document.getElementById('espera-cancel');
        if (btn) btn.addEventListener('click', () => this._cancelarBusqueda());
        const invOk = document.getElementById('invitacion-amigo-ok');
        const invNo = document.getElementById('invitacion-amigo-no');
        if (invOk) invOk.addEventListener('click', () => this._aceptarInvitacionAmigo());
        if (invNo) invNo.addEventListener('click', () => this._rechazarInvitacionAmigo());
        const olPub = document.getElementById('ol-public');
        const olCre = document.getElementById('ol-create');
        const olJoin = document.getElementById('ol-join');
        const olBack = document.getElementById('ol-back');
        const olCode = document.getElementById('ol-code');
        if (olPub) olPub.addEventListener('click', () => this._onlineBuscarPublico());
        if (olCre) olCre.addEventListener('click', () => this._onlineCrearPrivada());
        if (olJoin) olJoin.addEventListener('click', () => this._onlineUnirsePrivada());
        if (olBack) olBack.addEventListener('click', () => this._onlineLobbyVolver());
        // Escape: VOLVER en el lobby, CANCELAR en la pantalla de búsqueda.
        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape') return;
            const espera = document.getElementById('espera-rival');
            const lobby = document.getElementById('online-lobby');
            if (espera && !espera.hidden) { e.preventDefault(); this._cancelarBusqueda(); }
            else if (lobby && !lobby.hidden) { e.preventDefault(); this._onlineLobbyVolver(); }
        });
        if (olCode) {
            olCode.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this._onlineUnirsePrivada(); }
            });
            olCode.addEventListener('input', () => {
                olCode.value = olCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            });
        }
    },

    _ocultarEspera() {
        const box = document.getElementById('espera-rival');
        if (box) box.hidden = true;
        const lobby = document.getElementById('online-lobby');
        if (lobby) lobby.hidden = true;
    },

    _pintarEscudoOnline(elId) {
        const eq = this._equipo(this.seleccion.local);
        const esc = document.getElementById(elId);
        if (!esc) return;
        const safeName = (typeof window !== 'undefined' && window.esc) ? window.esc(eq && eq.nombre) : String((eq && eq.nombre) || '').replace(/</g, '&lt;');
        esc.innerHTML = eq
            ? '<img alt="" src="' + this._badgeURL(eq) + '"><p>' + safeName + '</p>'
            : '';
    },

    /** Tras elegir equipo: lobby (público / privada / código). */
    _mostrarLobbyOnline() {
        this.menuVisible = true;
        this.buscando = false;
        this._modoOnlineLobby = true;
        this._codigoPrivado = null;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        this._closeTeamSelect();
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        const espera = document.getElementById('espera-rival');
        if (espera) espera.hidden = true;
        this._pintarEscudoOnline('ol-escudo');
        const sub = document.getElementById('ol-sub');
        if (sub) sub.textContent = 'Elegí cómo encontrar rival';
        const code = document.getElementById('ol-code');
        if (code) code.value = '';
        const lobby = document.getElementById('online-lobby');
        if (lobby) lobby.hidden = false;
        this._estadoRed('');
    },

    _onlineLobbyVolver() {
        this._modoOnlineLobby = false;
        this.buscando = false;
        this._busquedaId = (this._busquedaId || 0) + 1;     // invalida conexiones/búsquedas que todavía estén cargando
        this._detenerTimerCola();
        this._ocultarEspera();
        if (this.socket && this.socket.connected) {
            try { this.socket.emit('cancelar_busqueda'); } catch (e) { /* ignore */ }
            try { this.socket.emit('cancelar_sala_privada'); } catch (e) { /* ignore */ }
        }
        // Volver a selección de equipo en modo online
        if (typeof this._openTeamSelect === 'function') this._openTeamSelect('online');
        else this._showMainMenu();
    },

    _mostrarEsperaRival(opts) {
        opts = opts || {};
        this.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        this._closeTeamSelect();
        const lobby = document.getElementById('online-lobby');
        if (lobby) lobby.hidden = true;
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        this._pintarEscudoOnline('espera-escudo');
        const titulo = document.getElementById('espera-titulo');
        const codigoEl = document.getElementById('espera-codigo');
        if (opts.privada && opts.codigo) {
            if (titulo) titulo.textContent = 'SALA PRIVADA';
            if (codigoEl) {
                codigoEl.hidden = false;
                codigoEl.textContent = opts.codigo;
            }
            const timer = document.getElementById('espera-timer');
            if (timer) timer.hidden = true;
            this._estadoRed(opts.mensaje || ('Código: ' + opts.codigo + ' — esperando rival…'));
        } else {
            if (titulo) titulo.textContent = 'BUSCANDO RIVAL';
            if (codigoEl) { codigoEl.hidden = true; codigoEl.textContent = ''; }
            this._estadoRed(opts.mensaje || 'Buscando rival…');
        }
        const box = document.getElementById('espera-rival');
        if (box) box.hidden = false;
    },

    _cancelarBusqueda() {
        this._busquedaId = (this._busquedaId || 0) + 1;     // si todavía está cargando/conectando, esa búsqueda ya no sigue
        this.buscando = false;
        this._detenerTimerCola();
        if (this.socket && this.socket.connected) {
            try { this.socket.emit('cancelar_busqueda'); } catch (e) { /* ignore */ }
            try { this.socket.emit('cancelar_sala_privada'); } catch (e) { /* ignore */ }
        }
        this._codigoPrivado = null;
        this._salirDeLinea(false);
    },

    _onlineBuscarPublico() {
        this._codigoPrivado = null;
        this._mostrarEsperaRival({ mensaje: 'Buscando rival… 0:00' });
        this._iniciarTimerCola();
        this._jugarEnLinea();
    },

    _onlineCrearPrivada() {
        this.buscando = true;
        this._mostrarEsperaRival({ privada: true, codigo: '·····', mensaje: 'Creando sala…' });
        const id = this._busquedaId = (this._busquedaId || 0) + 1;
        this._cargarSocketIo()
            .then(() => { if (id === this._busquedaId) this._conectarYAccion('crear'); })
            .catch(() => {
                if (id !== this._busquedaId) return;
                this.buscando = false;
                this._estadoRed('No hay servidor. Iniciá node server.js');
            });
    },

    _onlineUnirsePrivada() {
        const input = document.getElementById('ol-code');
        const codigo = (input && input.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (codigo.length < 4 || codigo.length > 6) {
            this._estadoRed('Ingresá un código de 4 a 6 caracteres');
            const sub = document.getElementById('ol-sub');
            if (sub) sub.textContent = 'Código inválido (4–6 caracteres)';
            return;
        }
        this._codigoPrivadoJoin = codigo;
        this.buscando = true;
        this._mostrarEsperaRival({ mensaje: 'Uniéndose a ' + codigo + '…' });
        const id = this._busquedaId = (this._busquedaId || 0) + 1;
        this._cargarSocketIo()
            .then(() => { if (id === this._busquedaId) this._conectarYAccion('unirse'); })
            .catch(() => {
                if (id !== this._busquedaId) return;
                this.buscando = false;
                this._estadoRed('No hay servidor. Iniciá node server.js');
            });
    },

    _cargarSocketIo() {
        if (window.io) return Promise.resolve();
        const base = this._urlServidor().replace(/\/$/, '');
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = base + '/socket.io/socket.io.js';
            s.onload = () => (window.io ? resolve() : reject(new Error('io')));
            s.onerror = () => reject(new Error('socket.io'));
            document.head.appendChild(s);
        });
    },

    _tokenAuth() {
        return (typeof AuthStore !== 'undefined' && AuthStore.tokenActual) ? (AuthStore.tokenActual() || '') : '';
    },

    _emitirBusqueda() {
        if (!this.socket || !this.socket.connected || !this.buscando) return;
        this.socket.emit('buscar_partido', { equipo: this.seleccion.local || '', token: this._tokenAuth() });
    },

    _emitirCrearPrivada() {
        if (!this.socket || !this.socket.connected || !this.buscando) return;
        this.socket.emit('crear_sala_privada', { equipo: this.seleccion.local || '', token: this._tokenAuth() }, (res) => {
            if (res && res.ok && res.codigo) {
                this._codigoPrivado = res.codigo;
                this._mostrarEsperaRival({
                    privada: true,
                    codigo: res.codigo,
                    mensaje: 'Compartí el código y esperá al rival…',
                });
            } else {
                this.buscando = false;
                this._mostrarLobbyOnline();
                this._estadoRed((res && res.error) || 'No se pudo crear la sala');
            }
        });
    },

    _emitirUnirsePrivada() {
        if (!this.socket || !this.socket.connected || !this.buscando) return;
        const codigo = this._codigoPrivadoJoin || '';
        this.socket.emit('unirse_sala_privada', {
            codigo,
            equipo: this.seleccion.local || '',
            token: this._tokenAuth(),
        }, (res) => {
            if (!res || !res.ok) {
                this.buscando = false;
                this._mostrarLobbyOnline();
                const msg = (res && res.error) || 'No se pudo unir a la sala';
                this._estadoRed(msg);
                const sub = document.getElementById('ol-sub');
                if (sub) sub.textContent = msg;
            }
            // Si ok, llega partido_listo por el canal normal.
        });
    },

    _dispararAccionOnline() {
        const a = this._onlineAccion || 'buscar';
        if (a === 'crear') this._emitirCrearPrivada();
        else if (a === 'unirse') this._emitirUnirsePrivada();
        else this._emitirBusqueda();
    },

    _jugarEnLinea() {
        this.buscando = true;
        this._onlineAccion = 'buscar';
        this._estadoRed('Buscando rival...');
        const id = this._busquedaId = (this._busquedaId || 0) + 1;
        this._cargarSocketIo()
            .then(() => { if (id === this._busquedaId) this._conectarYAccion('buscar'); })
            .catch(() => {
                if (id !== this._busquedaId) return;
                this.buscando = false;
                this._estadoRed('No hay servidor. Iniciá node server.js');
            });
    },

    _conectarYAccion(accion) {
        this._onlineAccion = accion || 'buscar';
        if (!this.buscando && accion !== 'buscar') {
            // crear/unirse ya setean buscando
        }
        if (!this.buscando) return;
        if (!window.io) {
            this.buscando = false;
            this._estadoRed('No hay servidor. Iniciá node server.js');
            return;
        }
        if (this.socket && this.socket.connected) {
            this._dispararAccionOnline();
            return;
        }
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }
        this.socket = window.io(this._urlServidor(), {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 8,
            reconnectionDelay: 500,
        });
        this.socket.on('connect', () => {
            this.miId = this.socket.id;
            // Presencia para amigos (estado en línea / invitaciones)
            const tok = this._tokenAuth ? this._tokenAuth() : '';
            if (tok) this.socket.emit('presencia_hello', { token: tok });
            // Si se cortó a mitad de partido, intentamos volver con el token de sesión.
            if (this._reconnectToken && this.enLinea) {
                this._intentarReconexionPartido();
                return;
            }
            if (this.buscando) this._dispararAccionOnline();
        });
        this.socket.on('servidor_info', (data) => {
            if (data && data.version) this._manejarVersionServidor(data.version);
        });
        this.socket.on('invitacion_partida', (data) => {
            this._mostrarInvitacionAmigo(data);
        });
                this.socket.on('sala_privada_creada', (data) => {
            if (data && data.codigo) {
                this._codigoPrivado = data.codigo;
                this.buscando = true;
                this._mostrarEsperaRival({
                    privada: true,
                    codigo: data.codigo,
                    mensaje: 'Compartí el código y esperá al rival…',
                });
            }
        });
        this.socket.on('busqueda_rechazada', (data) => {
            this.buscando = false;
            if (this._detenerTimerCola) this._detenerTimerCola();
            const msg = (data && data.error) || 'No se pudo buscar partido';
            this._estadoRed(msg);
            // Volver al lobby online si existe
            if (typeof this._mostrarLobbyOnline === 'function') {
                try { this._mostrarLobbyOnline(); } catch (e) { /* ignore */ }
            }
            const sub = document.getElementById('ol-sub');
            if (sub) sub.textContent = msg;
        });
        this.socket.on('en_cola', (data) => {
            this.buscando = true;
            if (data && data.privada && data.codigo) {
                this._detenerTimerCola();
                this._codigoPrivado = data.codigo;
                this._mostrarEsperaRival({
                    privada: true,
                    codigo: data.codigo,
                    mensaje: 'Compartí el código y esperá al rival…',
                });
            } else {
                this._colaServerAt = Date.now();
                if (!this._colaTimer) this._iniciarTimerCola();
                if (data && Number.isFinite(data.segundos)) {
                    this._colaSegLocal = data.segundos;
                    // Alinear reloj local al servidor
                    this._colaDesde = Date.now() - data.segundos * 1000;
                }
                this._actualizarUICola(data || {});
            }
        });
        this.socket.on('partido_listo', (data) => this._entrarPartido(data));
        this.socket.on('estado_juego', (data) => {
            // No se dibuja directo: se encola y update() lo interpola (ver net/netsync.js).
            if (this.enLinea && this._netBuf) this._netBuf.push(data, performance.now());
        });
        this.socket.on('gol_partido', (data) => {
            if (this.enLinea && data && data.gol && typeof this._actualizarMetaUltimoGolReplay === 'function') {
                this._actualizarMetaUltimoGolReplay(data.gol);
            }
        });
        this.socket.on('resumen_partido', (data) => {
            if (!this.enLinea || !data || !data.stats) return;
            this._ultimoResumenOnline = data.stats;
            if (typeof this._refrescarPostPartidoOnline === 'function') this._refrescarPostPartidoOnline();
        });
        this._iniciarPingRed();
        this.socket.on('ranking_actualizado', () => {
            if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) RankingStore.sincronizar();
        });
        this.socket.on('rival_reconectando', (data) => {
            const seg = (data && data.segundos) || 15;
            this._estadoRed((data && data.mensaje) || ('Rival reconectando… (' + seg + 's)'));
            this._rivalReconectando = true;
            if (this._rivalReconnTimer) clearInterval(this._rivalReconnTimer);
            let left = seg;
            this._rivalReconnTimer = setInterval(() => {
                left -= 1;
                if (left <= 0) {
                    clearInterval(this._rivalReconnTimer);
                    this._rivalReconnTimer = null;
                    return;
                }
                if (this._rivalReconectando) this._estadoRed('Rival reconectando… (' + left + 's)');
            }, 1000);
        });
        this.socket.on('rival_reconectado', (data) => {
            this._rivalReconectando = false;
            if (this._rivalReconnTimer) { clearInterval(this._rivalReconnTimer); this._rivalReconnTimer = null; }
            this._estadoRed((data && data.mensaje) || 'Rival reconectado');
            setTimeout(() => { if (!this._rivalReconectando) this._estadoRed(''); }, 1500);
        });
        this.socket.on('victoria_abandono', (data) => {
            this._rivalReconectando = false;
            this._estadoRed((data && data.mensaje) || 'Victoria por abandono (3-0)');
            if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) RankingStore.sincronizar();
        });
        this.socket.on('revancha_estado', (data) => {
            if (!this.enLinea) return;
            this._revanchaEstado = data || null;
            const msg = this._textoRevanchaEstado(data);
            if (msg) this._estadoRed(msg);
            if (typeof this._refrescarPostPartidoOnline === 'function') this._refrescarPostPartidoOnline();
        });
        this.socket.on('revancha_resultado', (data) => {
            if (!this.enLinea) return;
            if (data && data.ok) {
                this._estadoRed('¡Revancha! Cambiando de lado…');
                return;
            }
            const motivo = data && data.motivo;
            let msg = 'Revancha cancelada';
            if (motivo === 'rechazo') msg = 'El rival no quiso la revancha';
            else if (motivo === 'timeout') msg = 'Se acabó el tiempo para la revancha';
            else if (motivo === 'desconexion') msg = 'El rival se desconectó';
            this._estadoRed(msg);
            if (typeof this._refrescarPostPartidoOnline === 'function') this._refrescarPostPartidoOnline();
            // Si yo no rechacé explícitamente desde el menú, volvemos al menú al cerrar la sala
            // (sala_destruida también llega).
        });
        this.socket.on('sala_destruida', (data) => {
            this.enLinea = false;
            this.buscando = false;
            this._netListo = false;
            this._reconnectToken = null;
            this._rivalReconectando = false;
            if (this._rivalReconnTimer) { clearInterval(this._rivalReconnTimer); this._rivalReconnTimer = null; }
            const motivo = data && data.motivo;
            let msg = 'El rival se desconectó';
            if (motivo === 'abandono_rival' || motivo === 'abandono_voluntario') msg = 'Partido terminado por abandono';
            else if (motivo === 'ambos_desconectados') msg = 'Partido cancelado';
            this._showMainMenu();
            this._estadoRed(msg);
        });
        this.socket.on('disconnect', (reason) => {
            // Socket.IO puede reconectar solo; guardamos el token y mostramos aviso.
            if (this.enLinea && this._reconnectToken && reason !== 'io client disconnect') {
                this._estadoRed('Conexión perdida. Reconectando…');
            }
        });
        this.socket.on('connect_error', () => {
            if (!this.enLinea) {
                this.buscando = false;
                this._estadoRed('No se pudo conectar al servidor');
            }
        });
    },

    _intentarReconexionPartido() {
        if (!this.socket || !this._reconnectToken) return;
        this._estadoRed('Reconectando al partido…');
        this.socket.emit('reconectar_partido', { token: this._reconnectToken }, (res) => {
            if (res && res.ok) {
                this._estadoRed('Reconectado');
                setTimeout(() => this._estadoRed(''), 1200);
            } else {
                this.enLinea = false;
                this._reconnectToken = null;
                this._showMainMenu();
                this._estadoRed((res && res.error) ? ('No se pudo reconectar: ' + res.error) : 'No se pudo reconectar');
            }
        });
    },

    // Cada update (60 Hz): toma el snapshot interpolado, lo aplica y adelanta al jugador propio con tus teclas.
    _sincronizarRed(dt) {
        if (!this._netBuf) return;
        const ahora = performance.now();
        const snap = this._netBuf.sample(ahora);
        if (!snap) return;
        this._aplicarEstadoJuego(snap);
        this._predecirPropio(dt, ahora);
    },

    _predecirPropio(dt, ahora) {
        const yo = this.player;
        const pred = this._netPred;
        if (!yo || !pred) return;
        const g = this.gestor;
        const mi = (this.socket && this.socket.id) || this.miId;
        const ult = this._netBuf.ultimo();
        const j = ult && Array.isArray(ult.jugadores) ? ult.jugadores.find(q => q.id && q.id === mi) : null;
        const k = this.teclas || {};
        const usado = pred.actualizar(yo, {
            keys: { up: !!k.w, down: !!k.s, left: !!k.a, right: !!k.d, shift: !!k.shift },
            dt,
            activo: !!g && g.estado === EstadoPartido.EN_JUEGO,
            servidor: j ? { x: j.x, y: j.y, vx: j.vx || 0, vy: j.vy || 0 } : null,
            edadMs: ahora - this._netBuf.ultimaRecepcion,
            rttMs: this._rttMs || 0,
            crearSombra: (p) => new Jugador(p.pos.x, p.pos.y, { team: p.team, isHuman: true, mobilityId: p.mobilityId }),
        });
        // Mientras llevo la pelota, la pelota acompaña al jugador predicho (si no, se vería atrasada).
        if (this.ball && (usado || pred.dx || pred.dy)) {
            const o = pred.offsetPelota();
            this.ball.pos.x += o.x;
            this.ball.pos.y += o.y;
        }
    },

    // Mide la latencia de ida y vuelta cada 2 s (la usa la predicción para comparar contra el servidor).
    _iniciarPingRed() {
        if (this._pingTimer) clearInterval(this._pingTimer);
        if (this._rttMs == null) this._rttMs = 0;
        this._pingTimer = setInterval(() => {
            if (!this.socket || !this.socket.connected) return;
            const t0 = performance.now();
            this.socket.emit('ping_rtt', t0, () => {
                const rtt = performance.now() - t0;
                this._rttMs = this._rttMs ? this._rttMs * 0.7 + rtt * 0.3 : rtt;
                this._rttMsLast = rtt;
                this._actualizarHudPing();
            });
        }, 2000);
    },

    _pingColor() {
        const ms = this._rttMs || 0;
        if (ms <= 0) return '#aab6c9';
        if (ms < 80) return '#5fd35f';
        if (ms < 150) return '#ffcc00';
        return '#ff6b5e';
    },

    _pingEtiqueta() {
        const ms = Math.round(this._rttMs || 0);
        if (ms <= 0) return '…';
        if (ms >= 250) return ms + ' ms · MALO';
        if (ms >= 150) return ms + ' ms · alto';
        return ms + ' ms';
    },

    _actualizarHudPing() {
        const el = document.getElementById('hud-ping');
        if (!el) return;
        if (!this.enLinea || !this.socket || !this.socket.connected) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        el.textContent = 'PING ' + this._pingEtiqueta();
        el.style.color = this._pingColor();
        const malo = (this._rttMs || 0) >= 150;
        el.classList.toggle('ping-malo', malo);
        el.classList.toggle('ping-critico', (this._rttMs || 0) >= 250);
    },

    _manejarVersionServidor(ver) {
        if (!ver || typeof ver !== 'string') return;
        const v = ver.trim().slice(0, 32);
        if (!v) return;
        if (!this._versionServidor) {
            this._versionServidor = v;
            try { sessionStorage.setItem('liga_chaquito_ver', v); } catch (e) { /* ignore */ }
            return;
        }
        if (v !== this._versionServidor) {
            this._versionNueva = v;
            this._mostrarAvisoVersion(v);
        }
    },

    _mostrarAvisoVersion(ver) {
        const box = document.getElementById('aviso-version');
        if (!box) return;
        const txt = document.getElementById('aviso-version-txt');
        if (txt) txt.textContent = 'Hay una versión nueva del juego (' + ver + '). Recargá para actualizar.';
        box.hidden = false;
    },

    _iniciarChequeoVersion() {
        if (this._verTimer) return;
        const url = (this._urlServidor() || '').replace(/\/$/, '') + '/api/version';
        const tick = () => {
            fetch(url, { cache: 'no-store' })
                .then((r) => r.json())
                .then((j) => { if (j && j.version) this._manejarVersionServidor(j.version); })
                .catch(() => {});
        };
        // Primera lectura al rato de cargar; luego cada 60 s
        setTimeout(tick, 3000);
        this._verTimer = setInterval(tick, 60000);
    },

    _pedirRevancha(aceptar) {
        if (!this.socket || !this.socket.connected || !this.enLinea) return;
        this._revanchaVoto = !!aceptar;
        if (aceptar) {
            this._estadoRed('Revancha pedida — esperando al rival…');
        }
        this.socket.emit('revancha', { aceptar: !!aceptar }, (res) => {
            if (!res || !res.ok) {
                if (aceptar) this._estadoRed((res && res.error) || 'No se pudo pedir revancha');
                return;
            }
            if (res.resultado === 'pendiente' && aceptar) {
                this._estadoRed('Revancha pedida — esperando al rival…');
            }
        });
    },

    _textoRevanchaEstado(data) {
        if (!data) return '';
        const yoLocal = this.rolEnLinea === 'Local';
        const miVoto = yoLocal ? data.local : data.visitante;
        const suVoto = yoLocal ? data.visitante : data.local;
        const seg = Number.isFinite(data.segundos) ? data.segundos : null;
        if (miVoto === true && suVoto == null) {
            return 'Revancha pedida — esperando al rival' + (seg != null ? ' (' + seg + 's)' : '…');
        }
        if (miVoto == null && suVoto === true) {
            return 'El rival quiere revancha' + (seg != null ? ' (' + seg + 's)' : '') + ' — aceptá o volvé al menú';
        }
        if (miVoto === true && suVoto === true) {
            return '¡Revancha aceptada! Preparando partido…';
        }
        if (miVoto === false || suVoto === false) {
            return 'Revancha rechazada';
        }
        return '¿Revancha?' + (seg != null ? ' (' + seg + 's)' : '');
    },

    _entrarPartido(data) {
        const entrar = () => this._entrarPartidoGo(data);
        if (typeof this._ensureMatchAssets === 'function') this._ensureMatchAssets(entrar);
        else entrar();
    },

    _entrarPartidoGo(data) {
        aislarClienteParaOnline(this);
        setTimeout(() => this._actualizarHudPing && this._actualizarHudPing(), 100);
        this._detenerTimerCola();
        if (typeof this._enReplayActivo === 'function' && this._enReplayActivo()) this._cerrarReplayActivo();
        if (typeof this._resetPostPartido === 'function') this._resetPostPartido();
        if (typeof this._initReplaySystem === 'function') this._initReplaySystem();
        this.buscando = false;
        this.enLinea = true;
        this._revanchaVoto = null;
        this._revanchaEstado = null;
        this._menuOnline = false;
        this._rankingAnotado = false;
        this._rivalReconectando = false;
        this.rolEnLinea = data && data.rol;
        this.nombresOnline = (data && data.nombres) || null;
        // Identificador de sesión para volver si se corta la red.
        this._reconnectToken = (data && data.reconnectToken) || this._reconnectToken || null;
        this.miId = (data && (data.rol === 'Visitante' ? data.visitanteId : data.localId)) || (this.socket && this.socket.id) || '';
        // Equipos del enfrentamiento (pantalla de carga con VS)
        if (data && data.equipos) {
            if (data.equipos.local) this.seleccion.local = data.equipos.local;
            if (data.equipos.visitante) this.seleccion.rival = data.equipos.visitante;
        }
        this.menuVisible = false;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        this._ocultarEspera();
        this._estadoRed('');
        this._playSoundtrack();
        this.teclas = { w: false, a: false, s: false, d: false, espacio: false, tiro: false, barrer: false, shift: false, e: false, r: false, q: false };
        this._inputDirty = false;
        // Partido nuevo y limpio: así los efectos (fx) y el gestor arrancan igual que en offline.
        this._vistas.clear();
        this._netListo = false;
        this._netBuf = new NetSync.SnapshotBuffer();
        this._netPred = new NetSync.OwnPredictor();
        this.ball = new Pelota(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
        this.players = [];
        this.player = null;
        this.gestor = new GestorPartido(this.ball, this.players, {
            equipoLocalId: (this.seleccion && this.seleccion.local) || '',
            equipoRivalId: (this.seleccion && this.seleccion.rival) || '',
        });
        this._faseMusicaActual = '';
        this._updateMatchMusic();
    },

    _salirDeLinea(buscarOtra) {
        const estabaEnPartido = this.enLinea && this._reconnectToken;
        const hp = document.getElementById('hud-ping');
        if (hp) hp.hidden = true;
        this._detenerTimerCola();
        this._busquedaId = (this._busquedaId || 0) + 1;
        this.enLinea = false;
        this._menuOnline = false;
        this.buscando = false;
        this._netListo = false;
        this._rivalReconectando = false;
        if (this._rivalReconnTimer) { clearInterval(this._rivalReconnTimer); this._rivalReconnTimer = null; }
        this._vistas.clear();
        if (this.socket) {
            // Salida voluntaria: el rival gana 3-0 (no hay ventana de reconexión).
            if (estabaEnPartido && this.socket.connected) {
                try { this.socket.emit('abandonar_partido'); } catch (e) { /* ignore */ }
            }
            if (this.socket.connected) {
                try { this.socket.emit('cancelar_sala_privada'); } catch (e) { /* ignore */ }
            }
            this._reconnectToken = null;
            this._codigoPrivado = null;
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
        } else {
            this._reconnectToken = null;
            this._codigoPrivado = null;
        }
        this._estadoRed('');
        if (buscarOtra) this._mostrarLobbyOnline();
        else this._showMainMenu();
    },

    _emitirInput() {
        if (!this.socket || !this.socket.connected || !this.enLinea) return;
        this.socket.emit('input', this.teclas);
    },

    _teclaEnLinea(code, down) {
        const map = {
            KeyW: 'w', ArrowUp: 'w',
            KeyS: 's', ArrowDown: 's',
            KeyA: 'a', ArrowLeft: 'a',
            KeyD: 'd', ArrowRight: 'd',
            ShiftLeft: 'shift', ShiftRight: 'shift',
            Space: 'espacio',
            Tiro: 'tiro',        // botón táctil TIRO: solo tira
            Barrer: 'barrer',    // botón táctil BARRER: solo barre
            KeyE: 'e',
            KeyR: 'r',
            KeyQ: 'q'
        };
        const campo = map[code];
        if (!campo) return false;
        if (this._menuOnline && down) return true;   // con el menú abierto no se juega
        this.teclas[campo] = down;
        this._inputDirty = true;
        this._emitirInput();
        return true;
    },

    // El servidor corre la MISMA simulación que el modo offline (arqueros, resistencia,
    // IA, colisiones, cuenta regresiva…). Acá solo se refleja ese estado en los mismos
    // objetos Jugador / Pelota / GestorPartido que usa el offline, para que el dibujo,
    // los efectos (fx) y la hinchada se vean exactamente igual.
    _aplicarEstadoJuego(data) {
        if (!data || !data.pelota || !Array.isArray(data.jugadores)) return;
        this._netListo = true;
        if (!this.ball) this.ball = new Pelota(data.pelota.x, data.pelota.y);
        this.ball.pos.set(data.pelota.x, data.pelota.y);
        this.ball.vel.set(data.pelota.vx || 0, data.pelota.vy || 0);
        const zNueva = data.pelota.z || 0;
        if ((this.ball.z || 0) > 3 && zNueva < 0.5) this.ball.bounceFrame = true;   // pique: polvo (fx.js)
        this.ball.z = zNueva;

        const estados = EstadoPartido;
        const estado = estados[data.estado] || estados.EN_JUEGO;
        const congelado = estado !== estados.EN_JUEGO;
        const mi = (this.socket && this.socket.id) || this.miId;

        const lista = [];
        let dueno = null;
        data.jugadores.forEach((j, i) => {
            const clave = 'p' + i;   // el orden del servidor es fijo: la clave no cambia al cambiar de jugador
            const rival = j.rol === 'Visitante';
            let p = this._vistas.get(clave);
            if (!p) {
                const idMov = (rival ? 'rival_' : 'local_') + (j.gk ? 'gk' : (i % 4));
                p = new Jugador(j.x, j.y, { team: rival ? 'rival' : 'local', isGK: !!j.gk, isHuman: false, mobilityId: idMov });
                this._vistas.set(clave, p);
            }
            p.id = j.id || '';
            p.team = rival ? 'rival' : 'local';
            p.isGK = !!j.gk;
            p.isHuman = !!(p.id && p.id === mi);   // solo el jugador propio muestra su barra de resistencia
            p.pos.set(j.x, j.y);
            p.vel.set(j.vx || 0, j.vy || 0);
            p.facing.set(j.dirX || 0, j.dirY || (rival ? 1 : -1));
            p.hasBall = !!j.tienePelota;
            p.isSliding = !!j.deslizando;
            p.sprinting = !!j.sprint;
            p.slideTimer = j.sl || 0;
            p.kickTimer = j.kt || 0;
            p.headTimer = j.ht || 0;
            p.hitStun = j.hs || 0;
            p.hitSlow = j.hw || 0;
            p.hitFlash = j.hf || 0;
            p.hitSquash = j.hq || 0;
            p.shotCharging = !!j.cg;
            p.shotCharge = j.cc || 0;
            p.stamina = j.st === undefined ? CONFIG.STAMINA_MAX : j.st;
            if (p.isGK) {
                p.gkAction = j.ga || 'stand';
                p.gkActionTimer = j.gt || 0;
                p.gkDiveDir = j.gd || 0;
            }
            p.frozen = congelado;
            const eqId = rival
                ? (data.equipos && data.equipos.visitante)
                : (data.equipos && data.equipos.local);
            const eq = this._equipo(eqId);
            if (eq && !p.isGK) { p.kitName = kitDeJugador(eq.kit, p.mobilityId); p.kitEquipo = eq.kit; }   // los arqueros conservan su camiseta (igual que offline)
            if (p.hasBall) dueno = p;
            lista.push(p);
        });
        this.players = lista;
        this.ball.owner = dueno;
        // En online el servidor no marca _justKicked: lo inferimos del kickTimer de algún jugador
        const anyKick = lista.some(p => (p.kickTimer || 0) > 0.05);
        if (anyKick && !this._prevAnyKick) this.ball._justKicked = true;
        this._prevAnyKick = anyKick;
        this.player = lista.find(p => p.id && p.id === mi) || null;
        if (data.nombres) this.nombresOnline = data.nombres;
        if (data.equipos) {
            if (data.equipos.local) this.seleccion.local = data.equipos.local;
            if (data.equipos.visitante) this.seleccion.rival = data.equipos.visitante;
        }

        if (!this.gestor) this.gestor = new GestorPartido(this.ball, this.players);
        const g = this.gestor;
        g.ball = this.ball;
        g.players = this.players;
        const antes = g.estado;
        g.golesLocal = data.marcador ? data.marcador.local : 0;
        g.golesRival = data.marcador ? data.marcador.visitante : 0;
        g.framesRestantes = Math.max(0, data.segundos || 0) * CONFIG.TARGET_FPS;
        g.prematchTimer = data.prematch || 0;
        g.countdownNumber = data.cuenta || 0;
        g.timerFestejo = data.festejo || 0;
        g.estado = estado;
        g.pausado = false;
        if (estado === estados.CELEBRANDO_GOL && antes !== estados.CELEBRANDO_GOL) {
            g.cartel = 'GOL';
            g.cartelAlpha = 0;
            g.cartelScale = 0.4;
            if (typeof this._registrarGolEnReplay === 'function') {
                this._registrarGolEnReplay({
                    indice: this._golesReplayDisponibles ? this._golesReplayDisponibles().length : 0,
                    marcadorLocal: g.golesLocal,
                    marcadorRival: g.golesRival,
                });
            }
        } else if (estado === estados.FINALIZADO && antes !== estados.FINALIZADO) {
            const mios = this.rolEnLinea === 'Visitante' ? g.golesRival : g.golesLocal;
            const suyos = this.rolEnLinea === 'Visitante' ? g.golesLocal : g.golesRival;
            g.cartel = mios > suyos ? 'VICTORIA' : (mios < suyos ? 'DERROTA' : 'EMPATE');
            g.cartelAlpha = 0;
            g.cartelScale = 0.5;
            g.endMenuSelection = 0;
            this._menuOnline = false;
            this._anotarResultadoRanking(g.cartel);
        } else if (estado === estados.EN_JUEGO || estado === estados.PREPARANDO || estado === estados.CUENTA_REGRESIVA) {
            g.cartel = null;
        }
    },

    // Parte visual que en offline corre dentro de Jugador.update / GestorPartido.update
    // (animación de piernas, aparición del cartel). Misma lógica, sin tocar la simulación.
    _cosmeticaEnLinea(dt) {
        for (const p of this.players || []) {
            if (p.frozen) {
                p.moving = false;
                p.sprinting = false;
                p.animFrame = 0;
                p.animClock += dt;
            } else {
                p._updateAnimation(dt);
            }
        }
        const g = this.gestor;
        if (!g) return;
        if (g.estado === EstadoPartido.CELEBRANDO_GOL) {
            if (g.cartelAlpha < 1) g.cartelAlpha = Math.min(1, g.cartelAlpha + dt * 3);
            if (g.cartelScale < 1) g.cartelScale = Math.min(1, g.cartelScale + dt * 2.2);
        } else if (g.estado === EstadoPartido.FINALIZADO) {
            if (g.cartelAlpha < 1) g.cartelAlpha = Math.min(1, g.cartelAlpha + dt * 1.8);
            if (g.cartelScale < 1.05) g.cartelScale = Math.min(1.05, g.cartelScale + dt * 1.2);
        }
    },

    _esMiJugador(p) {
        if (!this.enLinea) return !!p.isHuman;
        const id = (this.socket && this.socket.id) || this.miId;
        return !!(id && p.id && p.id === id);
    },
});

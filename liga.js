/**
 * Liga Chaquito F8 - MODO LIGA (solo offline).
 *
 * Todos contra todos. El jugador juega SOLO sus partidos con el motor del juego; cuando termina
 * el suyo (o tiene fecha libre, si la cantidad de equipos es impar), el resto de la fecha se simula
 * con un resultado aleatorio según las estrellas de cada equipo.
 *
 *   LigaCore    -> lógica pura (fixture, simulación, tabla). No toca el DOM, se puede probar con node.
 *   LigaStore   -> guardado en localStorage (liga actual + torneos guardados).
 *   LigaModo    -> pantalla (tabla, fechas, resultados) y enganche con Game (game.js).
 */

// ============================================================
// LÓGICA
// ============================================================
export const LigaCore = (() => {
    const VERSION = 1;
    const BASE_GOLES = 1.25;         // goles esperados por equipo en un partido parejo (90s)
    const MAX_GOLES = 6;
    const HOME_ADVANTAGE = 1.14;     // ventaja de local en simulaciones

    // ------------------------------------------------------------------
    // SISTEMA DE ESTRELLAS (1 a 5)
    // Cada equipo tiene estrellas en EQUIPOS[].estrellas.
    // La fuerza, ataque y defensa se derivan de forma matemática y se
    // combinan con forma del día + ventaja de local para simular resultados
    // variados y creíbles (no deterministas).
    // ------------------------------------------------------------------
    function clampEstrellas(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return 3;
        return Math.max(1, Math.min(5, Math.round(v)));
    }

    /** Perfil ofensivo/defensivo a partir de estrellas (1..5). */
    function perfilDesdeEstrellas(estrellas) {
        const e = clampEstrellas(estrellas);
        // Curva suave: 1★ ~0.62 fuerza, 3★ ~0.94, 5★ ~1.22
        const fuerza = 0.50 + e * 0.144;           // 0.644 .. 1.22
        const ataque = 0.72 + e * 0.095;           // 0.815 .. 1.195
        const defensa = 0.78 + e * 0.080;          // 0.860 .. 1.180
        return { estrellas: e, fuerza, ataque, defensa };
    }

    /** Lee estrellas de EQUIPOS global; fallback 3. */
    function estrellasDeEquipo(id) {
        if (typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS)) {
            const t = EQUIPOS.find(eq => eq.id === id);
            if (t && t.estrellas != null) return clampEstrellas(t.estrellas);
        }
        return 3;
    }

    function barajar(arr) {
        const r = arr.slice();
        for (let i = r.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
    }

    // Método del círculo. Si hay cantidad impar, se agrega un hueco (fecha libre):
    // cada fecha un equipo descansa y el resto juega. Con cantidad par, nadie descansa.
    function fixtureIda(ids) {
        const arr0 = ids.slice();
        if (arr0.length % 2 === 1) arr0.push(null);
        const n = arr0.length;
        let arr = arr0.slice();
        const fechas = [];
        for (let r = 0; r < n - 1; r++) {
            const pairs = [];
            let libre = null;
            for (let i = 0; i < n / 2; i++) {
                const a = arr[i], b = arr[n - 1 - i];
                if (a == null || b == null) {
                    libre = a == null ? b : a;
                    continue;
                }
                const invertir = i === 0 ? (r % 2 === 1) : ((i + r) % 2 === 1);   // reparte localías
                pairs.push(invertir ? [b, a] : [a, b]);
            }
            fechas.push({ libre, pairs });
            arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
        }
        return fechas;
    }

    function empaquetarFecha(fecha) {
        return {
            libre: fecha.libre || null,
            partidos: fecha.pairs.map(([l, v]) => ({ l, v, gl: null, gv: null }))
        };
    }

    function espejarFecha(fecha) {
        return {
            libre: fecha.libre || null,
            partidos: (fecha.partidos || []).map(m => ({ l: m.v, v: m.l, gl: null, gv: null }))
        };
    }

    // Compatibilidad: ligas viejas guardan cada fecha como array de partidos.
    function partidosDe(fecha) {
        if (!fecha) return [];
        return Array.isArray(fecha) ? fecha : (fecha.partidos || []);
    }
    function libreDe(fecha) {
        if (!fecha || Array.isArray(fecha)) return null;
        return fecha.libre || null;
    }

    function crear({ ids, miEquipo, dificultad, formato }) {
        if (ids.length < 2) throw new Error('La liga necesita al menos 2 equipos');
        if (ids.indexOf(miEquipo) < 0) throw new Error('Equipo inválido');
        const ida = barajar(fixtureIda(barajar(ids))).map(empaquetarFecha);
        const rondas = formato === 'idayvuelta'
            ? ida.concat(ida.map(espejarFecha))
            : ida;
        // Fuerza derivada del sistema de estrellas (estable entre partidas de la misma liga)
        const fuerza = {};
        const estrellas = {};
        ids.forEach(id => {
            const perfil = perfilDesdeEstrellas(estrellasDeEquipo(id));
            estrellas[id] = perfil.estrellas;
            fuerza[id] = perfil.fuerza;
        });
        const ahora = Date.now();
        return {
            v: VERSION,
            id: 'liga_' + ahora.toString(36) + Math.random().toString(36).slice(2, 6),
            creada: ahora,
            actualizada: ahora,
            equipos: ids.slice(),
            miEquipo,
            dificultad: dificultad || 'normal',
            formato: formato === 'idayvuelta' ? 'idayvuelta' : 'ida',
            fuerza,
            estrellas,
            fixture: rondas,
            fechaActual: 0
        };
    }

    function poisson(lambda) {
        const L = Math.exp(-Math.max(0.05, lambda));
        let k = 0, p = 1;
        do { k++; p *= Math.random(); } while (p > L);
        return Math.min(MAX_GOLES, k - 1);
    }

    /**
     * Simulación de partido automático.
     * Usa ataque/defensa derivados de estrellas + forma del día (ruido) + ventaja local.
     * Resultados variados: un 5★ no gana siempre a un 2★; hay upsets posibles.
     */
    function simularPartido(liga, m) {
        const el = perfilDesdeEstrellas(
            (liga.estrellas && liga.estrellas[m.l]) || estrellasDeEquipo(m.l)
        );
        const ev = perfilDesdeEstrellas(
            (liga.estrellas && liga.estrellas[m.v]) || estrellasDeEquipo(m.v)
        );

        // Forma del día: variación aleatoria ±14 % por equipo
        const formL = 0.86 + Math.random() * 0.28;
        const formV = 0.86 + Math.random() * 0.28;

        // Lambda de goles esperados (Poisson)
        let lambdaL = BASE_GOLES * (el.ataque / Math.max(0.55, ev.defensa)) * HOME_ADVANTAGE * formL;
        let lambdaV = BASE_GOLES * (ev.ataque / Math.max(0.55, el.defensa)) * formV;

        // Suavizado extra según diferencia de fuerza global (evita 5-0 demasiado frecuentes)
        const ratio = el.fuerza / Math.max(0.4, ev.fuerza);
        if (ratio > 1.35) lambdaL *= 1.08;
        else if (ratio < 0.74) lambdaV *= 1.08;

        m.gl = poisson(lambdaL);
        m.gv = poisson(lambdaV);
    }

    function jugado(m) { return !!m && !m.libre && m.gl !== null && m.gv !== null && m.gl !== undefined && m.gv !== undefined; }
    function terminada(liga) { return liga.fechaActual >= liga.fixture.length; }

    function partidoUsuario(liga, fecha) {
        const f = liga.fixture[fecha];
        if (!f) return null;
        if (libreDe(f) === liga.miEquipo) return { libre: true, id: liga.miEquipo };
        return partidosDe(f).find(m => m.l === liga.miEquipo || m.v === liga.miEquipo) || null;
    }

    // Simula lo que falte de la fecha actual (la fecha libre no se simula) y pasa a la siguiente.
    function cerrarFecha(liga) {
        const f = liga.fixture[liga.fechaActual];
        if (!f) return;
        for (const m of partidosDe(f)) if (!jugado(m)) simularPartido(liga, m);
        liga.fechaActual++;
        liga.actualizada = Date.now();
    }

    function tabla(liga) {
        const t = {};
        liga.equipos.forEach(id => { t[id] = { id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 }; });
        for (const f of liga.fixture) for (const m of partidosDe(f)) {
            if (!jugado(m) || !t[m.l] || !t[m.v]) continue;
            const a = t[m.l], b = t[m.v];
            a.pj++; b.pj++;
            a.gf += m.gl; a.gc += m.gv;
            b.gf += m.gv; b.gc += m.gl;
            if (m.gl > m.gv) { a.g++; b.p++; a.pts += 3; }
            else if (m.gl < m.gv) { b.g++; a.p++; b.pts += 3; }
            else { a.e++; b.e++; a.pts++; b.pts++; }
        }
        const filas = Object.values(t);
        filas.forEach(r => { r.dg = r.gf - r.gc; });
        filas.sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || x.id.localeCompare(y.id));
        return filas;
    }

    function valida(liga, idsValidos) {
        try {
            if (!liga || liga.v !== VERSION || !Array.isArray(liga.fixture) || !Array.isArray(liga.equipos)) return false;
            if (!liga.equipos.every(id => idsValidos.indexOf(id) >= 0)) return false;
            if (liga.equipos.indexOf(liga.miEquipo) < 0) return false;
            if (typeof liga.fechaActual !== 'number') return false;
            return liga.fixture.every(f => Array.isArray(f) || (f && Array.isArray(f.partidos)));
        } catch (e) { return false; }
    }

    return {
        crear, fixtureIda, simularPartido, cerrarFecha, tabla, partidoUsuario,
        terminada, jugado, valida, poisson,
        partidosDe, libreDe,
        // Sistema de estrellas (API pública para UI / tests)
        perfilDesdeEstrellas, estrellasDeEquipo, clampEstrellas
    };
})();

// ============================================================
// GUARDADO (localStorage; si no está disponible, la liga igual funciona mientras la página esté abierta)
// ============================================================
export const LigaStore = (() => {
    const K_ACTUAL = 'chaquito_liga_actual_v1';
    const K_LISTA = 'chaquito_liga_guardados_v1';
    const MAX_GUARDADOS = 8;
    const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
    const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

    return {
        actual: () => leer(K_ACTUAL),
        guardarActual: liga => escribir(K_ACTUAL, liga),
        lista: () => { const l = leer(K_LISTA); return Array.isArray(l) ? l : []; },
        // Guarda (o actualiza) un torneo en la lista de "guardados". Devuelve false si no hay lugar o falla.
        guardar(liga) {
            const l = LigaStore.lista().filter(x => x && x.id !== liga.id);
            l.unshift(liga);
            return escribir(K_LISTA, l.slice(0, MAX_GUARDADOS));
        },
        borrar(id) { return escribir(K_LISTA, LigaStore.lista().filter(x => x && x.id !== id)); },
        existe: id => LigaStore.lista().some(x => x && x.id === id)
    };
})();

// ============================================================
// PANTALLA
// ============================================================
export class LigaModo {
    constructor(game) {
        this.game = game;
        this.liga = null;
        this.tab = 'tabla';
        this.fechaVista = 0;
        this.aviso = '';
        this._avisoTimer = null;
        this.root = document.getElementById('liga-screen');
        if (this.root) {
            this.root.addEventListener('click', e => this._onClick(e));
            window.addEventListener('keydown', e => {
                if (e.code === 'Escape' && this.visible()) { e.preventDefault(); this.volverAlMenu(); }
            });
        }
    }

    visible() { return !!this.root && !this.root.hidden; }
    ocultar() { if (this.root) this.root.hidden = true; }

    _ids() { return EQUIPOS.map(e => e.id); }
    _eq(id) { return this.game._equipo(id) || { id, nombre: id, corto: id, siglas: '??', colores: ['#444', '#222'] }; }
    _esc(s) {
        if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _dif(id) {
        return (typeof DIFICULTADES !== 'undefined' && DIFICULTADES[id]) ? DIFICULTADES[id].nombre : String(id).toUpperCase();
    }

    // ---------------- diálogos del menú principal ----------------
    _dialogo(html, enlaces) {
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        content.innerHTML = html;
        dialog.classList.add('open');
        const cerrar = () => dialog.classList.remove('open');
        for (const id in enlaces) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => enlaces[id](cerrar));
        }
        return cerrar;
    }

    abrirMenu() {
        const g = this.game;
        const idsOk = this._ids();
        let actual = LigaStore.actual();
        if (!LigaCore.valida(actual, idsOk)) actual = null;
        const guardados = LigaStore.lista().filter(l => LigaCore.valida(l, idsOk));

        let html = '<h2>LIGA OFFLINE</h2><p>Jugás solo tus partidos. El resto de cada fecha se simula.</p>';
        if (actual) {
            html += '<button type="button" class="action-btn" id="lg-cont">CONTINUAR LIGA</button>'
                + '<p class="lg-mini">' + this._esc(this._eq(actual.miEquipo).nombre) + ' · '
                + this._progreso(actual) + '</p>';
        }
        html += '<button type="button" class="action-btn' + (actual ? ' secondary' : '') + '" id="lg-nueva">NUEVA LIGA</button>';
        if (actual) html += '<p class="lg-mini">Una liga nueva reemplaza a la actual. Guardala antes si querés conservarla.</p>';
        if (guardados.length) html += '<button type="button" class="action-btn secondary" id="lg-guardados">TORNEOS GUARDADOS (' + guardados.length + ')</button>';
        html += '<button type="button" class="action-btn secondary" id="dialog-close">VOLVER</button>';

        this._dialogo(html, {
            'lg-cont': cerrar => { cerrar(); this.liga = actual; this._abrirPantalla(); },
            'lg-nueva': () => this._elegirFormato(),
            'lg-guardados': () => this._listaGuardados(),
            'dialog-close': cerrar => cerrar()
        });
    }

    _progreso(liga) {
        const total = liga.fixture.length;
        return LigaCore.terminada(liga) ? 'Terminada' : 'Fecha ' + (liga.fechaActual + 1) + ' de ' + total;
    }

    _elegirFormato() {
        const nEquipos = this._ids().length;
        const fechasIda = nEquipos % 2 === 0 ? nEquipos - 1 : nEquipos;
        const avisoLibre = nEquipos % 2 === 1
            ? '<p class="lg-mini">Hay ' + nEquipos + ' equipos: cada fecha uno descansa (fecha libre).</p>'
            : '';
        this._dialogo(
            '<h2>FORMATO DE LA LIGA</h2>'
            + '<p>Cada partido dura 1:30.</p>'
            + avisoLibre
            + '<button type="button" class="action-btn" id="lg-ida">SOLO IDA · ' + fechasIda + ' FECHAS</button>'
            + '<button type="button" class="action-btn secondary" id="lg-iv">IDA Y VUELTA · ' + (fechasIda * 2) + ' FECHAS</button>'
            + '<button type="button" class="action-btn secondary" id="lg-atras">VOLVER</button>',
            {
                'lg-ida': cerrar => { cerrar(); this._elegirEquipo('ida'); },
                'lg-iv': cerrar => { cerrar(); this._elegirEquipo('idayvuelta'); },
                'lg-atras': () => this.abrirMenu()
            });
    }

    _elegirEquipo(formato) {
        this.game._formatoLiga = formato;
        this.game._openTeamSelect('liga');
    }

    // Lo llama Game._pickDificultad cuando se está armando una liga.
    crearNueva(miEquipo, dificultad) {
        this.liga = LigaCore.crear({
            ids: this._ids(), miEquipo, dificultad, formato: this.game._formatoLiga || 'ida'
        });
        LigaStore.guardarActual(this.liga);
        this.tab = 'tabla';
        this.aviso = '';
        this._abrirPantalla();
    }

    _listaGuardados() {
        const idsOk = this._ids();
        const lista = LigaStore.lista().filter(l => LigaCore.valida(l, idsOk));
        const filas = lista.map(l => {
            const fecha = new Date(l.actualizada || l.creada).toLocaleDateString('es-AR');
            return '<div class="lg-saved">'
                + '<div class="lg-saved-info"><b>' + this._esc(this._eq(l.miEquipo).nombre) + '</b>'
                + '<span>' + (l.formato === 'idayvuelta' ? 'Ida y vuelta' : 'Solo ida') + ' · ' + this._progreso(l) + ' · ' + fecha + '</span></div>'
                + '<button type="button" class="lg-mini-btn" data-cargar="' + l.id + '">CARGAR</button>'
                + '<button type="button" class="lg-mini-btn borrar" data-borrar="' + l.id + '">BORRAR</button></div>';
        }).join('');
        const cerrar = this._dialogo(
            '<h2>TORNEOS GUARDADOS</h2>' + (filas || '<p>No hay torneos guardados.</p>')
            + '<button type="button" class="action-btn secondary" id="lg-atras">VOLVER</button>',
            { 'lg-atras': () => this.abrirMenu() });
        const content = document.getElementById('dialog-content');
        content.querySelectorAll('[data-cargar]').forEach(b => b.addEventListener('click', () => {
            const l = lista.find(x => x.id === b.dataset.cargar);
            if (!l) return;
            cerrar();
            this.liga = JSON.parse(JSON.stringify(l));
            LigaStore.guardarActual(this.liga);
            this.aviso = 'Torneo cargado';
            this._abrirPantalla();
        }));
        content.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', () => {
            LigaStore.borrar(b.dataset.borrar);
            this._listaGuardados();
        }));
    }

    // ---------------- pantalla de la liga ----------------
    _abrirPantalla() {
        const L = this.liga;
        this.fechaVista = Math.min(L.fechaActual, L.fixture.length - 1);
        this.tab = LigaCore.terminada(L) ? 'tabla' : this.tab;
        this.mostrar();
    }

    mostrar() {
        const g = this.game;
        g.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        this.root.hidden = false;
        this.render();
        this.root.scrollTop = 0;
        if (this.aviso) this._mostrarAviso(this.aviso);
    }

    _mostrarAviso(texto) {
        this.aviso = '';
        const el = this.root.querySelector('.lg-toast');
        if (!el) return;
        el.textContent = texto;
        el.classList.add('on');
        clearTimeout(this._avisoTimer);
        this._avisoTimer = setTimeout(() => el.classList.remove('on'), 2600);
    }

    _badge(id, cls) {
        return '<img class="' + (cls || 'lg-badge') + '" alt="" src="' + this.game._badgeURL(this._eq(id)) + '">';
    }

    render() {
        const L = this.liga;
        if (!L || !this.root) return;
        const total = L.fixture.length;
        const fin = LigaCore.terminada(L);
        const sub = fin
            ? 'LIGA TERMINADA'
            : 'FECHA ' + (L.fechaActual + 1) + ' DE ' + total;

        let h = '<div class="lg-wrap"><div class="lg-toast" role="status"></div>'
            + '<h2 class="lg-title">LIGA CHAQUITO F8</h2>'
            + '<p class="lg-sub">' + sub + ' · DIFICULTAD ' + this._dif(L.dificultad) + ' · ' + (L.formato === 'idayvuelta' ? 'IDA Y VUELTA' : 'SOLO IDA') + '</p>';

        h += fin ? this._tarjetaFinal() : this._tarjetaProximo();

        h += '<div class="lg-tabs" role="tablist">'
            + '<button type="button" role="tab" data-act="tab-tabla" class="' + (this.tab === 'tabla' ? 'on' : '') + '">TABLA</button>'
            + '<button type="button" role="tab" data-act="tab-fechas" class="' + (this.tab === 'fechas' ? 'on' : '') + '">FECHAS</button></div>';

        h += this.tab === 'tabla' ? this._htmlTabla() : this._htmlFechas();

        h += '<div class="lg-actions">'
            + '<button type="button" class="action-btn" data-act="guardar">GUARDAR TORNEO</button>'
            + '<button type="button" class="action-btn secondary" data-act="nueva">NUEVA LIGA</button>'
            + '<button type="button" class="action-btn secondary" data-act="menu">MENÚ PRINCIPAL</button></div></div>';
        this.root.innerHTML = h;
    }

    _tarjetaProximo() {
        const L = this.liga;
        const m = LigaCore.partidoUsuario(L, L.fechaActual);
        if (!m || m.libre) {
            const quien = LigaCore.libreDe(L.fixture[L.fechaActual]);
            const nombre = quien ? this._esc(this._eq(quien).corto) : 'Tu equipo';
            return '<div class="lg-next">'
                + '<div class="lg-next-label">FECHA LIBRE</div>'
                + '<p>' + nombre + ' descansa esta fecha. El resto de los partidos se simula.</p>'
                + '<button type="button" class="action-btn" data-act="pasar-libre">CONTINUAR</button></div>';
        }
        const rival = m.l === L.miEquipo ? m.v : m.l;
        return '<div class="lg-next">'
            + '<div class="lg-next-label">TU PRÓXIMO PARTIDO</div>'
            + '<div class="lg-vs">'
            + '<span class="lg-vs-t">' + this._badge(m.l, 'lg-badge big') + '<b>' + this._esc(this._eq(m.l).corto) + '</b></span>'
            + '<span class="lg-vs-x">VS</span>'
            + '<span class="lg-vs-t">' + this._badge(m.v, 'lg-badge big') + '<b>' + this._esc(this._eq(m.v).corto) + '</b></span></div>'
            + '<button type="button" class="action-btn" data-act="jugar">JUGAR PARTIDO</button>'
            + '<button type="button" class="action-btn secondary" data-act="simular" title="Simula el resultado contra ' + this._esc(this._eq(rival).nombre) + '">SIMULAR ESTE PARTIDO</button></div>';
    }

    _tarjetaFinal() {
        const L = this.liga;
        const t = LigaCore.tabla(L);
        const pos = t.findIndex(r => r.id === L.miEquipo) + 1;
        const campeon = this._eq(t[0].id);
        const titulo = pos === 1 ? '🏆 ¡SOS EL CAMPEÓN!' : 'TERMINASTE ' + pos + '°';
        const detalle = pos === 1
            ? this._esc(this._eq(L.miEquipo).nombre) + ' ganó la liga con ' + t[0].pts + ' puntos.'
            : 'Campeón: ' + this._esc(campeon.nombre) + ' con ' + t[0].pts + ' puntos.';
        return '<div class="lg-next lg-final"><div class="lg-final-t">' + titulo + '</div><p>' + detalle + '</p></div>';
    }

    _htmlTabla() {
        const L = this.liga;
        const t = LigaCore.tabla(L);
        let h = '<div class="lg-scroll"><table class="lg-table"><thead><tr><th>#</th><th class="l">EQUIPO</th>'
            + '<th>PJ</th><th>G</th><th>E</th><th>P</th><th class="x">GF</th><th class="x">GC</th><th>DG</th><th>PTS</th></tr></thead><tbody>';
        t.forEach((r, i) => {
            const eq = this._eq(r.id);
            const cls = (r.id === L.miEquipo ? 'mio ' : '') + (i === 0 ? 'lider' : '');
            h += '<tr class="' + cls + '"><td>' + (i + 1) + '</td>'
                + '<td class="l">' + this._badge(r.id) + '<span>' + this._esc(eq.corto) + '</span></td>'
                + '<td>' + r.pj + '</td><td>' + r.g + '</td><td>' + r.e + '</td><td>' + r.p + '</td>'
                + '<td class="x">' + r.gf + '</td><td class="x">' + r.gc + '</td>'
                + '<td>' + (r.dg > 0 ? '+' : '') + r.dg + '</td><td class="pts">' + r.pts + '</td></tr>';
        });
        return h + '</tbody></table></div>';
    }

    _htmlFechas() {
        const L = this.liga;
        const total = L.fixture.length;
        const f = L.fixture[this.fechaVista];
        const partidos = LigaCore.partidosDe(f);
        const libre = LigaCore.libreDe(f);
        let estado = '';
        if (this.fechaVista < L.fechaActual) estado = 'JUGADA';
        else if (this.fechaVista === L.fechaActual && !LigaCore.terminada(L)) estado = 'PRÓXIMA';
        else estado = 'PENDIENTE';
        let h = '<div class="lg-fnav">'
            + '<button type="button" data-act="fecha-prev"' + (this.fechaVista <= 0 ? ' disabled' : '') + ' aria-label="Fecha anterior">◀</button>'
            + '<div><b>FECHA ' + (this.fechaVista + 1) + '</b><span>' + estado + ' · ' + (this.fechaVista + 1) + '/' + total + '</span></div>'
            + '<button type="button" data-act="fecha-next"' + (this.fechaVista >= total - 1 ? ' disabled' : '') + ' aria-label="Fecha siguiente">▶</button></div>';
        h += '<div class="lg-matches">';
        for (const m of partidos) {
            const mio = m.l === L.miEquipo || m.v === L.miEquipo;
            const marc = LigaCore.jugado(m) ? '<b>' + m.gl + '</b><i>-</i><b>' + m.gv + '</b>' : '<em>vs</em>';
            h += '<div class="lg-m' + (mio ? ' mio' : '') + '">'
                + '<span class="lg-m-t izq"><span>' + this._esc(this._eq(m.l).corto) + '</span>' + this._badge(m.l) + '</span>'
                + '<span class="lg-m-sc">' + marc + '</span>'
                + '<span class="lg-m-t der">' + this._badge(m.v) + '<span>' + this._esc(this._eq(m.v).corto) + '</span></span></div>';
        }
        if (libre) {
            const mio = libre === L.miEquipo;
            h += '<div class="lg-m lg-libre' + (mio ? ' mio' : '') + '">FECHA LIBRE · ' + this._esc(this._eq(libre).corto) + ' descansa</div>';
        }
        return h + '</div>';
    }

    // ---------------- acciones ----------------
    _onClick(e) {
        const b = e.target.closest('[data-act]');
        if (!b || b.disabled) return;
        const L = this.liga;
        switch (b.dataset.act) {
            case 'tab-tabla': this.tab = 'tabla'; this.render(); break;
            case 'tab-fechas': this.tab = 'fechas'; this.render(); break;
            case 'fecha-prev': this.fechaVista = Math.max(0, this.fechaVista - 1); this.render(); break;
            case 'fecha-next': this.fechaVista = Math.min(L.fixture.length - 1, this.fechaVista + 1); this.render(); break;
            case 'jugar': this.jugarPartidoActual(); break;
            case 'simular': this.simularPartidoActual(); break;
            case 'pasar-libre': this.pasarFechaLibre(); break;
            case 'guardar': this.guardarTorneo(); break;
            case 'nueva': this.volverAlMenu(); this.abrirMenu(); break;
            case 'menu': this.volverAlMenu(); break;
        }
    }

    volverAlMenu() {
        this.ocultar();
        this.game._showMainMenu();
    }

    jugarPartidoActual() {
        const L = this.liga, g = this.game;
        const m = LigaCore.partidoUsuario(L, L.fechaActual);
        if (!m || m.libre || LigaCore.jugado(m)) return;
        const rival = m.l === L.miEquipo ? m.v : m.l;
        g.seleccion.local = L.miEquipo;
        g.seleccion.rival = rival;
        g.seleccion.dificultad = L.dificultad;
        g.modoLiga = { fecha: L.fechaActual, registrado: false };
        this.ocultar();
        g._startMatchFromMenu();
    }

    // Lo llama Game.update cuando termina el partido de la liga (goles propios y del rival).
    registrarJugado(golesMios, golesRival) {
        const L = this.liga;
        if (!L) return;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || m.libre || LigaCore.jugado(m)) return;
        const local = m.l === L.miEquipo;
        m.gl = local ? golesMios : golesRival;
        m.gv = local ? golesRival : golesMios;
        this._cerrarFecha(fecha, 'Fecha ' + (fecha + 1) + ' jugada. Se simularon los demás partidos.');
    }

    simularPartidoActual() {
        const L = this.liga;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || m.libre || LigaCore.jugado(m)) return;
        LigaCore.simularPartido(L, m);
        this._cerrarFecha(fecha, 'Fecha ' + (fecha + 1) + ' simulada.');
        this.render();
        if (this.aviso) this._mostrarAviso(this.aviso);
    }

    pasarFechaLibre() {
        const L = this.liga;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || !m.libre) return;
        this._cerrarFecha(fecha, 'Fecha libre. Se simularon los demás partidos.');
        this.render();
        if (this.aviso) this._mostrarAviso(this.aviso);
    }

    _cerrarFecha(fecha, aviso) {
        const L = this.liga;
        LigaCore.cerrarFecha(L);
        const ok = LigaStore.guardarActual(L);
        this.tab = LigaCore.terminada(L) ? 'tabla' : 'fechas';
        this.fechaVista = fecha;
        this.aviso = ok ? aviso : aviso + ' (No se pudo guardar en este navegador)';
    }

    guardarTorneo() {
        const L = this.liga;
        LigaStore.guardarActual(L);
        const ok = LigaStore.guardar(L);
        this._mostrarAviso(ok ? 'Torneo guardado ✓' : 'No se pudo guardar el torneo en este navegador');
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.LigaCore = LigaCore;
    globalThis.LigaStore = LigaStore;
    globalThis.LigaModo = LigaModo;
}

/**
 * Liga Chaquito F8 - SOCIAL (menú principal).
 *
 * Panel con 4 pestañas dentro de #menu-dialog / #dialog-content:
 *   RANKING  -> top 10 (RankingStore), resalta tu fila y a tus amigos
 *   PERFIL   -> tu cuenta (AuthStore) + estadísticas + rango + compartir
 *   AMIGOS   -> lista local de amigos, agregar / quitar, invitar a jugar
 *   PARTIDOS -> historial del servidor (AuthStore.cargarPartidos)
 *
 * No agrega backend: usa /api/ranking y /api/partidos ya existentes
 * a través de RankingStore y AuthStore. Los amigos viven en localStorage.
 *
 *   SocialStore -> amigos + invitaciones (?invita=Nombre)
 *   SocialUI    -> render / bind / open
 *
 * Se engancha solo al botón #social-hit (no hace falta tocar game.js).
 */
'use strict';

const SocialStore = (() => {
    const KEY_BASE = 'chaquito_amigos_v1';
    const KEY_INV = 'chaquito_invitacion_v1';
    const VERSION = 1;
    const MAX_AMIGOS = 30;

    /** Clave por cuenta: cada jugador guarda su propia lista de amigos. */
    function claveLocal() {
        const me = yo();
        if (me && me.nombre) return KEY_BASE + '_' + String(me.nombre).toLowerCase().replace(/\s+/g, '_');
        return KEY_BASE + '_anon';
    }

    function leer() {
        try {
            const raw = localStorage.getItem(claveLocal());
            const data = raw ? JSON.parse(raw) : null;
            if (data && data.v === VERSION && Array.isArray(data.amigos)) return data;
            // migración: si hay lista global antigua y estoy logueado, la heredo una vez
            const me = yo();
            if (me) {
                const legacy = localStorage.getItem(KEY_BASE);
                if (legacy) {
                    try {
                        const old = JSON.parse(legacy);
                        if (old && Array.isArray(old.amigos) && old.amigos.length) {
                            const migrado = { v: VERSION, amigos: old.amigos.slice(0, MAX_AMIGOS) };
                            localStorage.setItem(claveLocal(), JSON.stringify(migrado));
                            return migrado;
                        }
                    } catch (e2) { /* ignore */ }
                }
            }
        } catch (e) { /* corrupto: se reinicia */ }
        return { v: VERSION, amigos: [] };
    }

    function escribir(data) {
        try {
            localStorage.setItem(claveLocal(), JSON.stringify(data));
            programarSyncRemoto();
            return true;
        } catch (e) {
            return false;
        }
    }

    function normalizar(n) {
        if (typeof AuthStore !== 'undefined' && AuthStore.normalizarNombre) return AuthStore.normalizarNombre(n);
        return String(n || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    }

    function yo() {
        return (typeof AuthStore !== 'undefined' && AuthStore.current) ? AuthStore.current() : null;
    }

    function amigos() {
        return leer().amigos.slice();
    }

    function esAmigo(nombre) {
        const k = normalizar(nombre).toLowerCase();
        return !!k && leer().amigos.some(a => a.nombre.toLowerCase() === k);
    }

    /** Sube la lista de amigos al servidor (asociada a la cuenta logueada). */
    let _syncTimer = null;
    function programarSyncRemoto() {
        if (_syncTimer) clearTimeout(_syncTimer);
        _syncTimer = setTimeout(() => { sincronizarRemoto().catch(() => null); }, 400);
    }

    async function sincronizarRemoto() {
        const me = yo();
        if (!me || !me.remoto) return { ok: false, error: 'Sin sesión remota.' };
        if (typeof AuthStore === 'undefined' || !AuthStore.apiBase || !AuthStore.tokenActual) return { ok: false };
        const token = AuthStore.tokenActual();
        if (!token) return { ok: false };
        const lista = leer().amigos.map(a => ({ nombre: a.nombre, desde: a.desde || Date.now() }));
        try {
            const r = await fetch(AuthStore.apiBase() + '/api/amigos', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ amigos: lista })
            });
            if (!r.ok) return { ok: false };
            return { ok: true };
        } catch (e) {
            return { ok: false, error: String(e && e.message || e) };
        }
    }

    /** Baja amigos del servidor y los fusiona con la lista local (no borra locales). */
    async function restaurarRemoto() {
        const me = yo();
        if (!me || !me.remoto) return { ok: false };
        if (typeof AuthStore === 'undefined' || !AuthStore.apiBase || !AuthStore.tokenActual) return { ok: false };
        const token = AuthStore.tokenActual();
        if (!token) return { ok: false };
        try {
            const r = await fetch(AuthStore.apiBase() + '/api/amigos', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!r.ok) return { ok: false };
            const body = await r.json();
            if (!body || !body.ok || !Array.isArray(body.amigos)) return { ok: false };
            const data = leer();
            const seen = new Set(data.amigos.map(a => a.nombre.toLowerCase()));
            for (const a of body.amigos) {
                const n = normalizar(a && a.nombre);
                if (!n || n.length < 3) continue;
                if (me.nombre && me.nombre.toLowerCase() === n.toLowerCase()) continue;
                if (seen.has(n.toLowerCase())) continue;
                if (data.amigos.length >= MAX_AMIGOS) break;
                data.amigos.push({ nombre: n, desde: a.desde || Date.now() });
                seen.add(n.toLowerCase());
            }
            // guardar sin re-disparar sync inmediato innecesario
            try { localStorage.setItem(claveLocal(), JSON.stringify(data)); } catch (e) { return { ok: false }; }
            return { ok: true, amigos: data.amigos.slice() };
        } catch (e) {
            return { ok: false };
        }
    }

    function agregar(nombre) {
        const n = normalizar(nombre);
        if (n.length < 3) return { ok: false, error: 'El nombre tiene que tener al menos 3 letras.' };
        const me = yo();
        if (me && me.nombre.toLowerCase() === n.toLowerCase()) return { ok: false, error: 'No te podés agregar a vos mismo.' };
        const data = leer();
        if (data.amigos.some(a => a.nombre.toLowerCase() === n.toLowerCase())) return { ok: false, error: n + ' ya es tu amigo.' };
        if (data.amigos.length >= MAX_AMIGOS) return { ok: false, error: 'Máximo ' + MAX_AMIGOS + ' amigos.' };
        data.amigos.push({ nombre: n, desde: Date.now() });
        if (!escribir(data)) return { ok: false, error: 'No se pudo guardar en este dispositivo.' };
        return { ok: true, nombre: n };
    }

    function quitar(nombre) {
        const k = normalizar(nombre).toLowerCase();
        const data = leer();
        data.amigos = data.amigos.filter(a => a.nombre.toLowerCase() !== k);
        return escribir(data);
    }

    /** Link para invitar: misma URL del juego con ?invita=TuNombre */
    function linkInvitacion() {
        if (typeof location === 'undefined') return '';
        const me = yo();
        const base = location.origin && location.origin !== 'null'
            ? location.origin + location.pathname
            : location.href.split('?')[0];
        return me ? base + '?invita=' + encodeURIComponent(me.nombre) : base;
    }

    /** Lee ?invita=Nombre al cargar y lo deja pendiente para mostrarlo en SOCIAL. */
    function capturarInvitacion() {
        if (typeof location === 'undefined' || typeof URLSearchParams === 'undefined') return;
        try {
            const n = normalizar(new URLSearchParams(location.search).get('invita') || '');
            if (n.length >= 3) localStorage.setItem(KEY_INV, n);
        } catch (e) { /* ignore */ }
    }

    function invitacionPendiente() {
        try {
            const n = localStorage.getItem(KEY_INV) || '';
            if (!n) return '';
            const me = yo();
            if (esAmigo(n) || (me && me.nombre.toLowerCase() === n.toLowerCase())) {
                localStorage.removeItem(KEY_INV);
                return '';
            }
            return n;
        } catch (e) {
            return '';
        }
    }

    function descartarInvitacion() {
        try { localStorage.removeItem(KEY_INV); } catch (e) { /* ignore */ }
    }

    return {
        MAX_AMIGOS, amigos, esAmigo, agregar, quitar, yo,
        linkInvitacion, capturarInvitacion, invitacionPendiente, descartarInvitacion,
        sincronizarRemoto, restaurarRemoto
    };
})();

// ============================================================
// UI
// ============================================================
const SocialUI = (() => {
    const TABS = [
        { id: 'ranking', label: 'RANKING' },
        { id: 'perfil', label: 'PERFIL' },
        { id: 'amigos', label: 'AMIGOS' },
        { id: 'partidos', label: 'PARTIDOS' }
    ];
    let tab = 'ranking';
    let soloAmigos = false;
    /** @type {Record<string, 'online'|'ocupado'|'offline'>} */
    let presenciaCache = Object.create(null);
    let presenciaTimer = null;

    // esc() compartida: utils_ui.js → window.esc
    const esc = (typeof window !== 'undefined' && window.esc) ? window.esc : function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    function jugadores() {
        return (typeof RankingStore !== 'undefined' && RankingStore.lista) ? RankingStore.lista() : [];
    }

    /** Ranking completo ordenado con posición (no solo el top 10). */
    function tablaCompleta() {
        if (typeof RankingCore === 'undefined') return [];
        const l = jugadores();
        return RankingCore.topN(l, l.length || 1);
    }

    function buscar(nombre) {
        const k = String(nombre || '').toLowerCase();
        return tablaCompleta().find(j => j.nombre.toLowerCase() === k) || null;
    }

    /** Rango por puntos (insignia pixel). */
    function rango(pts) {
        if (pts >= 90) return { id: 'leyenda', label: 'LEYENDA' };
        if (pts >= 50) return { id: 'oro', label: 'ORO' };
        if (pts >= 20) return { id: 'plata', label: 'PLATA' };
        return { id: 'bronce', label: 'BRONCE' };
    }

    function inicial(nombre) {
        return esc(String(nombre || '?').trim().charAt(0).toUpperCase() || '?');
    }

    // ---------------- pestañas ----------------
    function renderRanking() {
        const me = SocialStore.yo();
        const todos = tablaCompleta();
        let filas = todos.slice(0, (typeof RankingCore !== 'undefined' ? RankingCore.TOP : 10));
        if (soloAmigos) {
            filas = todos.filter(j => SocialStore.esAmigo(j.nombre) || (me && j.nombre.toLowerCase() === me.nombre.toLowerCase()));
        }

        let h = '<div class="sc-filter" role="group" aria-label="Filtro">';
        h += '<button type="button" class="sc-chip' + (soloAmigos ? '' : ' on') + '" data-filtro="todos">TOP 10</button>';
        h += '<button type="button" class="sc-chip' + (soloAmigos ? ' on' : '') + '" data-filtro="amigos">AMIGOS</button>';
        h += '</div>';

        if (!filas.length) {
            h += '<div class="sc-empty">';
            h += '<p class="sc-empty-t">' + (soloAmigos ? 'SIN AMIGOS EN EL RANKING' : 'TODAVÍA NO HAY JUGADORES') + '</p>';
            h += '<p>' + (soloAmigos
                ? 'Agregá amigos desde la tabla (+) o en la pestaña AMIGOS.'
                : 'Registrate en Configuración. Victoria 3 pts · Empate 1 pt.') + '</p>';
            h += '</div>';
            return h;
        }

        h += '<div class="rk-scroll"><table class="rk-table sc-table" aria-label="Ranking de jugadores">';
        h += '<thead><tr><th class="rk-pos">POS</th><th class="rk-name">JUGADOR</th><th>PJ</th><th>PG</th><th>PP</th><th class="rk-pts">PTS</th><th aria-label="Amigo"></th></tr></thead><tbody>';
        for (const r of filas) {
            const esYo = me && r.nombre.toLowerCase() === me.nombre.toLowerCase();
            const amigo = SocialStore.esAmigo(r.nombre);
            const cls = [r.pos === 1 ? 'lider' : (r.pos <= 3 ? 'podium' : ''), esYo ? 'mio' : '', amigo ? 'amigo' : ''].join(' ').trim();
            h += '<tr class="' + cls + '">';
            h += '<td class="rk-pos">' + r.pos + '°</td>';
            h += '<td class="rk-name">' + (amigo ? '<span class="sc-star" aria-label="Amigo">★</span> ' : '') + esc(r.nombre) + (esYo ? ' <span class="sc-tag">VOS</span>' : '') + '</td>';
            h += '<td>' + r.pj + '</td><td>' + r.pg + '</td><td>' + r.pp + '</td>';
            h += '<td class="rk-pts">' + r.pts + '</td>';
            h += '<td class="sc-act">';
            if (!esYo) {
                h += amigo
                    ? '<button type="button" class="sc-mini quitar" data-quitar="' + esc(r.nombre) + '" aria-label="Quitar amigo ' + esc(r.nombre) + '" title="Quitar amigo">−</button>'
                    : '<button type="button" class="sc-mini" data-agregar="' + esc(r.nombre) + '" aria-label="Agregar amigo ' + esc(r.nombre) + '" title="Agregar amigo">+</button>';
            }
            h += '</td></tr>';
        }
        h += '</tbody></table></div>';
        h += '<p class="sc-note">' + ((RankingStore.esRemoto && RankingStore.esRemoto())
            ? 'Datos del servidor · ★ = amigo'
            : 'Copia de este dispositivo · ★ = amigo') + '</p>';
        return h;
    }

    function renderSinSesion(texto) {
        let h = '<div class="sc-empty">';
        h += '<p class="sc-empty-t">SIN SESIÓN</p>';
        h += '<p>' + texto + '</p>';
        h += '<button type="button" class="action-btn" data-ir-config>IR A CONFIGURACIÓN</button>';
        h += '</div>';
        return h;
    }

    function renderPerfil() {
        const me = SocialStore.yo();
        if (!me) return renderSinSesion('Iniciá sesión o registrate para tener perfil, sumar puntos y aparecer en el ranking.');

        const j = buscar(me.nombre) || { pos: '-', pj: 0, pg: 0, pp: 0, pe: 0, pts: 0, gf: 0, gc: 0 };
        const rg = rango(j.pts);
        const efect = j.pj ? Math.round((j.pg / j.pj) * 100) : 0;

        let h = '<div class="sc-profile">';
        h += '<div class="sc-avatar" aria-hidden="true">' + inicial(me.nombre) + '</div>';
        h += '<div class="sc-pinfo">';
        h += '<p class="sc-pname">' + esc(me.nombre) + '</p>';
        h += '<p class="sc-badge ' + rg.id + '">' + rg.label + '</p>';
        h += '<p class="sc-psub">' + (me.remoto ? 'CUENTA EN SERVIDOR' : 'CUENTA LOCAL') + ' · POS ' + esc(String(j.pos)) + (j.pos !== '-' ? '°' : '') + '</p>';
        h += '</div></div>';

        h += '<div class="sc-stats">';
        const stat = (k, v, cls) => '<div class="sc-stat ' + (cls || '') + '"><b>' + v + '</b><span>' + k + '</span></div>';
        h += stat('PTS', j.pts, 'gold');
        h += stat('PJ', j.pj);
        h += stat('PG', j.pg, 'win');
        h += stat('PE', j.pe || 0, 'draw');
        h += stat('PP', j.pp, 'loss');
        h += stat('GF', j.gf || 0);
        h += stat('GC', j.gc || 0);
        h += stat('% VICT', efect + '%');
        h += '</div>';

        const sig = j.pts >= 90 ? null : (j.pts >= 50 ? 90 : (j.pts >= 20 ? 50 : 20));
        if (sig) {
            const base = sig === 20 ? 0 : (sig === 50 ? 20 : 50);
            const pct = Math.max(0, Math.min(100, Math.round(((j.pts - base) / (sig - base)) * 100)));
            h += '<div class="sc-next"><span>PRÓXIMO RANGO: ' + (sig - j.pts) + ' PTS</span>';
            h += '<div class="sc-bar"><i style="width:' + pct + '%"></i></div></div>';
        }

        h += '<button type="button" class="action-btn secondary" data-compartir>COMPARTIR PERFIL</button>';
        return h;
    }

    function renderAmigos() {
        const lista = SocialStore.amigos();
        const me = SocialStore.yo();
        const pendiente = SocialStore.invitacionPendiente();
        let h = '';

        if (pendiente) {
            h += '<div class="sc-invite">';
            h += '<p><b>' + esc(pendiente) + '</b> te invitó a jugar.</p>';
            h += '<div class="sc-row2">';
            h += '<button type="button" class="action-btn cfg-mini" data-aceptar="' + esc(pendiente) + '">AGREGAR</button>';
            h += '<button type="button" class="action-btn secondary cfg-mini" data-descartar>IGNORAR</button>';
            h += '</div></div>';
        }

        h += '<form class="sc-add" id="sc-add-form" autocomplete="off">';
        h += '<label class="cfg-field"><span>AGREGAR AMIGO</span>';
        h += '<input id="sc-add-name" type="text" maxlength="20" placeholder="Nombre del jugador"></label>';
        h += '<button type="submit" class="action-btn cfg-mini">AGREGAR</button>';
        h += '</form>';
        h += '<p class="sc-msg" id="sc-msg" aria-live="polite"></p>';

        if (!lista.length) {
            h += '<div class="sc-empty"><p class="sc-empty-t">SIN AMIGOS TODAVÍA</p><p>Agregalos por nombre o con el + del ranking.</p></div>';
        } else {
            h += '<ul class="sc-friends" id="sc-friends-list">';
            const ordenados = lista
                .map(a => ({ a, r: buscar(a.nombre) }))
                .sort((x, y) => (y.r ? y.r.pts : -1) - (x.r ? x.r.pts : -1));
            for (const { a, r } of ordenados) {
                const key = String(a.nombre).toLowerCase();
                const st = (presenciaCache[key] || 'offline');
                const dotCls = st === 'online' ? 'on' : (st === 'ocupado' ? 'busy' : 'off');
                const stLabel = st === 'online' ? 'En línea' : (st === 'ocupado' ? 'Ocupado' : 'Desconectado');
                h += '<li class="sc-friend" data-amigo="' + esc(a.nombre) + '">';
                h += '<span class="sc-avatar sm" aria-hidden="true">' + inicial(a.nombre) + '</span>';
                h += '<span class="sc-fi"><b><span class="dot ' + dotCls + '" title="' + stLabel + '"></span>' + esc(a.nombre) + '</b>';
                h += '<small>' + stLabel + (r ? (' · ' + r.pos + '° · ' + r.pts + ' PTS') : '') + '</small></span>';
                if (st === 'online' && me) {
                    h += '<button type="button" class="sc-mini invitar" data-invitar-amigo="' + esc(a.nombre) + '" aria-label="Invitar a ' + esc(a.nombre) + '" title="Invitar a sala privada">▶</button>';
                }
                h += '<button type="button" class="sc-mini quitar" data-quitar="' + esc(a.nombre) + '" aria-label="Quitar a ' + esc(a.nombre) + '" title="Quitar">×</button>';
                h += '</li>';
            }
            h += '</ul>';
        }

        h += '<p class="sc-note">' + lista.length + ' / ' + SocialStore.MAX_AMIGOS + ' amigos · ● en línea · ▶ invitar a sala privada</p>';
        h += '<button type="button" class="action-btn secondary" data-invitar' + (me ? '' : ' disabled') + '>COPIAR LINK</button>';
        if (!me) h += '<p class="sc-note">Iniciá sesión para ver quién está en línea e invitar.</p>';
        return h;
    }

    function renderPartidos() {
        const me = SocialStore.yo();
        if (!me) return renderSinSesion('El historial se guarda en el servidor cuando jugás con sesión iniciada.');
        let h = '<div class="sc-form" id="sc-form" aria-label="Últimos resultados"></div>';
        h += '<ul class="sc-history" id="sc-history"><li class="sc-note">Cargando historial...</li></ul>';
        if (!me.remoto) h += '<p class="sc-note">Tu cuenta es local: el historial solo existe con cuenta en el servidor.</p>';
        return h;
    }

    // ---------------- panel ----------------
    function render() {
        let h = '<div class="sc-head"><h2>SOCIAL</h2>';
        const me = SocialStore.yo();
        h += '<p class="sc-who">' + (me ? 'JUGADOR: <b>' + esc(me.nombre) + '</b>' : 'SIN SESIÓN') + '</p></div>';
        h += '<div class="sc-tabs" role="tablist">';
        for (const t of TABS) {
            const on = t.id === tab;
            h += '<button type="button" role="tab" class="sc-tab' + (on ? ' on' : '') + '" data-tab="' + t.id + '" aria-selected="' + on + '">' + t.label;
            if (t.id === 'amigos' && SocialStore.invitacionPendiente()) h += '<i class="sc-dot" aria-label="Invitación nueva"></i>';
            h += '</button>';
        }
        h += '</div><div class="sc-body" role="tabpanel">';
        if (tab === 'perfil') h += renderPerfil();
        else if (tab === 'amigos') h += renderAmigos();
        else if (tab === 'partidos') h += renderPartidos();
        else h += renderRanking();
        h += '</div>';
        h += '<button type="button" class="action-btn secondary" id="dialog-close">VOLVER</button>';
        return h;
    }

    function cargarHistorial(box) {
        const ul = box.querySelector('#sc-history');
        const forma = box.querySelector('#sc-form');
        if (!ul || typeof AuthStore === 'undefined' || !AuthStore.cargarPartidos) return;
        AuthStore.cargarPartidos().then((lista) => {
            if (!ul.isConnected) return;
            if (!lista.length) {
                ul.innerHTML = '<li class="sc-note">Todavía no hay partidos guardados.</li>';
                return;
            }
            const letra = (r) => r === 'win' ? 'V' : (r === 'loss' ? 'D' : 'E');
            const cls = (r) => r === 'win' ? 'win' : (r === 'loss' ? 'loss' : 'draw');
            if (forma) {
                forma.innerHTML = '<span>ÚLTIMOS 5</span>' + lista.slice(0, 5)
                    .map(p => '<i class="' + cls(p.resultado) + '">' + letra(p.resultado) + '</i>').join('');
            }
            ul.innerHTML = lista.slice(0, 30).map((p) => {
                const modo = p.modo === 'online' ? 'EN LÍNEA' : (p.modo === 'liga' ? 'LIGA' : 'SOLO');
                const cuando = p.cuando ? new Date(p.cuando).toLocaleDateString('es') : '';
                return '<li class="sc-match ' + cls(p.resultado) + '">'
                    + '<i>' + letra(p.resultado) + '</i>'
                    + '<b>' + (parseInt(p.gf, 10) || 0) + ' - ' + (parseInt(p.gc, 10) || 0) + '</b>'
                    + '<span>' + modo + (cuando ? ' · ' + esc(cuando) : '') + '</span></li>';
            }).join('');
        }).catch(() => {
            if (ul.isConnected) ul.innerHTML = '<li class="sc-note">No se pudo leer el historial.</li>';
        });
    }

    function compartir(texto, url, msgEl) {
        const aviso = (t) => { if (msgEl) msgEl.textContent = t; };
        if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: 'Liga Chaquito F8', text: texto, url }).catch(() => {});
            return;
        }
        const full = texto + (url ? ' ' + url : '');
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(full).then(() => aviso('¡Copiado al portapapeles!'), () => aviso(full));
        } else {
            aviso(full);
        }
    }


    function ensurePresencia() {
        const g = (typeof window !== 'undefined') ? window.__game : null;
        const lista = SocialStore.amigos().map(a => a.nombre);
        if (!lista.length) return;

        const aplicar = (mapa) => {
            presenciaCache = mapa || Object.create(null);
            if (tab !== 'amigos') return;
            const ul = document.getElementById('sc-friends-list');
            if (!ul) return;
            ul.querySelectorAll('.sc-friend').forEach((li) => {
                const nom = li.getAttribute('data-amigo') || '';
                const key = nom.toLowerCase();
                const st = presenciaCache[key] || 'offline';
                const stLabel = st === 'online' ? 'En línea' : (st === 'ocupado' ? 'Ocupado' : 'Desconectado');
                const dot = li.querySelector('.dot');
                if (dot) {
                    dot.className = 'dot ' + (st === 'online' ? 'on' : (st === 'ocupado' ? 'busy' : 'off'));
                    dot.title = stLabel;
                }
                const small = li.querySelector('small');
                if (small) {
                    const parts = small.textContent.split(' · ');
                    const rest = parts.length > 1 ? parts.slice(1).join(' · ') : '';
                    small.textContent = stLabel + (rest ? ' · ' + rest : '');
                }
                let btn = li.querySelector('[data-invitar-amigo]');
                if (st === 'online' && SocialStore.yo()) {
                    if (!btn) {
                        btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'sc-mini invitar';
                        btn.setAttribute('data-invitar-amigo', nom);
                        btn.title = 'Invitar a sala privada';
                        btn.setAttribute('aria-label', 'Invitar a ' + nom);
                        btn.textContent = '▶';
                        const quitar = li.querySelector('[data-quitar]');
                        if (quitar) li.insertBefore(btn, quitar);
                        else li.appendChild(btn);
                        btn.addEventListener('click', () => {
                            const game = window.__game;
                            if (game && game._invitarAmigoAPrivada) {
                                const dlg = document.getElementById('menu-dialog');
                                if (dlg) dlg.classList.remove('open');
                                game._invitarAmigoAPrivada(nom);
                            }
                        });
                    }
                } else if (btn) {
                    btn.remove();
                }
            });
        };

        const pedir = () => {
            const runConsulta = (sock) => {
                sock.emit('presencia_consulta', { nombres: lista }, (res) => {
                    aplicar((res && res.presencia) || {});
                });
            };
            if (g && g.socket && g.socket.connected) {
                const tok = g._tokenAuth ? g._tokenAuth() : '';
                if (tok) g.socket.emit('presencia_hello', { token: tok });
                runConsulta(g.socket);
                return;
            }
            if (!g || typeof g._cargarSocketIo !== 'function') return;
            g._cargarSocketIo().then(() => {
                if (!window.io) return;
                if (!g.socket || !g.socket.connected) {
                    if (g.socket) { try { g.socket.disconnect(); } catch (e) { /* ignore */ } }
                    g.socket = window.io(g._urlServidor(), { transports: ['websocket', 'polling'] });
                    g.socket.on('connect', () => {
                        const tok = g._tokenAuth ? g._tokenAuth() : '';
                        if (tok) g.socket.emit('presencia_hello', { token: tok });
                        runConsulta(g.socket);
                    });
                    g.socket.on('invitacion_partida', (data) => {
                        if (typeof g._mostrarInvitacionAmigo === 'function') g._mostrarInvitacionAmigo(data);
                    });
                    g.socket.on('partido_listo', (data) => {
                        if (typeof g._entrarPartido === 'function') g._entrarPartido(data);
                    });
                } else {
                    runConsulta(g.socket);
                }
            }).catch(() => {});
        };

        pedir();
        if (presenciaTimer) clearInterval(presenciaTimer);
        presenciaTimer = setInterval(pedir, 8000);
    }

    function detenerPresencia() {
        if (presenciaTimer) { clearInterval(presenciaTimer); presenciaTimer = null; }
    }

    /**
     * Conecta los eventos del panel.
     * opts: { onClose(), onOpenSettings() }
     */
    function bind(box, opts) {
        const o = opts || {};
        const repintar = () => {
            box.innerHTML = render();
            bind(box, o);
        };

        box.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
            tab = b.getAttribute('data-tab');
            repintar();
        }));
        box.querySelectorAll('[data-filtro]').forEach(b => b.addEventListener('click', () => {
            soloAmigos = b.getAttribute('data-filtro') === 'amigos';
            repintar();
        }));
        box.querySelectorAll('[data-agregar]').forEach(b => b.addEventListener('click', () => {
            SocialStore.agregar(b.getAttribute('data-agregar'));
            repintar();
        }));
        box.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
            SocialStore.quitar(b.getAttribute('data-quitar'));
            repintar();
        }));
        box.querySelectorAll('[data-invitar-amigo]').forEach(b => b.addEventListener('click', () => {
            const nombre = b.getAttribute('data-invitar-amigo');
            const g = (typeof window !== 'undefined') ? window.__game : null;
            const msg = box.querySelector('#sc-msg');
            if (!g || typeof g._invitarAmigoAPrivada !== 'function') {
                if (msg) { msg.textContent = 'Abrí el juego en línea primero.'; msg.className = 'sc-msg err'; }
                return;
            }
            b.disabled = true;
            if (msg) { msg.textContent = 'Invitando a ' + nombre + '…'; msg.className = 'sc-msg'; }
            // Cerrar panel social para ver la pantalla de espera
            const dlg = document.getElementById('menu-dialog');
            if (dlg) dlg.classList.remove('open');
            g._invitarAmigoAPrivada(nombre).then((res) => {
                if (!res || !res.ok) {
                    if (msg) { msg.textContent = (res && res.error) || 'No se pudo invitar'; msg.className = 'sc-msg err'; }
                    b.disabled = false;
                    if (dlg) dlg.classList.add('open');
                }
            }).catch(() => {
                if (msg) { msg.textContent = 'Error de red'; msg.className = 'sc-msg err'; }
                b.disabled = false;
            });
        }));
        box.querySelectorAll('[data-aceptar]').forEach(b => b.addEventListener('click', () => {
            SocialStore.agregar(b.getAttribute('data-aceptar'));
            SocialStore.descartarInvitacion();
            repintar();
        }));
        box.querySelectorAll('[data-descartar]').forEach(b => b.addEventListener('click', () => {
            SocialStore.descartarInvitacion();
            repintar();
        }));
        box.querySelectorAll('[data-ir-config]').forEach(b => b.addEventListener('click', () => {
            if (o.onOpenSettings) o.onOpenSettings();
        }));

        const form = box.querySelector('#sc-add-form');
        if (form) form.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = box.querySelector('#sc-add-name');
            const res = SocialStore.agregar(input ? input.value : '');
            if (res.ok) {
                repintar();
                const m = box.querySelector('#sc-msg');
                if (m) { m.textContent = '¡' + res.nombre + ' agregado!'; m.className = 'sc-msg ok'; }
            } else {
                const m = box.querySelector('#sc-msg');
                if (m) { m.textContent = res.error; m.className = 'sc-msg err'; }
            }
        });

        const share = box.querySelector('[data-compartir]');
        if (share) share.addEventListener('click', () => {
            const me = SocialStore.yo();
            const j = me ? buscar(me.nombre) : null;
            const txt = me
                ? 'Soy ' + me.nombre + ' en Liga Chaquito F8' + (j ? ': ' + j.pos + '° con ' + j.pts + ' pts.' : '.') + ' ¿Te animás?'
                : 'Jugá Liga Chaquito F8';
            compartir(txt, SocialStore.linkInvitacion(), null);
        });

        const inv = box.querySelector('[data-invitar]');
        if (inv) inv.addEventListener('click', () => {
            const me = SocialStore.yo();
            if (!me) return;
            compartir(me.nombre + ' te invita a jugar Liga Chaquito F8. ¡Agregalo como amigo!', SocialStore.linkInvitacion(), box.querySelector('#sc-msg'));
        });

        const close = box.querySelector('#dialog-close');
        if (close) close.addEventListener('click', () => { if (o.onClose) o.onClose(); });

        if (tab === 'partidos') cargarHistorial(box);
        if (tab === 'amigos') ensurePresencia();
    }

    /** Abre el panel SOCIAL dentro de #menu-dialog. */
    function open(pestana) {
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        if (!dialog || !content) return;
        if (pestana) tab = pestana;
        else if (SocialStore.invitacionPendiente()) tab = 'amigos';

        content.classList.remove('rk-wide', 'cfg-wide');
        content.classList.add('sc-wide');

        const cerrar = () => {
            detenerPresencia();
            content.classList.remove('sc-wide');
            dialog.classList.remove('open');
            dialog.removeEventListener('click', onBackdrop);
            const btn = document.getElementById('social-hit');
            if (btn) btn.focus({ preventScroll: true });
        };
        const onBackdrop = (e) => { if (e.target === dialog) cerrar(); };
        const opts = {
            onClose: cerrar,
            onOpenSettings: () => {
                cerrar();
                const s = document.getElementById('settings-hit');
                if (s) s.click();
            }
        };

        const pintar = () => {
            content.innerHTML = render();
            bind(content, opts);
        };
        pintar();
        dialog.classList.add('open');
        dialog.addEventListener('click', onBackdrop);

        // Refresca ranking (y sesión remota) sin bloquear la apertura.
        const tareas = [];
        if (typeof AuthStore !== 'undefined' && AuthStore.restaurar) tareas.push(AuthStore.restaurar().catch(() => null));
        if (typeof RankingStore !== 'undefined' && RankingStore.sincronizar) tareas.push(RankingStore.sincronizar().catch(() => null));
        if (typeof SocialStore !== 'undefined' && SocialStore.restaurarRemoto) tareas.push(SocialStore.restaurarRemoto().catch(() => null));
        if (tareas.length) {
            Promise.all(tareas).then(() => {
                const activo = document.activeElement;
                const escribiendo = activo && activo.id === 'sc-add-name' && activo.value;
                if (dialog.classList.contains('open') && content.classList.contains('sc-wide') && !escribiendo) pintar();
            });
        }
    }

    return { render, bind, open, rango };
})();

// ============================================================
// Arranque: captura invitación y engancha #social-hit
// ============================================================
(function () {
    if (typeof document === 'undefined') return;
    SocialStore.capturarInvitacion();
    const enganchar = () => {
        const btn = document.getElementById('social-hit');
        if (!btn || btn.dataset.socialBound) return;
        btn.dataset.socialBound = '1';
        btn.addEventListener('click', () => SocialUI.open());
        if (SocialStore.invitacionPendiente()) btn.classList.add('has-news');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enganchar);
    else enganchar();
})();

if (typeof window !== 'undefined') {
    window.SocialStore = SocialStore;
    window.SocialUI = SocialUI;
}

export { SocialStore, SocialUI };

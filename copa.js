/**
 * ETAPA 9 — COPA CHAQUITO (Competición de eliminación directa).
 *
 * Convive de forma independiente con la Liga:
 *   CopaCore  -> lógica pura (sorteo con cabezas de serie/byes, rondas Octavos/Cuartos/Semis/Final,
 *                formato partido único o ida y vuelta, resolución por penales, simulación e historial).
 *   CopaStore -> persistencia en localStorage (copa actual, torneos guardados e historial de campeones).
 *   CopaModo  -> pantalla interactiva (#copa-screen) y enganche con Game, Penales, Noticias y Supercopa.
 */

import { CarreraStore } from './career/store.js';

export const CopaCore = (() => {
    const VERSION = 1;
    const BASE_GOLES = 1.2;
    const MAX_GOLES = 6;

    function clampEstrellas(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return 3;
        return Math.max(1, Math.min(5, Math.round(v)));
    }

    function estrellasDeEquipo(id) {
        if (typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS)) {
            const t = EQUIPOS.find((eq) => eq.id === id);
            if (t && t.estrellas != null) return clampEstrellas(t.estrellas);
        }
        return 3;
    }

    function perfilDesdeEstrellas(estrellas) {
        const e = clampEstrellas(estrellas);
        return {
            estrellas: e,
            fuerza: 0.5 + e * 0.144,
            ataque: 0.72 + e * 0.095,
            defensa: 0.78 + e * 0.08,
        };
    }

    function barajar(arr) {
        const r = arr.slice();
        for (let i = r.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
    }

    function poisson(lambda) {
        const L = Math.exp(-Math.max(0.05, lambda));
        let k = 0;
        let p = 1;
        do {
            k++;
            p *= Math.random();
        } while (p > L);
        return Math.min(MAX_GOLES, k - 1);
    }

    function nombreRondaPorTamano(slots) {
        if (slots >= 16) return 'OCTAVOS DE FINAL';
        if (slots === 8) return 'CUARTOS DE FINAL';
        if (slots === 4) return 'SEMIFINAL';
        return 'GRAN FINAL';
    }

    function codigoRondaPorTamano(slots) {
        if (slots >= 16) return 'octavos';
        if (slots === 8) return 'cuartos';
        if (slots === 4) return 'semifinal';
        return 'final';
    }

    function potenciaDosSuperior(n) {
        let p = 2;
        while (p < n) p *= 2;
        return Math.min(16, Math.max(2, p));
    }

    /**
     * Simula una tanda de penales realista entre dos equipos de IA cuando empatan.
     */
    function simularTandaPenalesIA(estA = 3, estB = 3) {
        const pA = 0.7 + (estA - 3) * 0.025;
        const pB = 0.7 + (estB - 3) * 0.025;
        let gA = 0;
        let gB = 0;
        for (let i = 0; i < 5; i++) {
            if (Math.random() < pA) gA++;
            if (Math.random() < pB) gB++;
            const restA = 4 - i;
            const restB = 4 - i;
            if (gA > gB + restB || gB > gA + restA) break;
        }
        let guard = 0;
        while (gA === gB && guard < 15) {
            const aOk = Math.random() < pA;
            const bOk = Math.random() < pB;
            if (aOk) gA++;
            if (bOk) gB++;
            guard++;
        }
        if (gA === gB) gA++; // desempate garantizado
        return [gA, gB];
    }

    function crearLlave(slotIndex, eqA, eqB, { idaYVuelta = false } = {}) {
        if (eqA && !eqB) {
            return {
                id: `llave_${slotIndex}`,
                a: eqA,
                b: null,
                bye: true,
                idaYVuelta: false,
                partidos: [],
                penales: null, // { pa, pb }
                ganador: eqA,
            };
        }
        const partidos = idaYVuelta
            ? [
                  { orden: 0, l: eqA, v: eqB, gl: null, gv: null },
                  { orden: 1, l: eqB, v: eqA, gl: null, gv: null },
              ]
            : [{ orden: 0, l: eqA, v: eqB, gl: null, gv: null }];
        return {
            id: `llave_${slotIndex}`,
            a: eqA,
            b: eqB,
            bye: false,
            idaYVuelta: !!idaYVuelta,
            partidos,
            penales: null,
            ganador: null,
        };
    }

    /**
     * Crea una nueva edición de la Copa Chaquito sorteando el cuadro completo.
     */
    function crear({ ids, miEquipo, dificultad = 'normal', formato = 'unico' } = {}) {
        if (!Array.isArray(ids) || ids.length < 2) {
            throw new Error('La Copa Chaquito requiere al menos 2 equipos');
        }
        if (!ids.includes(miEquipo)) {
            throw new Error('Equipo inválido para la Copa');
        }
        const estrellas = {};
        for (const id of ids) estrellas[id] = estrellasDeEquipo(id);

        const slots = potenciaDosSuperior(ids.length);
        const numLlaves = slots / 2;
        const numByes = slots - ids.length;

        // Ordenar por estrellas (con barajado dentro de igual estrella) para asignar cabezas de serie a los byes
        const mezclados = barajar(ids);
        const ordenSemilla = mezclados.slice().sort((x, y) => estrellas[y] - estrellas[x]);
        const conBye = ordenSemilla.slice(0, numByes);
        const aJugar = barajar(ordenSemilla.slice(numByes));

        const esIdaVueltaRonda = formato === 'idayvuelta' && slots > 2;
        const llavesIniciales = [];
        let cursorJugar = 0;

        for (let i = 0; i < numLlaves; i++) {
            if (i < conBye.length) {
                llavesIniciales.push(crearLlave(i, conBye[i], null, { idaYVuelta: false }));
            } else {
                const eqA = aJugar[cursorJugar++] || null;
                const eqB = aJugar[cursorJugar++] || null;
                llavesIniciales.push(crearLlave(i, eqA, eqB, { idaYVuelta: esIdaVueltaRonda }));
            }
        }

        const rondas = [
            {
                indice: 0,
                slots,
                codigo: codigoRondaPorTamano(slots),
                nombre: nombreRondaPorTamano(slots),
                idaYVuelta: esIdaVueltaRonda,
                vueltaActual: 0, // 0 = ida (o único), 1 = vuelta
                cerrada: false,
                llaves: barajar(llavesIniciales).map((ll, idx) => ({ ...ll, id: `r0_${idx}` })),
            },
        ];

        const ahora = Date.now();
        return {
            v: VERSION,
            id: 'copa_' + ahora.toString(36) + Math.random().toString(36).slice(2, 6),
            creada: ahora,
            actualizada: ahora,
            equipos: ids.slice(),
            miEquipo,
            dificultad,
            formato: formato === 'idayvuelta' ? 'idayvuelta' : 'unico',
            estrellas,
            rondas,
            rondaActual: 0,
            campeon: null,
            subcampeon: null,
            eliminadoEn: null,
        };
    }

    function golesGlobalLlave(llave) {
        let ga = 0;
        let gb = 0;
        let jugados = 0;
        for (const p of llave.partidos || []) {
            if (p.gl == null || p.gv == null) continue;
            jugados++;
            if (p.l === llave.a) {
                ga += p.gl;
                gb += p.gv;
            } else {
                ga += p.gv;
                gb += p.gl;
            }
        }
        return { ga, gb, jugados, totalPartidos: (llave.partidos || []).length };
    }

    function resolverGanadorLlaveSiCompleta(copa, llave) {
        if (llave.bye) {
            llave.ganador = llave.a;
            return llave.ganador;
        }
        const g = golesGlobalLlave(llave);
        if (g.jugados < g.totalPartidos) return null;
        if (g.ga > g.gb) {
            llave.ganador = llave.a;
            return llave.ganador;
        }
        if (g.gb > g.ga) {
            llave.ganador = llave.b;
            return llave.ganador;
        }
        if (llave.penales && llave.penales.pa !== llave.penales.pb) {
            llave.ganador = llave.penales.pa > llave.penales.pb ? llave.a : llave.b;
            return llave.ganador;
        }
        return null; // falta definir por penales
    }

    function simularPartidoCopa(copa, partido) {
        const el = perfilDesdeEstrellas((copa.estrellas && copa.estrellas[partido.l]) || 3);
        const ev = perfilDesdeEstrellas((copa.estrellas && copa.estrellas[partido.v]) || 3);
        const formL = 0.86 + Math.random() * 0.28;
        const formV = 0.86 + Math.random() * 0.28;
        const lambdaL = BASE_GOLES * (el.ataque / Math.max(0.55, ev.defensa)) * 1.08 * formL;
        const lambdaV = BASE_GOLES * (ev.ataque / Math.max(0.55, el.defensa)) * formV;
        partido.gl = poisson(lambdaL);
        partido.gv = poisson(lambdaV);
    }

    function rondaActiva(copa) {
        return copa && copa.rondas ? copa.rondas[copa.rondaActual] || null : null;
    }

    function terminada(copa) {
        return !!(copa && copa.campeon);
    }

    /**
     * Busca la llave del usuario en la ronda actual (si sigue vivo en la Copa).
     */
    function llaveUsuarioActual(copa) {
        const r = rondaActiva(copa);
        if (!r || terminada(copa)) return null;
        return r.llaves.find((ll) => ll.a === copa.miEquipo || ll.b === copa.miEquipo) || null;
    }

    /**
     * Devuelve el próximo partido pendiente del usuario en la ronda actual,
     * `{ bye: true }` si quedó libre en Octavos, o `{ eliminado: true }` si ya cayó.
     */
    function partidoUsuarioActual(copa) {
        if (terminada(copa)) return null;
        const r = rondaActiva(copa);
        if (!r) return null;
        const ll = llaveUsuarioActual(copa);
        if (!ll) return { eliminado: true };
        if (ll.bye) return { bye: true, llave: ll, ronda: r };
        const p = ll.partidos[r.vueltaActual] || ll.partidos.find((x) => x.gl == null);
        if (!p || p.gl != null) return { jugadoEnPaso: true, llave: ll, ronda: r };
        return { partido: p, llave: ll, ronda: r };
    }

    /**
     * Verifica si tras empatar el partido actual del usuario se requiere tanda de penales.
     */
    function requierePenalesTrasResultado(copa, golesMios, golesRival) {
        const info = partidoUsuarioActual(copa);
        if (!info || !info.partido || !info.llave) return false;
        const ll = info.llave;
        const p = info.partido;
        const soyLocal = p.l === copa.miEquipo;
        const glSim = soyLocal ? golesMios : golesRival;
        const gvSim = soyLocal ? golesRival : golesMios;

        // Calcular global hipotético si es el último partido de la serie
        const esUltimoPartido = p.orden === ll.partidos.length - 1;
        if (!esUltimoPartido) return false;

        let ga = 0;
        let gb = 0;
        for (const item of ll.partidos) {
            const gl = item === p ? glSim : (item.gl || 0);
            const gv = item === p ? gvSim : (item.gv || 0);
            if (item.l === ll.a) {
                ga += gl;
                gb += gv;
            } else {
                ga += gv;
                gb += gl;
            }
        }
        return ga === gb;
    }

    function generarSiguienteRonda(copa, ganadores) {
        const slots = ganadores.length;
        const idx = copa.rondas.length;
        const idaVuelta = copa.formato === 'idayvuelta' && slots > 2; // Final siempre a partido único
        const llaves = [];
        for (let i = 0; i < slots / 2; i++) {
            const eqA = ganadores[i * 2];
            const eqB = ganadores[i * 2 + 1];
            const ll = crearLlave(i, eqA, eqB, { idaYVuelta: idaVuelta });
            ll.id = `r${idx}_${i}`;
            llaves.push(ll);
        }
        copa.rondas.push({
            indice: idx,
            slots,
            codigo: codigoRondaPorTamano(slots),
            nombre: nombreRondaPorTamano(slots),
            idaYVuelta: idaVuelta,
            vueltaActual: 0,
            cerrada: false,
            llaves,
        });
        copa.rondaActual = idx;
    }

    /**
     * Simula los demás partidos del paso actual y, si se completó la ronda, arma la siguiente
     * o corona al campeón de la Copa Chaquito.
     */
    function avanzarPasoCopa(copa) {
        const r = rondaActiva(copa);
        if (!r || terminada(copa)) return copa;

        const paso = r.vueltaActual || 0;
        for (const ll of r.llaves) {
            if (ll.bye) {
                ll.ganador = ll.a;
                continue;
            }
            const p = ll.partidos[paso];
            if (p && p.gl == null) {
                simularPartidoCopa(copa, p);
            }
            if (paso === ll.partidos.length - 1) {
                let gan = resolverGanadorLlaveSiCompleta(copa, ll);
                if (!gan) {
                    const [pa, pb] = simularTandaPenalesIA(
                        copa.estrellas[ll.a] || 3,
                        copa.estrellas[ll.b] || 3
                    );
                    ll.penales = { pa, pb };
                    resolverGanadorLlaveSiCompleta(copa, ll);
                }
            }
        }

        // ¿Queda partido de vuelta en esta misma ronda?
        if (r.idaYVuelta && paso === 0) {
            r.vueltaActual = 1;
            copa.actualizada = Date.now();
            return copa;
        }

        r.cerrada = true;
        const ganadores = r.llaves.map((ll) => ll.ganador).filter(Boolean);

        // Detectar si el usuario acaba de quedar eliminado en esta ronda
        const llMia = r.llaves.find((ll) => ll.a === copa.miEquipo || ll.b === copa.miEquipo);
        if (llMia && llMia.ganador !== copa.miEquipo && !copa.eliminadoEn) {
            copa.eliminadoEn = r.nombre;
        }

        if (ganadores.length <= 1) {
            const finalLlave = r.llaves[0];
            copa.campeon = ganadores[0] || (finalLlave && finalLlave.a) || copa.miEquipo;
            copa.subcampeon =
                finalLlave && finalLlave.a === copa.campeon ? finalLlave.b : (finalLlave ? finalLlave.a : '');
        } else {
            generarSiguienteRonda(copa, ganadores);
        }

        copa.actualizada = Date.now();
        return copa;
    }

    /**
     * Registra el resultado jugado por el usuario (incluyendo penales si hubo empate global)
     * y avanza el cuadro de la Copa. Si el usuario quedó eliminado en rondas previas,
     * permite simular el resto del torneo para conocer al campeón oficial.
     */
    function registrarPartidoUsuario(copa, golesMios, golesRival, penalesUsuario = null) {
        const info = partidoUsuarioActual(copa);
        if (!info || !info.partido || !info.llave) return null;

        const r = info.ronda;
        const ll = info.llave;
        const p = info.partido;
        const soyLocal = p.l === copa.miEquipo;
        p.gl = soyLocal ? golesMios : golesRival;
        p.gv = soyLocal ? golesRival : golesMios;

        if (penalesUsuario && p.orden === ll.partidos.length - 1) {
            const soyA = ll.a === copa.miEquipo;
            ll.penales = {
                pa: soyA ? penalesUsuario.golesMios : penalesUsuario.golesOtro,
                pb: soyA ? penalesUsuario.golesOtro : penalesUsuario.golesMios,
            };
        }

        const eraRondaNombre = r.nombre;
        const esFinal = r.slots === 2;
        avanzarPasoCopa(copa);

        const ganoLlave = ll.ganador === copa.miEquipo;
        const eliminado = ll.ganador && ll.ganador !== copa.miEquipo;
        const sigRonda = !terminada(copa) && ganoLlave ? rondaActiva(copa)?.nombre || '' : '';

        return {
            rondaJugada: eraRondaNombre,
            esFinal,
            ganoLlave,
            eliminado,
            campeon: copa.campeon === copa.miEquipo,
            campeonId: copa.campeon,
            subcampeonId: copa.subcampeon,
            rondaSiguiente: sigRonda,
        };
    }

    function simularRestoCopa(copa) {
        let guard = 0;
        while (!terminada(copa) && guard < 12) {
            avanzarPasoCopa(copa);
            guard++;
        }
        return copa;
    }

    function valida(copa, idsValidos) {
        try {
            if (!copa || copa.v !== VERSION || !Array.isArray(copa.rondas) || !Array.isArray(copa.equipos)) return false;
            if (!copa.equipos.every((id) => idsValidos.includes(id))) return false;
            return idsValidos.includes(copa.miEquipo);
        } catch (_e) {
            return false;
        }
    }

    return {
        crear,
        rondaActiva,
        terminada,
        llaveUsuarioActual,
        partidoUsuarioActual,
        golesGlobalLlave,
        requierePenalesTrasResultado,
        avanzarPasoCopa,
        registrarPartidoUsuario,
        simularRestoCopa,
        simularTandaPenalesIA,
        valida,
    };
})();

export const CopaStore = (() => {
    const K_ACTUAL = 'chaquito_copa_actual_v1';
    const K_HISTORIAL = 'chaquito_copa_historial_v1';
    let memActual = null;
    let memHist = [];

    const leer = (k, fallback) => {
        try {
            if (typeof localStorage === 'undefined') return fallback;
            const v = localStorage.getItem(k);
            return v ? JSON.parse(v) : fallback;
        } catch (_e) {
            return fallback;
        }
    };
    const escribir = (k, v) => {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(k, JSON.stringify(v));
            return true;
        } catch (_e) {
            return false;
        }
    };

    return {
        actual() {
            return leer(K_ACTUAL, memActual);
        },
        guardarActual(copa) {
            memActual = copa;
            return escribir(K_ACTUAL, copa);
        },
        historial() {
            const h = leer(K_HISTORIAL, memHist);
            return Array.isArray(h) ? h : [];
        },
        registrarHistorial(copa) {
            if (!copa || !copa.campeon) return false;
            const lista = CopaStore.historial().filter((x) => x && x.id !== copa.id);
            lista.unshift({
                id: copa.id,
                campeon: copa.campeon,
                subcampeon: copa.subcampeon || '',
                miEquipo: copa.miEquipo,
                formato: copa.formato,
                fecha: Date.now(),
            });
            memHist = lista.slice(0, 25);
            return escribir(K_HISTORIAL, memHist);
        },
    };
})();

function escCopa(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class CopaModo {
    constructor(game) {
        this.game = game;
        this.copa = null;
        this.rondaVista = 0;
        this.tab = 'cuadro'; // 'cuadro' | 'historial'
        this.aviso = '';
        this._avisoTimer = null;
        this.root = document.getElementById('copa-screen');
        if (this.root) {
            this.root.addEventListener('click', (e) => this._onClick(e));
            window.addEventListener('keydown', (e) => {
                if (e.code === 'Escape' && this.visible()) {
                    e.preventDefault();
                    this.volverAlMenu();
                }
            });
        }
    }

    visible() {
        return !!this.root && !this.root.hidden;
    }

    ocultar() {
        if (this.root) this.root.hidden = true;
    }

    _ids() {
        return EQUIPOS.map((e) => e.id);
    }

    _eq(id) {
        return (
            this.game._equipo(id) || {
                id,
                nombre: id || 'LIBRE',
                corto: id || 'LIBRE',
                siglas: '??',
                colores: ['#444', '#222'],
            }
        );
    }

    _badge(id, cls = 'lg-badge') {
        if (!id) return '';
        return `<img class="${cls}" alt="" src="${escCopa(this.game._badgeURL(this._eq(id)))}">`;
    }

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
        const idsOk = this._ids();
        let actual = CopaStore.actual();
        if (!CopaCore.valida(actual, idsOk)) actual = null;
        const hist = CopaStore.historial();

        let html =
            '<h2>🏆 COPA CHAQUITO</h2>' +
            '<p>Eliminación directa con los 13 clubes. Empate en la llave se define por penales.</p>';
        if (actual) {
            const rAct = CopaCore.rondaActiva(actual);
            const estadoTxt = CopaCore.terminada(actual)
                ? `Finalizada · Campeón: ${this._eq(actual.campeon).corto}`
                : rAct
                ? rAct.nombre
                : 'En curso';
            html +=
                `<button type="button" class="action-btn" id="cp-cont">CONTINUAR COPA</button>` +
                `<p class="lg-mini">${escCopa(this._eq(actual.miEquipo).nombre)} · ${escCopa(estadoTxt)}</p>`;
        }
        html += `<button type="button" class="action-btn${actual ? ' secondary' : ''}" id="cp-nueva">SORTEAR NUEVA COPA</button>`;
        if (hist.length > 0) {
            const ult = hist[0];
            html += `<p class="lg-mini">Último campeón: <b>${escCopa(this._eq(ult.campeon).nombre)}</b> (${hist.length} ediciones jugadas)</p>`;
        }
        html += '<button type="button" class="action-btn secondary" id="cp-volver">VOLVER</button>';

        this._dialogo(html, {
            'cp-cont': (cerrar) => {
                cerrar();
                this.copa = actual;
                this.rondaVista = Math.min(actual.rondaActual, actual.rondas.length - 1);
                this.mostrar();
            },
            'cp-nueva': () => this._elegirFormato(),
            'cp-volver': (cerrar) => cerrar(),
        });
    }

    _elegirFormato() {
        this._dialogo(
            '<h2>FORMATO DE LA COPA</h2>' +
                '<p>Sorteo de cuadro completo: Octavos, Cuartos, Semifinal y Gran Final.</p>' +
                '<button type="button" class="action-btn" id="cp-unico">PARTIDO ÚNICO · MANO A MANO</button>' +
                '<button type="button" class="action-btn secondary" id="cp-iv">IDA Y VUELTA (FINAL ÚNICA)</button>' +
                '<button type="button" class="action-btn secondary" id="cp-atras">VOLVER</button>',
            {
                'cp-unico': (cerrar) => {
                    cerrar();
                    this.game._formatoCopa = 'unico';
                    this.game._openTeamSelect('copa');
                },
                'cp-iv': (cerrar) => {
                    cerrar();
                    this.game._formatoCopa = 'idayvuelta';
                    this.game._openTeamSelect('copa');
                },
                'cp-atras': () => this.abrirMenu(),
            }
        );
    }

    crearNueva(miEquipo, dificultad) {
        CarreraStore.fijarClubActual(miEquipo);
        this.copa = CopaCore.crear({
            ids: this._ids(),
            miEquipo,
            dificultad,
            formato: this.game._formatoCopa || 'unico',
        });
        CopaStore.guardarActual(this.copa);
        this.rondaVista = 0;
        this.tab = 'cuadro';
        this.aviso = '¡Cuadro de la Copa Chaquito sorteado!';
        this.mostrar();
    }

    mostrar() {
        if (!this.root || !this.copa) return;
        const g = this.game;
        g.menuVisible = true;
        const menu = document.getElementById('main-menu');
        if (menu) menu.style.display = 'none';
        const sel = document.getElementById('team-select');
        if (sel) sel.hidden = true;
        if (g.liga) g.liga.ocultar();
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        this.rondaVista = Math.min(this.copa.rondaActual, this.copa.rondas.length - 1);
        this.root.hidden = false;
        this.render();
        this.root.scrollTop = 0;
        if (this.aviso) this._mostrarAviso(this.aviso);
    }

    _mostrarAviso(texto) {
        this.aviso = '';
        const el = this.root && this.root.querySelector('.lg-toast');
        if (!el) return;
        el.textContent = texto;
        el.classList.add('on');
        clearTimeout(this._avisoTimer);
        this._avisoTimer = setTimeout(() => el.classList.remove('on'), 2800);
    }

    render() {
        const C = this.copa;
        if (!C || !this.root) return;
        const fin = CopaCore.terminada(C);
        const rAct = CopaCore.rondaActiva(C);
        const sub = fin
            ? 'EDICIÓN FINALIZADA'
            : `${rAct ? rAct.nombre : ''} · ${C.formato === 'idayvuelta' ? 'IDA Y VUELTA' : 'PARTIDO ÚNICO'}`;

        let h =
            `<div class="lg-wrap"><div class="lg-toast" role="status"></div>` +
            `<h2 class="lg-title">🏆 COPA CHAQUITO</h2>` +
            `<p class="lg-sub">${escCopa(sub)}</p>`;

        h += fin ? this._htmlTarjetaCampeon() : this._htmlTarjetaAccion();

        h +=
            `<div class="lg-tabs" role="tablist">` +
            `<button type="button" role="tab" data-cp-act="tab-cuadro" class="${this.tab === 'cuadro' ? 'on' : ''}">CUADRO</button>` +
            `<button type="button" role="tab" data-cp-act="tab-historial" class="${this.tab === 'historial' ? 'on' : ''}">HISTORIAL</button>` +
            `<button type="button" role="tab" data-cp-act="abrir-noticias">NOTICIAS</button>` +
            `</div>`;

        h += this.tab === 'historial' ? this._htmlHistorial() : this._htmlCuadro();

        h +=
            `<div class="lg-actions">` +
            (fin && this.game.supercopa && this.game.supercopa.disponible()
                ? `<button type="button" class="action-btn" data-cp-act="ir-supercopa">⭐ JUGAR SUPERCOPA CHAQUITO</button>`
                : '') +
            `<button type="button" class="action-btn secondary" data-cp-act="ir-club">🏛 MI CLUB</button>` +
            `<button type="button" class="action-btn secondary" data-cp-act="ir-liga">IR A LIGA</button>` +
            `<button type="button" class="action-btn secondary" data-cp-act="nueva">NUEVA COPA</button>` +
            `<button type="button" class="action-btn secondary" data-cp-act="menu">MENÚ PRINCIPAL</button>` +
            `</div></div>`;

        this.root.innerHTML = h;
    }

    _htmlTarjetaCampeon() {
        const C = this.copa;
        const camp = this._eq(C.campeon);
        const sub = C.subcampeon ? this._eq(C.subcampeon) : null;
        const soyCamp = C.campeon === C.miEquipo;
        return (
            `<div class="lg-next lg-final">` +
            `<div class="lg-final-t">${soyCamp ? '🏆 ¡CAMPEÓN DE LA COPA CHAQUITO!' : `CAMPEÓN: ${escCopa(camp.nombre)}`}</div>` +
            `<div style="margin:8px 0">${this._badge(C.campeon, 'lg-badge big')}</div>` +
            `<p>${
                soyCamp
                    ? `${escCopa(camp.nombre)} conquistó el cuadro eliminatorio y sumó el trofeo.`
                    : `${escCopa(camp.nombre)} venció en la final${sub ? ` a ${escCopa(sub.nombre)}` : ''}.`
            }</p>` +
            `</div>`
        );
    }

    _htmlTarjetaAccion() {
        const C = this.copa;
        const info = CopaCore.partidoUsuarioActual(C);
        if (!info || info.eliminado) {
            return (
                `<div class="lg-next">` +
                `<div class="lg-next-label">ELIMINADO EN ${escCopa(C.eliminadoEn || 'LA COPA')}</div>` +
                `<p>Tu equipo quedó fuera del cuadro. Podés simular el resto del certamen para coronar al campeón.</p>` +
                `<button type="button" class="action-btn" data-cp-act="simular-resto">SIMULAR HASTA LA FINAL</button>` +
                `</div>`
            );
        }
        if (info.bye) {
            return (
                `<div class="lg-next">` +
                `<div class="lg-next-label">CABEZA DE SERIE · PASE DIRECTO</div>` +
                `<p>${escCopa(this._eq(C.miEquipo).nombre)} salió sorteado libre en Octavos y espera rival en Cuartos de Final.</p>` +
                `<button type="button" class="action-btn" data-cp-act="avanzar-bye">SIMULAR OCTAVOS Y AVANZAR</button>` +
                `</div>`
            );
        }
        const m = info.partido;
        const rival = m.l === C.miEquipo ? m.v : m.l;
        const rivInfo = CarreraStore.rivalidadEntre(C.miEquipo, rival);
        const tagVuelta = info.llave.idaYVuelta ? (m.orden === 0 ? ' · PARTIDO DE IDA' : ' · PARTIDO DE VUELTA') : ' · PARTIDO ÚNICO';
        const rivChip = rivInfo.esClasico
            ? `<div class="cp-riv-tag clasico">🔥 ${escCopa(rivInfo.etiqueta)} · ${rivInfo.textoNivel}</div>`
            : `<div class="cp-riv-tag">${escCopa(rivInfo.textoNivel)}</div>`;

        return (
            `<div class="lg-next">` +
            `<div class="lg-next-label">${escCopa(info.ronda.nombre + tagVuelta)}</div>` +
            rivChip +
            `<div class="lg-vs">` +
            `<span class="lg-vs-t">${this._badge(m.l, 'lg-badge big')}<b>${escCopa(this._eq(m.l).corto)}</b></span>` +
            `<span class="lg-vs-x">VS</span>` +
            `<span class="lg-vs-t">${this._badge(m.v, 'lg-badge big')}<b>${escCopa(this._eq(m.v).corto)}</b></span>` +
            `</div>` +
            `<button type="button" class="action-btn" data-cp-act="jugar">JUGAR LLAVE</button>` +
            `<button type="button" class="action-btn secondary" data-cp-act="simular-llave">SIMULAR ESTE PARTIDO</button>` +
            `</div>`
        );
    }

    _htmlCuadro() {
        const C = this.copa;
        const totalR = C.rondas.length;
        const r = C.rondas[this.rondaVista] || C.rondas[0];
        let h =
            `<div class="lg-fnav">` +
            `<button type="button" data-cp-act="ronda-prev"${this.rondaVista <= 0 ? ' disabled' : ''}>◀</button>` +
            `<div><b>${escCopa(r.nombre)}</b><span>${r.cerrada ? 'DEFINIDA' : 'EN JUEGO'} · RONDA ${this.rondaVista + 1}/${totalR}</span></div>` +
            `<button type="button" data-cp-act="ronda-next"${this.rondaVista >= totalR - 1 ? ' disabled' : ''}>▶</button>` +
            `</div><div class="lg-matches">`;

        for (const ll of r.llaves) {
            const mio = ll.a === C.miEquipo || ll.b === C.miEquipo;
            if (ll.bye) {
                h +=
                    `<div class="lg-m lg-libre${mio ? ' mio' : ''}">` +
                    `${this._badge(ll.a)} <b>${escCopa(this._eq(ll.a).corto)}</b> · PASE DIRECTO A CUARTOS` +
                    `</div>`;
                continue;
            }
            const g = CopaCore.golesGlobalLlave(ll);
            let marc = '<em>vs</em>';
            if (g.jugados > 0) {
                const pen = ll.penales ? ` <small class="cp-pen">(${ll.penales.pa}-${ll.penales.pb}p)</small>` : '';
                marc = `<b>${g.ga}</b><i>-</i><b>${g.gb}</b>${pen}`;
            }
            const clsGanA = ll.ganador === ll.a ? ' class="cp-win"' : '';
            const clsGanB = ll.ganador === ll.b ? ' class="cp-win"' : '';
            h +=
                `<div class="lg-m${mio ? ' mio' : ''}">` +
                `<span class="lg-m-t izq"><span${clsGanA}>${escCopa(this._eq(ll.a).corto)}</span>${this._badge(ll.a)}</span>` +
                `<span class="lg-m-sc">${marc}</span>` +
                `<span class="lg-m-t der">${this._badge(ll.b)}<span${clsGanB}>${escCopa(this._eq(ll.b).corto)}</span></span>` +
                `</div>`;
        }
        h += '</div>';
        return h;
    }

    _htmlHistorial() {
        const hist = CopaStore.historial();
        if (!hist.length) {
            return '<div class="pm-empty">Todavía no hay ediciones finalizadas de la Copa Chaquito.</div>';
        }
        let h = '<div class="lg-matches">';
        for (const ed of hist) {
            const fecha = new Date(ed.fecha).toLocaleDateString('es-AR');
            h +=
                `<div class="lg-m${ed.campeon === ed.miEquipo ? ' mio' : ''}">` +
                `<span class="lg-m-t izq"><span>🏆 ${escCopa(this._eq(ed.campeon).corto)}</span>${this._badge(ed.campeon)}</span>` +
                `<span class="lg-m-sc"><small>${fecha}</small></span>` +
                `<span class="lg-m-t der">${ed.subcampeon ? this._badge(ed.subcampeon) : ''}<span>Sub: ${escCopa(ed.subcampeon ? this._eq(ed.subcampeon).corto : '-')}</span></span>` +
                `</div>`;
        }
        h += '</div>';
        return h;
    }

    _onClick(e) {
        const b = e.target.closest('[data-cp-act]');
        if (!b || b.disabled) return;
        const act = b.dataset.cpAct;
        if (act === 'tab-cuadro') {
            this.tab = 'cuadro';
            this.render();
        } else if (act === 'tab-historial') {
            this.tab = 'historial';
            this.render();
        } else if (act === 'abrir-noticias') {
            if (typeof this.game._abrirPantallaNoticias === 'function') {
                this.ocultar();
                this.game._abrirPantallaNoticias('copa');
            }
        } else if (act === 'ronda-prev') {
            this.rondaVista = Math.max(0, this.rondaVista - 1);
            this.render();
        } else if (act === 'ronda-next') {
            this.rondaVista = Math.min(this.copa.rondas.length - 1, this.rondaVista + 1);
            this.render();
        } else if (act === 'avanzar-bye') {
            CopaCore.avanzarPasoCopa(this.copa);
            this._postAvanceCopa('Octavos simulados. ¡Ya tenés rival en Cuartos!');
        } else if (act === 'jugar') {
            this.jugarPartidoActual();
        } else if (act === 'simular-llave') {
            this.simularLlaveActual();
        } else if (act === 'simular-resto') {
            CopaCore.simularRestoCopa(this.copa);
            this._verificarCierreCopa();
            CopaStore.guardarActual(this.copa);
            this.rondaVista = this.copa.rondas.length - 1;
            this.render();
            this._mostrarAviso(`Copa finalizada. Campeón: ${this._eq(this.copa.campeon).nombre}`);
        } else if (act === 'ir-supercopa') {
            this.ocultar();
            if (this.game.supercopa) this.game.supercopa.abrirMenu();
        } else if (act === 'ir-club') {
            if (typeof this.game._abrirMiClub === 'function') {
                this.ocultar();
                this.game._abrirMiClub('copa', this.copa ? this.copa.miEquipo : '');
            }
        } else if (act === 'ir-liga') {
            this.ocultar();
            if (this.game.liga) this.game.liga.abrirMenu();
        } else if (act === 'nueva') {
            this.ocultar();
            this._elegirFormato();
        } else if (act === 'menu') {
            this.volverAlMenu();
        }
    }

    _verificarCierreCopa(marcadorFinal = '') {
        const C = this.copa;
        if (!CopaCore.terminada(C) || C._historialAnunciado) return;
        C._historialAnunciado = true;
        CopaStore.registrarHistorial(C);
        CarreraStore.registrarTituloCompeticion({
            tipo: 'copa',
            campeonId: C.campeon,
            subcampeonId: C.subcampeon || '',
            esUsuario: C.campeon === C.miEquipo,
            marcador: marcadorFinal,
        });
    }

    _postAvanceCopa(msg) {
        this._verificarCierreCopa();
        CopaStore.guardarActual(this.copa);
        this.rondaVista = Math.min(this.copa.rondaActual, this.copa.rondas.length - 1);
        this.render();
        if (msg) this._mostrarAviso(msg);
    }

    jugarPartidoActual() {
        const C = this.copa;
        const g = this.game;
        const info = CopaCore.partidoUsuarioActual(C);
        if (!info || !info.partido) return;
        const m = info.partido;
        const rival = m.l === C.miEquipo ? m.v : m.l;
        g.seleccion.local = C.miEquipo;
        g.seleccion.rival = rival;
        g.seleccion.dificultad = C.dificultad;
        g.modoLiga = null;
        g.modoSupercopa = null;
        g.modoCopa = {
            rondaNombre: info.ronda.nombre,
            esFinal: info.ronda.slots === 2,
            registrado: false,
        };
        this.ocultar();
        g._startMatchFromMenu();
    }

    simularLlaveActual() {
        const C = this.copa;
        const info = CopaCore.partidoUsuarioActual(C);
        if (!info || !info.partido) return;
        const m = info.partido;
        const rival = m.l === C.miEquipo ? m.v : m.l;
        CopaCore.avanzarPasoCopa(C);
        const soyLocal = m.l === C.miEquipo;
        const gm = soyLocal ? m.gl : m.gv;
        const gr = soyLocal ? m.gv : m.gl;
        const soyA = info.llave.a === C.miEquipo;
        const pen = info.llave.penales
            ? {
                  golesMios: soyA ? info.llave.penales.pa : info.llave.penales.pb,
                  golesOtro: soyA ? info.llave.penales.pb : info.llave.penales.pa,
              }
            : null;

        this._verificarCierreCopa(`${gm}-${gr}`);
        CopaStore.guardarActual(C);

        CarreraStore.procesarPartido({
            modo: 'copa',
            miEquipoId: C.miEquipo,
            rivalId: rival,
            nombreMio: this._eq(C.miEquipo).corto,
            nombreRival: this._eq(rival).corto,
            golesMios: gm,
            golesOtro: gr,
            penales: pen,
            esFinal: info.ronda.slots === 2,
            esEliminatoria: true,
            tituloGanado: C.campeon === C.miEquipo,
            infoCopa: {
                esFinal: info.ronda.slots === 2,
                campeon: C.campeon === C.miEquipo,
                eliminado: info.llave.ganador !== C.miEquipo,
                rondaSiguiente: CopaCore.rondaActiva(C)?.nombre || '',
            },
            contextoTorneo: `COPA CHAQUITO · ${info.ronda.nombre}`,
            azarConferencia: () => 1, // al simular rápido no interrumpir con conferencia
        });

        this.rondaVista = Math.min(C.rondaActual, C.rondas.length - 1);
        this.render();
        this._mostrarAviso(`Resultado simulado: ${gm}-${gr}${pen ? ` (${pen.golesMios}-${pen.golesOtro} pen.)` : ''}`);
    }

    registrarJugado(golesMios, golesRival, penalesUsuario = null) {
        const C = this.copa;
        if (!C) return null;
        const res = CopaCore.registrarPartidoUsuario(C, golesMios, golesRival, penalesUsuario);
        if (!res) return null;
        const marc = penalesUsuario
            ? `${golesMios}-${golesRival} (${penalesUsuario.golesMios}-${penalesUsuario.golesOtro}p)`
            : `${golesMios}-${golesRival}`;
        this._verificarCierreCopa(marc);
        CopaStore.guardarActual(C);
        this.rondaVista = Math.min(C.rondaActual, C.rondas.length - 1);
        this.aviso = res.campeon
            ? '🏆 ¡Campeón de la Copa Chaquito!'
            : res.ganoLlave
            ? `¡Clasificado a ${res.rondaSiguiente}!`
            : 'Fin de participación en Copa Chaquito.';
        return res;
    }

    volverAlMenu() {
        this.ocultar();
        this.game._showMainMenu();
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.CopaCore = CopaCore;
    globalThis.CopaStore = CopaStore;
    globalThis.CopaModo = CopaModo;
}

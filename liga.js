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

import { generarObjetivosTemporada, actualizarObjetivosLiga } from './career/objetivos.js';
import { CarreraStore } from './career/store.js';
import { rivalidadesDeEquipo } from './career/rivalidades.js';
import { registrarStatsPartidoEnLiga, calcularPremiosTemporada } from './career/premios.js';
import { construirHojaRutaTemporada } from './career/balance_temporada.js';

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
        const tieneClasicoEnLiga = rivalidadesDeEquipo(
            CarreraStore.leer().rivalidades,
            miEquipo
        ).some(r => r.esClasico && ids.indexOf(r.rivalId) >= 0);
        const objetivos = generarObjetivosTemporada({
            miEquipo,
            estrellas: estrellas[miEquipo] || 3,
            totalFechas: rondas.length,
            totalEquipos: ids.length,
            tieneClasico: tieneClasicoEnLiga
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
            fechaActual: 0,
            objetivos
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
        registrarStatsPartidoEnLiga(liga, {
            equipoLocal: m.l,
            equipoRival: m.v,
            gl: m.gl,
            gv: m.gv
        });
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

    function resumenImpacto(liga, tablaAntes, fechaJugada) {
        const tDespues = tabla(liga);
        const idxAntes = Array.isArray(tablaAntes) ? tablaAntes.findIndex(r => r.id === liga.miEquipo) : -1;
        const idxDesp = tDespues.findIndex(r => r.id === liga.miEquipo);
        const filaAntes = idxAntes >= 0 ? tablaAntes[idxAntes] : { pts: 0, dg: 0, gf: 0, gc: 0, pj: 0 };
        const filaDesp = idxDesp >= 0 ? tDespues[idxDesp] : { pts: 0, dg: 0, gf: 0, gc: 0, pj: 0 };
        const posAntes = idxAntes >= 0 ? idxAntes + 1 : idxDesp + 1;
        const posDespues = idxDesp >= 0 ? idxDesp + 1 : 1;

        let proximo = null;
        const fin = terminada(liga);
        if (fin) {
            proximo = {
                terminada: true,
                campeonId: tDespues[0] ? tDespues[0].id : liga.miEquipo,
                salioCampeon: posDespues === 1,
            };
        } else {
            const sig = partidoUsuario(liga, liga.fechaActual);
            if (!sig || sig.libre) {
                proximo = { libre: true, fecha: liga.fechaActual + 1, totalFechas: liga.fixture.length };
            } else {
                proximo = {
                    libre: false,
                    rivalId: sig.l === liga.miEquipo ? sig.v : sig.l,
                    esLocal: sig.l === liga.miEquipo,
                    fecha: liga.fechaActual + 1,
                    totalFechas: liga.fixture.length,
                };
            }
        }

        return {
            miEquipo: liga.miEquipo,
            fechaJugada: (Number(fechaJugada) || 0) + 1,
            totalFechas: liga.fixture.length,
            totalEquipos: liga.equipos.length,
            posAntes,
            posDespues,
            deltaPos: posAntes - posDespues,
            ptsAntes: filaAntes.pts || 0,
            ptsDespues: filaDesp.pts || 0,
            deltaPts: (filaDesp.pts || 0) - (filaAntes.pts || 0),
            dgAntes: filaAntes.dg || 0,
            dgDespues: filaDesp.dg || 0,
            liderAntesId: Array.isArray(tablaAntes) && tablaAntes[0] ? tablaAntes[0].id : '',
            liderId: tDespues[0] ? tDespues[0].id : liga.miEquipo,
            liderPts: tDespues[0] ? tDespues[0].pts : 0,
            proximo,
        };
    }

    function asegurarObjetivos(liga) {
        if (!liga) return null;
        if (!liga.objetivos || !liga.objetivos.principal) {
            const tieneClasicoEnLiga = rivalidadesDeEquipo(
                CarreraStore.leer().rivalidades,
                liga.miEquipo
            ).some(r => r.esClasico && liga.equipos.indexOf(r.rivalId) >= 0);
            liga.objetivos = generarObjetivosTemporada({
                miEquipo: liga.miEquipo,
                estrellas: (liga.estrellas && liga.estrellas[liga.miEquipo]) || estrellasDeEquipo(liga.miEquipo),
                totalFechas: liga.fixture.length,
                totalEquipos: liga.equipos.length,
                tieneClasico: tieneClasicoEnLiga
            });
        }
        return liga.objetivos;
    }

    function actualizarObjetivosTrasFecha(liga, { gf = 0, gc = 0, esClasico = false, fueLibre = false } = {}) {
        asegurarObjetivos(liga);
        const t = tabla(liga);
        const pos = t.findIndex(r => r.id === liga.miEquipo) + 1;
        const fin = terminada(liga);
        if (fueLibre) {
            // En fecha libre solo se actualiza posición en tabla y cierre si era la última fecha
            liga.objetivos.principal.progreso = pos;
            if (fin) {
                liga.objetivos = actualizarObjetivosLiga(liga.objetivos, {
                    gf: 0,
                    gc: 1, // evita sumar valla invicta ficticia en fecha libre
                    esClasico: false,
                    posicionActual: pos,
                    terminada: true
                });
            }
            return liga.objetivos;
        }
        liga.objetivos = actualizarObjetivosLiga(liga.objetivos, {
            gf,
            gc,
            esClasico,
            posicionActual: pos,
            terminada: fin
        });
        return liga.objetivos;
    }

    function premiosDeLiga(liga) {
        if (!liga) return null;
        if (!liga.premios) {
            liga.premios = calcularPremiosTemporada(liga, tabla(liga));
        }
        return liga.premios;
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
        terminada, jugado, valida, poisson, resumenImpacto,
        asegurarObjetivos, actualizarObjetivosTrasFecha, premiosDeLiga,
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

        let html = '<h2>LIGA Y COMPETICIONES</h2><p>Temporada de Liga, Copa Chaquito y Supercopa Oficial.</p>';
        if (actual) {
            html += '<button type="button" class="action-btn" id="lg-cont">CONTINUAR LIGA</button>'
                + '<p class="lg-mini">' + this._esc(this._eq(actual.miEquipo).nombre) + ' · '
                + this._progreso(actual) + '</p>';
        }
        html += '<button type="button" class="action-btn' + (actual ? ' secondary' : '') + '" id="lg-nueva">NUEVA TEMPORADA DE LIGA</button>';
        if (actual) html += '<p class="lg-mini">Una liga nueva reemplaza a la actual. Guardala antes si querés conservarla.</p>';
        if (guardados.length) html += '<button type="button" class="action-btn secondary" id="lg-guardados">TORNEOS GUARDADOS (' + guardados.length + ')</button>';
        if (g.copa) html += '<button type="button" class="action-btn secondary" id="lg-ir-copa">🏆 COPA CHAQUITO</button>';
        if (g.supercopa) {
            const disp = g.supercopa.disponible();
            html += '<button type="button" class="action-btn' + (disp ? '' : ' secondary') + '" id="lg-ir-supercopa">⭐ SUPERCOPA CHAQUITO' + (disp ? ' (¡LISTA!)' : '') + '</button>';
        }
        html += '<button type="button" class="action-btn secondary" id="dialog-close">VOLVER</button>';

        this._dialogo(html, {
            'lg-cont': cerrar => {
                cerrar();
                LigaCore.asegurarObjetivos(actual);
                this.liga = actual;
                this._abrirPantalla();
            },
            'lg-nueva': () => this._elegirFormato(),
            'lg-guardados': () => this._listaGuardados(),
            'lg-ir-copa': cerrar => { cerrar(); if (g.copa) g.copa.abrirMenu(); },
            'lg-ir-supercopa': cerrar => { cerrar(); if (g.supercopa) g.supercopa.abrirMenu(); },
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

    // Lo llama Game._pickTactica cuando se está armando una liga nueva.
    crearNueva(miEquipo, dificultad) {
        CarreraStore.fijarClubActual(miEquipo);
        CarreraStore.descansarClub(miEquipo, 'pretemporada');
        this.liga = LigaCore.crear({
            ids: this._ids(), miEquipo, dificultad, formato: this.game._formatoLiga || 'ida'
        });
        LigaStore.guardarActual(this.liga);
        this.tab = 'tabla';
        this.aviso = '';
        this._abrirPantalla();
        this._mostrarModalObjetivosPretemporada();
    }

    /**
     * Etapa 8: presenta el Objetivo Principal y los Secundarios antes de arrancar la temporada.
     */
    _mostrarModalObjetivosPretemporada() {
        const L = this.liga;
        if (!L) return;
        const obj = LigaCore.asegurarObjetivos(L);
        if (!obj || obj.presentados) return;
        obj.presentados = true;
        LigaStore.guardarActual(L);

        const eq = this._eq(L.miEquipo);
        const secHtml = (obj.secundarios || [])
            .map(s => `<div class="obj-pre-item"><span>• ${this._esc(s.titulo)}</span></div>`)
            .join('');

        this._dialogo(
            `<h2>🎯 OBJETIVOS DE TEMPORADA</h2>`
            + `<p>La directiva de <b>${this._esc(eq.nombre)}</b> fijó las metas para esta Liga:</p>`
            + `<div class="obj-pre-main"><span>OBJETIVO PRINCIPAL</span><b>${this._esc(obj.principal.titulo)}</b></div>`
            + `<div class="obj-pre-sec"><div class="pm-sec-title">OBJETIVOS SECUNDARIOS</div>${secHtml}</div>`
            + `<p class="lg-mini">Cumplir objetivos otorga prestigio y mejora tu Reputación e Hinchada.</p>`
            + `<button type="button" class="action-btn" id="obj-arrancar">¡COMENZAR TEMPORADA!</button>`,
            {
                'obj-arrancar': cerrar => cerrar()
            }
        );
    }

    /**
     * Etapa 18: Ceremonia oficial de Premios de Temporada al terminar la Liga.
     */
    _mostrarCeremoniaPremios() {
        const L = this.liga;
        if (!L || !LigaCore.terminada(L)) return;
        const pr = LigaCore.premiosDeLiga(L);
        if (!pr) return;

        const content = document.getElementById('dialog-content');
        if (content) content.classList.add('rk-wide');

        const nomClub = id => this._esc(this._eq(id).corto);
        const filaPremio = (icono, titulo, principal, sub) =>
            `<div class="aw-card">`
            + `<div class="aw-ico">${icono}</div>`
            + `<div class="aw-info"><span>${titulo}</span><b>${principal}</b><small>${sub}</small></div>`
            + `</div>`;

        const pAno = pr.partidoDelAno;
        const html =
            `<h2>🏅 PREMIOS DE LA TEMPORADA</h2>`
            + `<p class="lg-mini">Ceremonia oficial de cierre de la Liga Chaquito F8</p>`
            + `<div class="aw-grid">`
            + filaPremio('🏆', 'CAMPEÓN OFICIAL', nomClub(pr.campeon.equipoId), `${pr.campeon.puntos} PTS · ${pr.campeon.gf} GF · DG ${pr.campeon.dg >= 0 ? '+' + pr.campeon.dg : pr.campeon.dg}`)
            + filaPremio('⭐', 'MEJOR JUGADOR', `${this._esc(pr.mejorJugador.nombre)} (${nomClub(pr.mejorJugador.equipoId)})`, this._esc(pr.mejorJugador.resumen))
            + filaPremio('👟', 'BOTÍN DE ORO', `${this._esc(pr.botinDeOro.nombre)} (${nomClub(pr.botinDeOro.equipoId)})`, `${pr.botinDeOro.goles} goles convertidos`)
            + filaPremio('🧤', 'MEJOR ARQUERO', `${this._esc(pr.mejorArquero.nombre)} (${nomClub(pr.mejorArquero.equipoId)})`, `${pr.mejorArquero.vallasInvictas} vallas invictas · ${pr.mejorArquero.atajadas} atajadas`)
            + filaPremio('🎯', 'MEJOR ASISTENTE', `${this._esc(pr.mejorAsistente.nombre)} (${nomClub(pr.mejorAsistente.equipoId)})`, `${pr.mejorAsistente.asistencias} pases de gol`)
            + filaPremio('🚀', 'EQUIPO REVELACIÓN', nomClub(pr.equipoRevelacion.equipoId), `${pr.equipoRevelacion.posicionFinal}° puesto (${pr.equipoRevelacion.puntos} PTS · ${pr.equipoRevelacion.estrellas}★)`)
            + filaPremio('🔥', 'PARTIDO DEL AÑO', `${nomClub(pAno.localId)} ${pAno.gl}-${pAno.gv} ${nomClub(pAno.rivalId)}`, `Fecha ${pAno.fecha} · ${this._esc(pAno.etiqueta)}`)
            + filaPremio('⚡', 'MEJOR RACHA', nomClub(pr.mejorRacha.equipoId), this._esc(pr.mejorRacha.detalle))
            + `</div>`
            + `<button type="button" class="action-btn" id="aw-cerrar">GUARDAR EN VITRINA Y CONTINUAR</button>`;

        this._dialogo(html, {
            'aw-cerrar': cerrar => {
                if (content) content.classList.remove('rk-wide');
                cerrar();
            }
        });
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
            LigaCore.asegurarObjetivos(this.liga);
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
        LigaCore.asegurarObjetivos(L);
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
        if (g.copa) g.copa.ocultar();
        const clubScr = document.getElementById('club-screen');
        if (clubScr) clubScr.hidden = true;
        const dialog = document.getElementById('menu-dialog');
        if (dialog) dialog.classList.remove('open');
        this.root.hidden = false;
        this.render();
        this.root.scrollTop = 0;
        if (this.aviso) this._mostrarAviso(this.aviso);
        if (this.liga && LigaCore.terminada(this.liga) && this.liga._ceremoniaPendiente) {
            this.liga._ceremoniaPendiente = false;
            LigaStore.guardarActual(this.liga);
            this._mostrarCeremoniaPremios();
        }
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
        LigaCore.asegurarObjetivos(L);
        const total = L.fixture.length;
        const fin = LigaCore.terminada(L);
        const sub = fin
            ? 'LIGA TERMINADA'
            : 'FECHA ' + (L.fechaActual + 1) + ' DE ' + total;

        const stCarrera = CarreraStore.leer();
        const ultNoticia = stCarrera.noticias && stCarrera.noticias[0];
        const tickerHtml = ultNoticia
            ? `<button type="button" class="lg-news-ticker" data-act="abrir-noticias" title="Abrir Diario Chaquito">`
              + `<span class="nw-tag">${this._esc(ultNoticia.etiqueta || 'PRENSA')}</span>`
              + `<span class="lg-news-txt">${this._esc(ultNoticia.titular)}</span>`
              + `</button>`
            : '';

        const mProx = !fin ? LigaCore.partidoUsuario(L, L.fechaActual) : null;
        const rivProxId = mProx && !mProx.libre ? (mProx.l === L.miEquipo ? mProx.v : mProx.l) : '';
        const hojaRuta = construirHojaRutaTemporada({
            liga: L,
            tabla: LigaCore.tabla(L),
            rivalProximoId: rivProxId,
            carrera: stCarrera,
            copaActual: this.game.copa && this.game.copa.copa,
            supercopaDisponible: !!(this.game.supercopa && this.game.supercopa.disponible()),
        });
        let rutaHtml = '';
        if (hojaRuta) {
            const pasosHtml = hojaRuta.pasos
                .map(p => `<span class="lg-step ${p.activo ? 'on' : (p.hecho ? 'done' : '')}">${this._esc(p.corto)}</span>`)
                .join('');
            const copaCallout = hojaRuta.sugerenciaCopa
                ? `<button type="button" class="lg-copa-hint" data-act="ir-copa">${this._esc(hojaRuta.sugerenciaCopa)} →</button>`
                : '';
            rutaHtml = `<div class="lg-season-strip ${hojaRuta.momentoImportante ? 'hot' : ''}">`
                + `<div class="lg-season-steps" aria-label="Etapas de la temporada">${pasosHtml}</div>`
                + `<div class="lg-season-msg"><b>${this._esc(hojaRuta.etapaTitulo)}</b> — ${this._esc(hojaRuta.mensajeNarrativo)}</div>`
                + copaCallout
                + `</div>`;
        }

        let h = '<div class="lg-wrap"><div class="lg-toast" role="status"></div>'
            + '<h2 class="lg-title">LIGA CHAQUITO F8</h2>'
            + '<p class="lg-sub">' + sub + ' · DIFICULTAD ' + this._dif(L.dificultad) + ' · ' + (L.formato === 'idayvuelta' ? 'IDA Y VUELTA' : 'SOLO IDA') + '</p>'
            + rutaHtml
            + tickerHtml;

        h += fin ? this._tarjetaFinal() : this._tarjetaProximo(hojaRuta);

        h += '<div class="lg-tabs lg-tabs-4" role="tablist">'
            + '<button type="button" role="tab" data-act="tab-tabla" class="' + (this.tab === 'tabla' ? 'on' : '') + '">TABLA</button>'
            + '<button type="button" role="tab" data-act="tab-fechas" class="' + (this.tab === 'fechas' ? 'on' : '') + '">FECHAS</button>'
            + '<button type="button" role="tab" data-act="tab-objetivos" class="' + (this.tab === 'objetivos' ? 'on' : '') + '">OBJETIVOS</button>'
            + '<button type="button" role="tab" data-act="abrir-noticias">DIARIO</button></div>';

        if (this.tab === 'fechas') h += this._htmlFechas();
        else if (this.tab === 'objetivos') h += this._htmlObjetivos();
        else h += this._htmlTabla();

        h += '<div class="lg-actions">'
            + (fin && this.game.supercopa && this.game.supercopa.disponible()
                ? '<button type="button" class="action-btn" data-act="ir-supercopa">⭐ JUGAR SUPERCOPA CHAQUITO</button>'
                : '')
            + '<button type="button" class="action-btn" data-act="guardar">GUARDAR TORNEO</button>'
            + '<button type="button" class="action-btn secondary" data-act="ir-club">🏛 MI CLUB</button>'
            + '<button type="button" class="action-btn secondary" data-act="ir-copa">🏆 COPA CHAQUITO</button>'
            + '<button type="button" class="action-btn secondary" data-act="nueva">NUEVA LIGA</button>'
            + '<button type="button" class="action-btn secondary" data-act="menu">MENÚ PRINCIPAL</button></div></div>';
        this.root.innerHTML = h;
    }

    _tarjetaProximo(hojaRuta = null) {
        const L = this.liga;
        const m = LigaCore.partidoUsuario(L, L.fechaActual);
        const forma = CarreraStore.formaDeClub(L.miEquipo);
        const descansosRestantes = Math.max(0, 3 - (L._descansosUsadosLiga || 0));
        const chipForma = `<div class="cp-riv-tag" style="border-color:${forma.color};color:${forma.color};margin-bottom:4px">${this._esc(forma.textoCorto)}</div>`;
        if (!m || m.libre) {
            const quien = LigaCore.libreDe(L.fixture[L.fechaActual]);
            const nombre = quien ? this._esc(this._eq(quien).corto) : 'Tu equipo';
            return '<div class="lg-next">'
                + '<div class="lg-next-label">FECHA LIBRE · RECUPERACIÓN AUTOMÁTICA</div>'
                + chipForma
                + '<p>' + nombre + ' descansa esta fecha y recupera piernas frescas. El resto de los partidos se simula.</p>'
                + '<button type="button" class="action-btn" data-act="pasar-libre">CONTINUAR Y RECUPERAR PLANTEL</button></div>';
        }
        const rival = m.l === L.miEquipo ? m.v : m.l;
        const rivInfo = CarreraStore.rivalidadEntre(L.miEquipo, rival);
        const dueloTxt = hojaRuta && hojaRuta.dueloDirectoTexto ? ` · ${this._esc(hojaRuta.dueloDirectoTexto)}` : '';
        const rivChip = rivInfo.esClasico
            ? `<div class="cp-riv-tag clasico">🔥 ${this._esc(rivInfo.etiqueta)} · ${this._esc(rivInfo.textoNivel)}${dueloTxt}</div>`
            : `<div class="cp-riv-tag">${this._esc(rivInfo.textoNivel)}${dueloTxt}</div>`;
        const btnDescanso =
            forma.fatiga >= 22 && descansosRestantes > 0 && L._ultimoDescansoFecha !== L.fechaActual
                ? `<button type="button" class="action-btn secondary" data-act="descansar-plantel">🧘 SESIÓN DE RECUPERACIÓN (${descansosRestantes} DISP.)</button>`
                : '';

        return '<div class="lg-next">'
            + '<div class="lg-next-label">TU PRÓXIMO PARTIDO</div>'
            + rivChip
            + chipForma
            + '<div class="lg-vs">'
            + '<span class="lg-vs-t">' + this._badge(m.l, 'lg-badge big') + '<b>' + this._esc(this._eq(m.l).corto) + '</b></span>'
            + '<span class="lg-vs-x">VS</span>'
            + '<span class="lg-vs-t">' + this._badge(m.v, 'lg-badge big') + '<b>' + this._esc(this._eq(m.v).corto) + '</b></span></div>'
            + '<button type="button" class="action-btn" data-act="jugar">JUGAR PARTIDO</button>'
            + btnDescanso
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

        let evalObj = '';
        if (L.objetivos && L.objetivos.resumenFinal) {
            const rf = L.objetivos.resumenFinal;
            evalObj = `<p class="lg-mini" style="margin-top:6px;color:#ffcc00">Objetivos cumplidos: <b>${rf.cumplidos}/${rf.total}</b> · Objetivo principal: <b>${rf.principalCumplido ? '✓ LOGRADO' : '✕ NO ALCANZADO'}</b></p>`;
        }
        const botonesFin =
            `<button type="button" class="action-btn" data-act="ver-premios" style="margin-top:8px">🏅 VER CEREMONIA DE PREMIOS</button>`
            + `<div class="sc-row2" style="margin-top:8px">`
            + `<button type="button" class="action-btn secondary cfg-mini" data-act="ir-palmares">🏆 VER PALMARÉS Y RÉCORDS</button>`
            + `<button type="button" class="action-btn cfg-mini" data-act="nueva-mismo-club">🔄 NUEVA TEMPORADA (${this._esc(this._eq(L.miEquipo).corto)})</button>`
            + `</div>`;
        return '<div class="lg-next lg-final"><div class="lg-final-t">' + titulo + '</div><p>' + detalle + '</p>' + evalObj + botonesFin + '</div>';
    }

    _htmlObjetivos() {
        const L = this.liga;
        const obj = LigaCore.asegurarObjetivos(L);
        const t = LigaCore.tabla(L);
        const posActual = t.findIndex(r => r.id === L.miEquipo) + 1;

        const badgeEstado = est =>
            est === 'cumplido'
                ? '<span class="obj-pill ok">✓ CUMPLIDO</span>'
                : est === 'fallado'
                ? '<span class="obj-pill fail">✕ FALLADO</span>'
                : '<span class="obj-pill run">EN CURSO</span>';

        const p = obj.principal;
        const posMostrar = p.progreso || posActual;
        const okPosNow = posMostrar <= p.meta;

        let h = `<div class="obj-list">`;
        h += `<div class="obj-card main ${p.estado}">`
            + `<div class="obj-head"><span>★ OBJETIVO PRINCIPAL</span>${badgeEstado(p.estado)}</div>`
            + `<div class="obj-title">${this._esc(p.titulo)}</div>`
            + `<div class="obj-sub">Posición actual: <b>${posMostrar}°</b> (Meta: Top ${p.meta})</div>`
            + `<div class="nw-rep-bar"><i style="width:${okPosNow ? 100 : Math.max(20, 100 - (posMostrar - p.meta) * 15)}%;background:${okPosNow ? '#48e078' : '#ffcc00'}"></i></div>`
            + `</div>`;

        for (const s of obj.secundarios || []) {
            const pct = Math.max(0, Math.min(100, Math.round(((s.progreso || 0) / Math.max(1, s.meta)) * 100)));
            h += `<div class="obj-card ${s.estado}">`
                + `<div class="obj-head"><span>OBJETIVO SECUNDARIO</span>${badgeEstado(s.estado)}</div>`
                + `<div class="obj-title">${this._esc(s.titulo)}</div>`
                + `<div class="obj-sub">Progreso: <b>${s.progreso || 0} / ${s.meta}</b></div>`
                + `<div class="nw-rep-bar"><i style="width:${pct}%;background:${s.estado === 'cumplido' ? '#48e078' : '#3a9bff'}"></i></div>`
                + `</div>`;
        }
        h += `</div>`;
        return h;
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
            case 'tab-objetivos': this.tab = 'objetivos'; this.render(); break;
            case 'ver-premios': this._mostrarCeremoniaPremios(); break;
            case 'abrir-noticias':
                if (typeof this.game._abrirPantallaNoticias === 'function') {
                    this.ocultar();
                    this.game._abrirPantallaNoticias('liga');
                }
                break;
            case 'ir-club':
                if (typeof this.game._abrirMiClub === 'function') {
                    this.ocultar();
                    this.game._abrirMiClub('liga', L ? L.miEquipo : '');
                }
                break;
            case 'ir-palmares':
                if (typeof this.game._abrirMiClub === 'function') {
                    this.ocultar();
                    this.game._miClubTab = 'palmares';
                    this.game._abrirMiClub('liga', L ? L.miEquipo : '');
                }
                break;
            case 'nueva-mismo-club':
                if (L) {
                    LigaStore.guardar(L);
                    this.game._formatoLiga = L.formato || 'ida';
                    this.crearNueva(L.miEquipo, L.dificultad || 'normal');
                }
                break;
            case 'ir-copa':
                this.ocultar();
                if (this.game.copa) this.game.copa.abrirMenu();
                break;
            case 'ir-supercopa':
                this.ocultar();
                if (this.game.supercopa) this.game.supercopa.abrirMenu();
                break;
            case 'fecha-prev': this.fechaVista = Math.max(0, this.fechaVista - 1); this.render(); break;
            case 'fecha-next': this.fechaVista = Math.min(L.fixture.length - 1, this.fechaVista + 1); this.render(); break;
            case 'jugar': this.jugarPartidoActual(); break;
            case 'descansar-plantel':
                if (L && (L._descansosUsadosLiga || 0) < 3 && L._ultimoDescansoFecha !== L.fechaActual) {
                    L._descansosUsadosLiga = (L._descansosUsadosLiga || 0) + 1;
                    L._ultimoDescansoFecha = L.fechaActual;
                    const nuevoEst = CarreraStore.descansarClub(L.miEquipo, 'descanso');
                    LigaStore.guardarActual(L);
                    this.render();
                    this._mostrarAviso(`Plantel recuperado: ${nuevoEst.textoCorto}`);
                }
                break;
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
        g.modoCopa = null;
        g.modoSupercopa = null;
        g.modoDesafio = null;
        g.modoArcade = null;
        g.modoHistoria = null;
        g.modoLiga = { fecha: L.fechaActual, registrado: false };
        this.ocultar();
        g._startMatchFromMenu();
    }

    _verificarCierreTemporadaLiga() {
        const L = this.liga;
        if (!L || !LigaCore.terminada(L) || L._cierreRegistrado) return;
        L._cierreRegistrado = true;
        L._ceremoniaPendiente = true;
        const t = LigaCore.tabla(L);
        const pos = t.findIndex(r => r.id === L.miEquipo) + 1;
        const campeonId = t[0] ? t[0].id : L.miEquipo;
        const subcampeonId = t[1] ? t[1].id : '';
        CarreraStore.registrarTituloCompeticion({
            tipo: 'liga',
            campeonId,
            subcampeonId,
            esUsuario: pos === 1,
            marcador: `${t[0] ? t[0].pts : 0} PTS`
        });
        const premios = LigaCore.premiosDeLiga(L);
        if (premios) {
            CarreraStore.registrarPremiosTemporada(premios);
        }
        const filaMio = t.find(r => r.id === L.miEquipo) || { pts: 0, gf: 0, gc: 0 };
        const rf = L.objetivos && L.objetivos.resumenFinal;
        CarreraStore.registrarTemporadaLiga({
            ligaId: L.id,
            miEquipo: L.miEquipo,
            posicionFinal: pos,
            puntos: filaMio.pts,
            gf: filaMio.gf,
            gc: filaMio.gc,
            campeonId,
            mejorJugador: premios && premios.mejorJugador ? premios.mejorJugador.nombre : null,
            botinDeOro: premios && premios.botinDeOro ? `${premios.botinDeOro.nombre} (${premios.botinDeOro.goles})` : null,
            cumplidos: rf ? rf.cumplidos : 0,
            total: rf ? rf.total : 0,
            principalCumplido: rf ? rf.principalCumplido : false,
            recompensaReputacion: rf ? rf.recompensaReputacion : null
        });
    }

    // Lo llama Game.update cuando termina el partido de la liga (goles propios y del rival).
    registrarJugado(golesMios, golesRival, statsSerializados = null) {
        const L = this.liga;
        if (!L) return null;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || m.libre || LigaCore.jugado(m)) return null;
        const rival = m.l === L.miEquipo ? m.v : m.l;
        const esClasico = CarreraStore.rivalidadEntre(L.miEquipo, rival).esClasico;
        const tablaAntes = LigaCore.tabla(L);
        const local = m.l === L.miEquipo;
        m.gl = local ? golesMios : golesRival;
        m.gv = local ? golesRival : golesMios;
        registrarStatsPartidoEnLiga(L, {
            equipoLocal: L.miEquipo,
            equipoRival: rival,
            gl: golesMios,
            gv: golesRival,
            statsSerializados
        });
        this._cerrarFecha(fecha, 'Fecha ' + (fecha + 1) + ' jugada. Se simularon los demás partidos.');
        LigaCore.actualizarObjetivosTrasFecha(L, { gf: golesMios, gc: golesRival, esClasico });
        this._verificarCierreTemporadaLiga();
        LigaStore.guardarActual(L);
        this.ultimoImpacto = LigaCore.resumenImpacto(L, tablaAntes, fecha);
        return this.ultimoImpacto;
    }

    simularPartidoActual() {
        const L = this.liga;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || m.libre || LigaCore.jugado(m)) return;
        const rival = m.l === L.miEquipo ? m.v : m.l;
        const esClasico = CarreraStore.rivalidadEntre(L.miEquipo, rival).esClasico;
        const tablaAntes = LigaCore.tabla(L);
        const formaMio = CarreraStore.formaDeClub(L.miEquipo);
        LigaCore.simularPartido(L, m);
        const local = m.l === L.miEquipo;
        if (formaMio.etiqueta === 'excelente' && Math.random() < 0.25) {
            if (local) m.gl = Math.min(6, m.gl + 1);
            else m.gv = Math.min(6, m.gv + 1);
        } else if (formaMio.etiqueta === 'cansado' && Math.random() < 0.22) {
            if (local) m.gv = Math.min(6, m.gv + 1);
            else m.gl = Math.min(6, m.gl + 1);
        }
        const gm = local ? m.gl : m.gv;
        const gr = local ? m.gv : m.gl;
        this._cerrarFecha(fecha, 'Fecha ' + (fecha + 1) + ' simulada.');
        LigaCore.actualizarObjetivosTrasFecha(L, { gf: gm, gc: gr, esClasico });
        this._verificarCierreTemporadaLiga();
        LigaStore.guardarActual(L);
        const imp = LigaCore.resumenImpacto(L, tablaAntes, fecha);
        CarreraStore.procesarPartido({
            modo: 'liga',
            miEquipoId: L.miEquipo,
            rivalId: rival,
            nombreMio: this._eq(L.miEquipo).corto,
            nombreRival: this._eq(rival).corto,
            golesMios: gm,
            golesOtro: gr,
            impactoLiga: imp,
            tituloGanado: !!(imp.proximo && imp.proximo.terminada && imp.proximo.salioCampeon),
            contextoTorneo: `LIGA · FECHA ${fecha + 1}`,
            azarConferencia: () => 1
        });
        this.render();
        if (this.aviso) this._mostrarAviso(this.aviso);
        if (L._ceremoniaPendiente) {
            L._ceremoniaPendiente = false;
            LigaStore.guardarActual(L);
            this._mostrarCeremoniaPremios();
        }
    }

    pasarFechaLibre() {
        const L = this.liga;
        const fecha = L.fechaActual;
        const m = LigaCore.partidoUsuario(L, fecha);
        if (!m || !m.libre) return;
        CarreraStore.descansarClub(L.miEquipo, 'fecha_libre');
        this._cerrarFecha(fecha, 'Fecha libre: el plantel descansó y se simularon los demás partidos.');
        LigaCore.actualizarObjetivosTrasFecha(L, { fueLibre: true });
        this._verificarCierreTemporadaLiga();
        LigaStore.guardarActual(L);
        this.render();
        if (this.aviso) this._mostrarAviso(this.aviso);
        if (L._ceremoniaPendiente) {
            L._ceremoniaPendiente = false;
            LigaStore.guardarActual(L);
            this._mostrarCeremoniaPremios();
        }
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

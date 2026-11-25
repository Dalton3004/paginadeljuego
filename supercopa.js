/**
 * ETAPA 11 — SUPERCOPA CHAQUITO.
 *
 * Enfrenta al Campeón vigente de Liga contra el Campeón vigente de Copa Chaquito
 * en una final única con branding especial, trofeo y resolución por penales si hay empate.
 *
 * REGLA OFICIAL DE DOBLETE:
 * Si el mismo equipo conquistó tanto la Liga como la Copa Chaquito, disputa la
 * Supercopa frente al Subcampeón de la Liga (respaldo: finalista de Copa).
 */

import { CarreraStore } from './career/store.js';
import { CopaCore } from './copa.js';

export const SupercopaCore = (() => {
    /**
     * Determina el cruce oficial de la Supercopa a partir de los campeones vigentes.
     */
    function armarCruce({ campeonLiga = null, campeonCopa = null, idsEquipos = [] } = {}) {
        if (!campeonLiga || !campeonLiga.equipoId || !campeonCopa || !campeonCopa.equipoId) {
            return {
                habilitada: false,
                faltaLiga: !(campeonLiga && campeonLiga.equipoId),
                faltaCopa: !(campeonCopa && campeonCopa.equipoId),
                campeonLigaId: campeonLiga ? campeonLiga.equipoId : null,
                campeonCopaId: campeonCopa ? campeonCopa.equipoId : null,
            };
        }

        const idLiga = campeonLiga.equipoId;
        const idCopa = campeonCopa.equipoId;
        const hayDoblete = idLiga === idCopa;

        let rivalDoblete = '';
        if (hayDoblete) {
            if (campeonLiga.subcampeonId && campeonLiga.subcampeonId !== idLiga) {
                rivalDoblete = campeonLiga.subcampeonId;
            } else if (campeonCopa.finalistaId && campeonCopa.finalistaId !== idLiga) {
                rivalDoblete = campeonCopa.finalistaId;
            } else {
                rivalDoblete = idsEquipos.find((x) => x !== idLiga) || '';
            }
        }

        const equipoA = idLiga; // Campeón de Liga (o bicampeón)
        const equipoB = hayDoblete ? rivalDoblete : idCopa; // Campeón de Copa o Subcampeón de Liga
        const claveEdicion = `${idLiga}_${campeonLiga.fecha || 0}__${idCopa}_${campeonCopa.fecha || 0}`;

        return {
            habilitada: Boolean(equipoA && equipoB && equipoA !== equipoB),
            claveEdicion,
            equipoA,
            equipoB,
            rolA: hayDoblete ? 'CAMPEÓN LIGA Y COPA' : 'CAMPEÓN DE LIGA',
            rolB: hayDoblete ? 'SUBCAMPEÓN DE LIGA' : 'CAMPEÓN DE COPA',
            hayDoblete,
            reglaAplicada: hayDoblete
                ? 'Doblete: al ganar Liga y Copa el mismo club, enfrenta al Subcampeón de la Liga.'
                : 'Cruce clásico: Campeón de Liga vs Campeón de Copa Chaquito.',
            usuarioParticipa: !!(campeonLiga.esUsuario || campeonCopa.esUsuario),
            miEquipoSugerido: campeonLiga.esUsuario
                ? idLiga
                : campeonCopa.esUsuario
                ? idCopa
                : null,
        };
    }

    function simularFinalIA(equipoA, equipoB, estA = 4, estB = 4) {
        const gl = Math.min(5, Math.floor(Math.random() * 3) + (estA >= estB ? 1 : 0));
        const gv = Math.min(5, Math.floor(Math.random() * 3) + (estB > estA ? 1 : 0));
        let penales = null;
        let campeon;
        if (gl > gv) campeon = equipoA;
        else if (gv > gl) campeon = equipoB;
        else {
            const [pa, pb] = CopaCore.simularTandaPenalesIA(estA, estB);
            penales = { pa, pb };
            campeon = pa > pb ? equipoA : equipoB;
        }
        return {
            equipoA,
            equipoB,
            gl,
            gv,
            penales,
            campeon,
            subcampeon: campeon === equipoA ? equipoB : equipoA,
        };
    }

    return {
        armarCruce,
        simularFinalIA,
    };
})();

export const SupercopaStore = (() => {
    const K_HIST = 'chaquito_supercopa_hist_v1';
    let mem = [];

    function historial() {
        try {
            if (typeof localStorage === 'undefined') return mem.slice();
            const raw = localStorage.getItem(K_HIST);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (_e) {
            return mem.slice();
        }
    }

    function registrarEdicion(ed) {
        const lista = historial().filter((x) => !ed.claveEdicion || x.claveEdicion !== ed.claveEdicion);
        lista.unshift({
            ...ed,
            fecha: Date.now(),
        });
        mem = lista.slice(0, 25);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(K_HIST, JSON.stringify(mem));
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    function yaJugada(claveEdicion) {
        if (!claveEdicion) return false;
        return historial().some((x) => x && x.claveEdicion === claveEdicion);
    }

    return { historial, registrarEdicion, yaJugada };
})();

function escSc(s) {
    if (typeof window !== 'undefined' && typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class SupercopaModo {
    constructor(game) {
        this.game = game;
    }

    _eq(id) {
        return (
            this.game._equipo(id) || {
                id,
                nombre: id || 'POR DEFINIR',
                corto: id || 'PENDIENTE',
                siglas: '?',
                colores: ['#555', '#222'],
            }
        );
    }

    _badge(id, cls = 'lg-badge big') {
        if (!id) return '<span class="sc-empty-shield">?</span>';
        return `<img class="${cls}" alt="" src="${escSc(this.game._badgeURL(this._eq(id)))}">`;
    }

    cruceActual() {
        const st = CarreraStore.leer();
        const ids = typeof EQUIPOS !== 'undefined' && Array.isArray(EQUIPOS) ? EQUIPOS.map((e) => e.id) : [];
        return SupercopaCore.armarCruce({
            campeonLiga: st.palmares.campeonLigaVigente,
            campeonCopa: st.palmares.campeonCopaVigente,
            idsEquipos: ids,
        });
    }

    disponible() {
        const c = this.cruceActual();
        return !!(c.habilitada && !SupercopaStore.yaJugada(c.claveEdicion));
    }

    abrirMenu() {
        const dialog = document.getElementById('menu-dialog');
        const content = document.getElementById('dialog-content');
        if (!dialog || !content) return;
        content.classList.add('rk-wide');
        content.classList.remove('cfg-wide', 'sc-wide');

        const c = this.cruceActual();
        const hist = SupercopaStore.historial();
        const yaDisputada = c.habilitada && SupercopaStore.yaJugada(c.claveEdicion);

        let html =
            `<div class="sup-modal">` +
            `<div class="sup-trophy" aria-hidden="true">🏆</div>` +
            `<h2>⭐ SUPERCOPA CHAQUITO</h2>` +
            `<p class="lg-mini">El duelo supremo entre el Campeón de Liga y el Campeón de Copa Chaquito.</p>`;

        if (!c.habilitada) {
            html +=
                `<div class="sup-status-box">` +
                `<div class="sup-slot"><span>CAMPEÓN LIGA</span><b>${c.campeonLigaId ? escSc(this._eq(c.campeonLigaId).nombre) : 'PENDIENTE'}</b></div>` +
                `<div class="sup-vs">VS</div>` +
                `<div class="sup-slot"><span>CAMPEÓN COPA</span><b>${c.campeonCopaId ? escSc(this._eq(c.campeonCopaId).nombre) : 'PENDIENTE'}</b></div>` +
                `</div>` +
                `<p class="lg-mini">Finalizá una temporada de <b>Liga</b> y una edición de <b>Copa Chaquito</b> para disputar la Supercopa Oficial.</p>` +
                (c.faltaLiga ? `<button type="button" class="action-btn" id="sup-ir-liga">IR A LA LIGA</button>` : '') +
                (c.faltaCopa ? `<button type="button" class="action-btn" id="sup-ir-copa">IR A LA COPA CHAQUITO</button>` : '');
        } else if (yaDisputada) {
            const ult = hist.find((x) => x.claveEdicion === c.claveEdicion) || hist[0];
            html +=
                `<div class="lg-next lg-final" style="margin-top:10px">` +
                `<div class="lg-final-t">🏆 SUPERCAMPEÓN VIGENTE: ${escSc(this._eq(ult.campeon).nombre)}</div>` +
                `<p>Venció ${ult.gl}-${ult.gv}${ult.penales ? ` (${ult.penales.pa}-${ult.penales.pb} pen.)` : ''} a ${escSc(this._eq(ult.subcampeon).nombre)}.</p>` +
                `<p class="lg-mini">Jugá una nueva Liga o Copa Chaquito para habilitar la próxima Supercopa.</p>` +
                `</div>`;
        } else {
            const eqA = this._eq(c.equipoA);
            const eqB = this._eq(c.equipoB);
            html +=
                `<div class="lg-next sup-card-gold" style="margin-top:10px">` +
                `<div class="lg-next-label">FINAL OFICIAL · PARTIDO ÚNICO</div>` +
                `<div class="lg-vs">` +
                `<span class="lg-vs-t">${this._badge(c.equipoA)}<b>${escSc(eqA.corto)}</b><small class="sup-role">${escSc(c.rolA)}</small></span>` +
                `<span class="lg-vs-x">VS</span>` +
                `<span class="lg-vs-t">${this._badge(c.equipoB)}<b>${escSc(eqB.corto)}</b><small class="sup-role">${escSc(c.rolB)}</small></span>` +
                `</div>` +
                `<p class="lg-mini">${escSc(c.reglaAplicada)}</p>` +
                (c.miEquipoSugerido
                    ? `<button type="button" class="action-btn" id="sup-jugar">⭐ JUGAR SUPERCOPA CON ${escSc(this._eq(c.miEquipoSugerido).corto)}</button>`
                    : `<button type="button" class="action-btn" id="sup-elegir-a">JUGAR CON ${escSc(eqA.corto)}</button>` +
                      `<button type="button" class="action-btn secondary" id="sup-simular">SIMULAR FINAL ENTRE IA</button>`) +
                `</div>`;
        }

        if (hist.length > 0) {
            html += `<div class="pm-sec-title" style="margin-top:12px">HISTORIAL DE SUPERCAMPEONES</div><div class="lg-matches">`;
            for (const hItem of hist.slice(0, 6)) {
                const penTxt = hItem.penales ? ` (${hItem.penales.pa}-${hItem.penales.pb}p)` : '';
                html +=
                    `<div class="lg-m">` +
                    `<span class="lg-m-t izq"><span>🏆 ${escSc(this._eq(hItem.campeon).corto)}</span></span>` +
                    `<span class="lg-m-sc"><b>${hItem.gl}-${hItem.gv}</b><small>${penTxt}</small></span>` +
                    `<span class="lg-m-t der"><span>${escSc(this._eq(hItem.subcampeon).corto)}</span></span>` +
                    `</div>`;
            }
            html += `</div>`;
        }

        html += `<button type="button" class="action-btn secondary" id="sup-cerrar">VOLVER</button></div>`;
        content.innerHTML = html;
        dialog.classList.add('open');

        const cerrar = () => {
            content.classList.remove('rk-wide');
            dialog.classList.remove('open');
        };
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', fn);
        };
        bind('sup-cerrar', cerrar);
        bind('sup-ir-liga', () => {
            cerrar();
            if (this.game.liga) this.game.liga.abrirMenu();
        });
        bind('sup-ir-copa', () => {
            cerrar();
            if (this.game.copa) this.game.copa.abrirMenu();
        });
        bind('sup-jugar', () => {
            cerrar();
            this.iniciarPartidoSupercopa(c, c.miEquipoSugerido);
        });
        bind('sup-elegir-a', () => {
            cerrar();
            this.iniciarPartidoSupercopa(c, c.equipoA);
        });
        bind('sup-simular', () => {
            const sim = SupercopaCore.simularFinalIA(
                c.equipoA,
                c.equipoB,
                this._eq(c.equipoA).estrellas || 4,
                this._eq(c.equipoB).estrellas || 4
            );
            SupercopaStore.registrarEdicion({
                claveEdicion: c.claveEdicion,
                ...sim,
            });
            CarreraStore.registrarTituloCompeticion({
                tipo: 'supercopa',
                campeonId: sim.campeon,
                subcampeonId: sim.subcampeon,
                esUsuario: false,
                marcador: `${sim.gl}-${sim.gv}`,
            });
            this.abrirMenu();
        });
    }

    iniciarPartidoSupercopa(cruce, miEquipoId) {
        const g = this.game;
        const rival = cruce.equipoA === miEquipoId ? cruce.equipoB : cruce.equipoA;
        g.seleccion.local = miEquipoId;
        g.seleccion.rival = rival;
        g.seleccion.dificultad = g.dificultadPreferida || g.seleccion.dificultad || 'normal';
        g.modoLiga = null;
        g.modoCopa = null;
        g.modoSupercopa = {
            claveEdicion: cruce.claveEdicion,
            miEquipo: miEquipoId,
            rival,
            hayDoblete: cruce.hayDoblete,
            rolMio: cruce.equipoA === miEquipoId ? cruce.rolA : cruce.rolB,
            rolRival: cruce.equipoA === miEquipoId ? cruce.rolB : cruce.rolA,
            registrado: false,
        };
        g._startMatchFromMenu();
    }

    registrarJugado(golesMios, golesRival, penalesUsuario = null) {
        const m = this.game.modoSupercopa;
        if (!m || m.registrado) return null;
        m.registrado = true;

        const ganoPenales = penalesUsuario && penalesUsuario.golesMios > penalesUsuario.golesOtro;
        const gano = golesMios > golesRival || ganoPenales;
        const campeon = gano ? m.miEquipo : m.rival;
        const subcampeon = gano ? m.rival : m.miEquipo;
        const penStore = penalesUsuario
            ? {
                  pa: gano ? Math.max(penalesUsuario.golesMios, penalesUsuario.golesOtro) : Math.min(penalesUsuario.golesMios, penalesUsuario.golesOtro),
                  pb: gano ? Math.min(penalesUsuario.golesMios, penalesUsuario.golesOtro) : Math.max(penalesUsuario.golesMios, penalesUsuario.golesOtro),
              }
            : null;

        SupercopaStore.registrarEdicion({
            claveEdicion: m.claveEdicion,
            equipoA: campeon,
            equipoB: subcampeon,
            gl: gano ? golesMios : golesRival,
            gv: gano ? golesRival : golesMios,
            penales: penStore,
            campeon,
            subcampeon,
        });

        const marc = penalesUsuario
            ? `${golesMios}-${golesRival} (${penalesUsuario.golesMios}-${penalesUsuario.golesOtro}p)`
            : `${golesMios}-${golesRival}`;

        CarreraStore.registrarTituloCompeticion({
            tipo: 'supercopa',
            campeonId: campeon,
            subcampeonId: subcampeon,
            esUsuario: gano,
            marcador: marc,
        });

        return {
            campeon: gano,
            campeonId: campeon,
            subcampeonId: subcampeon,
        };
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.SupercopaCore = SupercopaCore;
    globalThis.SupercopaStore = SupercopaStore;
    globalThis.SupercopaModo = SupercopaModo;
}

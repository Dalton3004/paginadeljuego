/**
 * Perfil del jugador (F6 6.5 + Fase A): estadísticas, rachas, logros e historial local.
 * Lógica pura en `calcularPerfil` y `sanitizarStatsPartido` (sin disco ni red),
 * más `HistorialLocalStore` para persistir localmente estadísticas y racha en Solo/Liga/Online.
 */

export const LOGROS = {
    primer_partido: { nombre: "Debut", desc: "Jugá tu primer partido", ok: (s) => s.partidas >= 1 },
    primera_victoria: { nombre: "Primera victoria", desc: "Ganá un partido", ok: (s) => s.ganadas >= 1 },
    racha_3: { nombre: "En racha", desc: "Ganá 3 seguidos", ok: (s) => s.mejorRacha >= 3 },
    goleador: { nombre: "Goleador", desc: "Marcá 5 goles en total", ok: (s) => s.golesFavor >= 5 },
    veterano: { nombre: "Veterano", desc: "Jugá 10 partidos", ok: (s) => s.partidas >= 10 },
    muralla: { nombre: "Muralla", desc: "Ganá sin recibir goles", ok: (s) => s.vallasInvictas >= 1 },
};

function numAcotado(v, max = 500) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(max, Math.round(n * 10) / 10);
}

function intAcotado(v, max = 500) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(max, n);
}

/**
 * Sanitiza el bloque opcional de estadísticas reales de un partido para persistencia segura.
 */
export function sanitizarStatsPartido(raw) {
    if (!raw || typeof raw !== "object") return null;
    const tiros = intAcotado(raw.tiros, 200);
    const tirosAlArco = Math.min(tiros, intAcotado(raw.tirosAlArco, 200));
    const pases = intAcotado(raw.pases, 600);
    const pasesCompletados = Math.min(pases, intAcotado(raw.pasesCompletados, 600));
    const barridas = intAcotado(raw.barridas, 300);
    const barridasExitosas = Math.min(barridas, intAcotado(raw.barridasExitosas, 300));
    let figura = null;
    if (raw.figura && typeof raw.figura === "object" && raw.figura.nombre) {
        figura = {
            nombre: String(raw.figura.nombre).slice(0, 28),
            team: raw.figura.team === "rival" ? "rival" : "local",
            rating: Math.max(4, Math.min(10, numAcotado(raw.figura.rating, 10))),
        };
    }
    return {
        posesionPct: Math.max(0, Math.min(100, intAcotado(raw.posesionPct ?? 50, 100))),
        tiempoPosesion: numAcotado(raw.tiempoPosesion, 600),
        tiros,
        tirosAlArco,
        pases,
        pasesCompletados,
        barridas,
        barridasExitosas,
        recuperaciones: intAcotado(raw.recuperaciones, 300),
        perdidas: intAcotado(raw.perdidas, 300),
        atajadas: intAcotado(raw.atajadas, 200),
        ataques: intAcotado(raw.ataques, 300),
        figura,
    };
}

export function calcularPerfil(partidosNuevoAViejo = []) {
    const h = [...partidosNuevoAViejo].reverse(); // cronológico: viejo → nuevo
    const s = {
        partidas: h.length,
        ganadas: 0,
        empatadas: 0,
        perdidas: 0,
        golesFavor: 0,
        golesContra: 0,
        mejorRacha: 0,
        vallasInvictas: 0,
    };
    const acumStats = {
        partidosConStats: 0,
        sumaPosesion: 0,
        tiros: 0,
        tirosAlArco: 0,
        pases: 0,
        pasesCompletados: 0,
        barridas: 0,
        barridasExitosas: 0,
        recuperaciones: 0,
        perdidas: 0,
        atajadas: 0,
        ataques: 0,
    };

    let corrida = 0;
    for (const m of h) {
        s.golesFavor += m.gf || 0;
        s.golesContra += m.gc || 0;
        if (m.resultado === "win") {
            s.ganadas++;
            corrida++;
            s.mejorRacha = Math.max(s.mejorRacha, corrida);
            if (!m.gc) s.vallasInvictas++;
        } else {
            corrida = 0;
            if (m.resultado === "loss") s.perdidas++;
            else s.empatadas++;
        }
        const st = m && m.stats ? sanitizarStatsPartido(m.stats) : null;
        if (st) {
            acumStats.partidosConStats++;
            acumStats.sumaPosesion += st.posesionPct;
            acumStats.tiros += st.tiros;
            acumStats.tirosAlArco += st.tirosAlArco;
            acumStats.pases += st.pases;
            acumStats.pasesCompletados += st.pasesCompletados;
            acumStats.barridas += st.barridas;
            acumStats.barridasExitosas += st.barridasExitosas;
            acumStats.recuperaciones += st.recuperaciones;
            acumStats.perdidas += st.perdidas;
            acumStats.atajadas += st.atajadas;
            acumStats.ataques += st.ataques;
        }
    }

    // Racha actual: positiva = victorias seguidas, negativa = derrotas seguidas, un empate la corta.
    let racha = 0;
    for (let i = h.length - 1; i >= 0; i--) {
        const r = h[i].resultado;
        if (r !== "win" && r !== "loss") break;
        const v = r === "win" ? 1 : -1;
        if (racha === 0 || Math.sign(racha) === v) racha += v;
        else break;
    }

    // Etapa 12: rachas expandidas (invicto, mejor invicto, marcando goles seguidos, derrotas seguidas)
    let mejorInvicto = 0;
    let invictoTmp = 0;
    for (const m of h) {
        if (m.resultado === "win" || m.resultado === "draw") {
            invictoTmp++;
            if (invictoTmp > mejorInvicto) mejorInvicto = invictoTmp;
        } else {
            invictoTmp = 0;
        }
    }
    let partidosInvicto = 0;
    for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].resultado === "win" || h[i].resultado === "draw") partidosInvicto++;
        else break;
    }
    let partidosMarcando = 0;
    for (let i = h.length - 1; i >= 0; i--) {
        if ((h[i].gf || 0) > 0) partidosMarcando++;
        else break;
    }
    const derrotasConsecutivas = racha < 0 ? Math.abs(racha) : 0;

    const estadisticas = {
        partidosConStats: acumStats.partidosConStats,
        posesionPromedio: acumStats.partidosConStats
            ? Math.round(acumStats.sumaPosesion / acumStats.partidosConStats)
            : 0,
        tiros: acumStats.tiros,
        tirosAlArco: acumStats.tirosAlArco,
        pases: acumStats.pases,
        pasesCompletados: acumStats.pasesCompletados,
        precisionPases: acumStats.pases > 0
            ? Math.round((acumStats.pasesCompletados / acumStats.pases) * 100)
            : 0,
        barridas: acumStats.barridas,
        barridasExitosas: acumStats.barridasExitosas,
        recuperaciones: acumStats.recuperaciones,
        perdidas: acumStats.perdidas,
        atajadas: acumStats.atajadas,
        ataques: acumStats.ataques,
    };

    return {
        ...s,
        efectividad: s.partidas ? Math.round((s.ganadas / s.partidas) * 100) : 0,
        rachaActual: racha,
        partidosInvicto,
        mejorInvicto,
        partidosMarcando,
        derrotasConsecutivas,
        estadisticas,
        logros: Object.entries(LOGROS).map(([id, l]) => ({
            id,
            nombre: l.nombre,
            desc: l.desc,
            desbloqueado: l.ok(s),
        })),
        ventana: h.length,
    };
}

/**
 * Almacén local de historial de partidos para racha, perfil y estadísticas en cliente
 * (funciona incluso sin cuenta o sin conexión).
 */
export const HistorialLocalStore = (() => {
    const KEY = "chaquito_historial_local_v1";
    const MAX = 50;
    let mem = [];

    function leer() {
        try {
            if (typeof localStorage === "undefined") return mem.slice();
            const raw = localStorage.getItem(KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (_e) {
            return mem.slice();
        }
    }

    function escribir(lista) {
        const recorte = lista.slice(0, MAX);
        mem = recorte;
        try {
            if (typeof localStorage !== "undefined") {
                localStorage.setItem(KEY, JSON.stringify(recorte));
            }
            return true;
        } catch (_e) {
            return false;
        }
    }

    function registrar({ resultado, gf = 0, gc = 0, modo = "solo", equipoLocal = "", equipoRival = "", stats = null } = {}) {
        if (!["win", "loss", "draw"].includes(resultado)) return null;
        const actual = leer();
        const entrada = {
            id: "loc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            resultado,
            gf: intAcotado(gf, 99),
            gc: intAcotado(gc, 99),
            modo: ["solo", "liga", "copa", "supercopa", "historia", "online"].includes(modo) ? modo : "solo",
            equipoLocal: String(equipoLocal || "").slice(0, 32),
            equipoRival: String(equipoRival || "").slice(0, 32),
            stats: sanitizarStatsPartido(stats),
            cuando: Date.now(),
        };
        actual.unshift(entrada); // más nuevo primero (igual que persistencia.historial)
        escribir(actual);
        return entrada;
    }

    function perfil() {
        return calcularPerfil(leer());
    }

    function limpiar() {
        mem = [];
        try {
            if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
        } catch (_e) {}
    }

    return { lista: leer, registrar, perfil, limpiar };
})();

if (typeof globalThis !== "undefined") {
    globalThis.calcularPerfil = calcularPerfil;
    globalThis.sanitizarStatsPartido = sanitizarStatsPartido;
    globalThis.HistorialLocalStore = HistorialLocalStore;
}

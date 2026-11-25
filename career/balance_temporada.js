/**
 * ETAPAS 37 Y 38 — AUDITORÍA DE BALANCE FINAL Y EXPERIENCIA DE TEMPORADA COMPLETA.
 *
 * Etapa 37: Verifica matemáticamente que dificultad, IA, velocidad, duración, atributos,
 * cansancio, recompensas, reputación, desafíos y cosméticos mantengan progresión divertida
 * sin grind excesivo y con 0% ventaja competitiva injusta (no pay-to-win / no cosmetic buff).
 *
 * Etapa 38: Conecta todos los sistemas en una narrativa coherente de temporada:
 *   PRETEMPORADA → OBJETIVO → PRIMER PARTIDO → ESTADÍSTICAS/POST-PARTIDO → NOTICIA/RACHA/RIVALIDAD
 *   → COPA → CONFERENCIAS → MOMENTOS IMPORTANTES → CLASIFICACIÓN → FINAL DE TEMPORADA
 *   → PREMIOS → PALMARÉS → NUEVA TEMPORADA.
 */

import { CONFIG, DIFICULTADES, factorEstrellas } from '../sim/config.js';
import { plantelConAtributos, modificadoresDesdeAtributos } from './atributos.js';
import { ESTADOS_FORMA } from './forma.js';
import { CELEBRACIONES_CATALOGO } from './celebraciones.js';
import { DESAFIOS_CATALOGO } from './desafios.js';

export function auditarBalanceJuego({ equiposCatalogo = [] } = {}) {
    const f = DIFICULTADES.facil;
    const n = DIFICULTADES.normal;
    const d = DIFICULTADES.dificil;

    const curvaDificultadMonotona =
        f.chaseStep < n.chaseStep &&
        n.chaseStep < d.chaseStep &&
        f.sprintStep < n.sprintStep &&
        n.sprintStep < d.sprintStep &&
        f.react > n.react &&
        n.react > d.react &&
        f.shotPower < n.shotPower &&
        n.shotPower < d.shotPower &&
        f.gk.diveSpeed < n.gk.diveSpeed &&
        n.gk.diveSpeed < d.gk.diveSpeed;

    const rangoEstrellasJusto =
        Math.abs(factorEstrellas(1) - 0.94) < 1e-6 &&
        Math.abs(factorEstrellas(3) - 1.0) < 1e-6 &&
        Math.abs(factorEstrellas(5) - 1.06) < 1e-6;

    // Auditar los 52 jugadores en los 3 estados físicos posibles
    let atributosDentroDeCota = true;
    for (const eq of equiposCatalogo) {
        if (!eq || !eq.id) continue;
        const plantel = plantelConAtributos(eq.id, { catalogo: equiposCatalogo });
        for (const jug of plantel) {
            for (const est of Object.values(ESTADOS_FORMA)) {
                const m = modificadoresDesdeAtributos(jug.atributos, jug.rasgos, est);
                if (
                    m.velocidad < 0.94 ||
                    m.velocidad > 1.06 ||
                    m.tiro < 0.93 ||
                    m.tiro > 1.08 ||
                    m.pase < 0.95 ||
                    m.pase > 1.06 ||
                    m.stamina < 0.84 ||
                    m.stamina > 1.15 ||
                    m.reaccionArquero < 0.85 ||
                    m.reaccionArquero > 1.12
                ) {
                    atributosDentroDeCota = false;
                }
            }
        }
    }

    const duracionSegundos = Math.round(CONFIG.MATCH_SECONDS);
    const duracionArcadeEquilibrada = duracionSegundos >= 60 && duracionSegundos <= 150;

    const fatigaModerada =
        ESTADOS_FORMA.cansado.simFactor >= 0.94 &&
        ESTADOS_FORMA.excelente.simFactor <= 1.06;

    // Ninguna celebración cosmética modifica stats físicas ni velocidades
    const cosmeticosSinVentaja = CELEBRACIONES_CATALOGO.every(
        (c) => !('velocidad' in c) && !('tiro' in c) && !('potencia' in c)
    );

    // Progresión sin grind excesivo: todos los desafíos duran <= 75s
    const desafiosSinGrind = DESAFIOS_CATALOGO.every((ch) => (ch.tiempo || 0) <= 75);

    return {
        ok:
            curvaDificultadMonotona &&
            rangoEstrellasJusto &&
            atributosDentroDeCota &&
            duracionArcadeEquilibrada &&
            fatigaModerada &&
            cosmeticosSinVentaja &&
            desafiosSinGrind,
        curvaDificultadMonotona,
        rangoEstrellasJusto,
        atributosDentroDeCota,
        duracionSegundos,
        duracionArcadeEquilibrada,
        fatigaModerada,
        cosmeticosSinVentaja,
        desafiosSinGrind,
    };
}

/**
 * ETAPA 38 — Construye la hoja de ruta viva y el contexto narrativo de la temporada
 * conectando Liga, Objetivos, Rachas, Rivalidades, Prensa, Copa, Premios y Palmarés.
 */
export function construirHojaRutaTemporada({
    liga = null,
    tabla = [],
    rivalProximoId = '',
    carrera = null,
    copaActual = null,
    supercopaDisponible = false,
} = {}) {
    if (!liga) return null;
    const totalFechas = Array.isArray(liga.fixture) ? liga.fixture.length : 13;
    const fechaIdx = Number(liga.fechaActual) || 0;
    const terminada = fechaIdx >= totalFechas;
    const st = carrera || {};
    const rachas = st.rachas || {};

    const miPos = tabla.findIndex((r) => r.id === liga.miEquipo) + 1;
    const rivPos = rivalProximoId ? tabla.findIndex((r) => r.id === rivalProximoId) + 1 : 0;
    const liderPts = tabla[0] ? tabla[0].pts : 0;
    const misPts = miPos > 0 && tabla[miPos - 1] ? tabla[miPos - 1].pts : 0;
    const distLider = Math.max(0, liderPts - misPts);

    const pasos = [
        { id: 'pretemporada', corto: 'PRETEMP.', hecho: true, activo: fechaIdx === 0 && !terminada },
        { id: 'arranque', corto: 'ARRANQUE', hecho: fechaIdx >= 2, activo: fechaIdx > 0 && fechaIdx < 4 },
        { id: 'mitad_copa', corto: 'MITAD · COPA', hecho: fechaIdx >= 8, activo: fechaIdx >= 4 && fechaIdx < 9 },
        { id: 'recta_final', corto: 'DEFINICIÓN', hecho: terminada, activo: fechaIdx >= 9 && !terminada },
        { id: 'premios', corto: 'PREMIOS · PALMARÉS', hecho: terminada && !!liga._cierreRegistrado, activo: terminada },
    ];

    let etapaTitulo;
    let mensajeNarrativo;
    let momentoImportante = false;

    if (terminada) {
        etapaTitulo = miPos === 1 ? '🏆 CAMPEÓN DE TEMPORADA' : `CIERRE DE CAMPAÑA (${miPos}°)`;
        mensajeNarrativo = supercopaDisponible
            ? 'La temporada quedó grabada en tu Palmarés permanente. ¡Tenés la Supercopa Chaquito habilitada!'
            : 'Campaña registrada en tu Palmarés histórico. Revisá tus premios o iniciá una nueva temporada.';
        momentoImportante = true;
    } else if (fechaIdx === 0) {
        etapaTitulo = 'PRETEMPORADA Y DEBUT';
        const objTxt =
            liga.objetivos && liga.objetivos.principal ? liga.objetivos.principal.titulo : 'Pelear arriba';
        mensajeNarrativo = `Objetivo fijado: "${objTxt}". Todo listo para el debut oficial del campeonato.`;
    } else if (fechaIdx >= totalFechas - 3) {
        etapaTitulo = '🔥 RECTA FINAL DECISIVA';
        momentoImportante = true;
        if (miPos === 1) {
            mensajeNarrativo = `Dependés de vos mismo: liderás con ${misPts} pts a falta de ${totalFechas - fechaIdx} fecha(s).`;
        } else if (distLider <= 4) {
            mensajeNarrativo = `Estás ${miPos}° a solo ${distLider} pts de la cima en el tramo decisivo.`;
        } else {
            mensajeNarrativo = `Últimas ${totalFechas - fechaIdx} fecha(s) para cerrar lo más alto posible y cumplir objetivos.`;
        }
    } else if ((rachas.victoriasConsecutivas || 0) >= 3) {
        etapaTitulo = `⚡ RACHA ENCENDIDA (${rachas.victoriasConsecutivas}G)`;
        mensajeNarrativo = `El equipo acumula ${rachas.victoriasConsecutivas} triunfos al hilo y la prensa habla de candidatura.`;
        momentoImportante = true;
    } else if ((rachas.derrotasConsecutivas || 0) >= 2) {
        etapaTitulo = 'MOMENTO DE REACCIÓN';
        mensajeNarrativo = `Tras ${rachas.derrotasConsecutivas} caídas seguidas, sumar hoy cambia el ánimo de la tribuna.`;
    } else {
        etapaTitulo = `MITAD DE CAMPEONATO · PUESTO ${miPos || '-'}°`;
        mensajeNarrativo =
            miPos > 0
                ? `Marchás ${miPos}° con ${misPts} pts${distLider > 0 ? ` (a ${distLider} del líder)` : ' en lo más alto'}.`
                : 'Avanzando fecha a fecha en la Liga Chaquito F8.';
    }

    let dueloDirectoTexto = '';
    if (!terminada && miPos > 0 && rivPos > 0) {
        if ((miPos <= 3 && rivPos <= 3) || Math.abs(miPos - rivPos) <= 1) {
            dueloDirectoTexto = `⚔ DUELO DIRECTO (${miPos}° vs ${rivPos}°)`;
            momentoImportante = true;
        } else {
            dueloDirectoTexto = `Tu puesto: ${miPos}° · Rival: ${rivPos}°`;
        }
    }

    let sugerenciaCopa = '';
    if (!terminada && fechaIdx >= 3 && fechaIdx <= 9) {
        if (copaActual && !copaActual.terminada) {
            const rAct = copaActual.rondas && copaActual.rondas[copaActual.rondaActual];
            sugerenciaCopa = `🏆 Copa Chaquito en paralelo: ${rAct ? rAct.nombre : 'En juego'}`;
        } else if (!copaActual) {
            sugerenciaCopa = '🏆 Ventana de Copa abierta: podés disputar la Copa Chaquito en paralelo';
        }
    }

    return {
        pasos,
        etapaTitulo,
        mensajeNarrativo,
        dueloDirectoTexto,
        sugerenciaCopa,
        momentoImportante,
        miPos,
        rivPos,
    };
}

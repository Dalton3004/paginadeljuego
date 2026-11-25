/**
 * ETAPA 8 — Objetivos de Temporada para Liga Chaquito F8.
 *
 * Genera objetivo principal y objetivos secundarios acordes al nivel del equipo,
 * actualiza su progreso partido a partido y evalúa recompensas al cerrar la temporada.
 */

export function generarObjetivosTemporada({
    miEquipo = '',
    estrellas = 3,
    totalFechas = 12,
    totalEquipos = 13,
    tieneClasico = true,
} = {}) {
    const est = Math.max(1, Math.min(5, Math.round(Number(estrellas) || 3)));
    const fechas = Math.max(2, parseInt(totalFechas, 10) || 12);
    const nEq = Math.max(2, parseInt(totalEquipos, 10) || 13);

    // Objetivo principal según exigencia histórica (estrellas del plantel)
    let metaPos;
    let tituloPrincipal;
    let recompensaRep;

    if (est >= 5) {
        metaPos = 1;
        tituloPrincipal = 'Salir Campeón de la Liga';
        recompensaRep = { popularidad: 7, respeto: 7, hinchada: 8 };
    } else if (est === 4) {
        metaPos = Math.min(nEq, 3);
        tituloPrincipal = `Terminar en el Podio (Top ${metaPos})`;
        recompensaRep = { popularidad: 5, respeto: 6, hinchada: 6 };
    } else if (est === 3) {
        metaPos = Math.min(nEq, 5);
        tituloPrincipal = `Clasificar en el Top ${metaPos}`;
        recompensaRep = { popularidad: 4, respeto: 5, hinchada: 5 };
    } else {
        metaPos = Math.min(nEq, Math.max(2, Math.ceil(nEq * 0.6)));
        tituloPrincipal = `Campaña firme: terminar Top ${metaPos}`;
        recompensaRep = { popularidad: 5, respeto: 6, hinchada: 6 };
    }

    const metaGoles = Math.max(4, Math.round(fechas * (est >= 4 ? 1.55 : 1.25)));
    const metaRacha = fechas >= 6 ? (est >= 4 ? 3 : 2) : 2;
    const metaVallas = Math.max(1, Math.round(fechas * 0.25));

    const principal = {
        id: 'obj_posicion',
        esPrincipal: true,
        tipo: 'posicion_max',
        titulo: tituloPrincipal,
        meta: metaPos,
        progreso: null, // posición actual en tabla
        estado: 'en_curso', // 'en_curso' | 'cumplido' | 'fallado'
        recompensa: recompensaRep,
    };

    const secundarios = [
        {
            id: 'obj_goles',
            esPrincipal: false,
            tipo: 'goles_favor',
            titulo: `Convertir ${metaGoles} goles en la Liga`,
            meta: metaGoles,
            progreso: 0,
            estado: 'en_curso',
            recompensa: { popularidad: 3, respeto: 2, hinchada: 2 },
        },
        {
            id: 'obj_racha',
            esPrincipal: false,
            tipo: 'victorias_seguidas',
            titulo: `Lograr ${metaRacha} victorias consecutivas`,
            meta: metaRacha,
            progreso: 0,
            actualCorrida: 0,
            estado: 'en_curso',
            recompensa: { popularidad: 2, respeto: 3, hinchada: 3 },
        },
    ];

    if (tieneClasico) {
        secundarios.push({
            id: 'obj_clasico',
            esPrincipal: false,
            tipo: 'ganar_clasico',
            titulo: 'Ganar al menos un Clásico o duelo de alta rivalidad',
            meta: 1,
            progreso: 0,
            estado: 'en_curso',
            recompensa: { popularidad: 3, respeto: 2, hinchada: 4 },
        });
    } else {
        secundarios.push({
            id: 'obj_vallas',
            esPrincipal: false,
            tipo: 'vallas_invictas',
            titulo: `Mantener ${metaVallas} vallas invictas`,
            meta: metaVallas,
            progreso: 0,
            estado: 'en_curso',
            recompensa: { popularidad: 1, respeto: 4, hinchada: 2 },
        });
    }

    return {
        miEquipo,
        presentados: false,
        evaluadosAlFinal: false,
        principal,
        secundarios,
        resumenFinal: null,
    };
}

/**
 * Actualiza los objetivos de la Liga tras un partido jugado o simulado del usuario.
 */
export function actualizarObjetivosLiga(
    objetivosRaw,
    {
        gf = 0,
        gc = 0,
        esClasico = false,
        posicionActual = null,
        terminada = false,
    } = {}
) {
    if (!objetivosRaw || !objetivosRaw.principal) return objetivosRaw;
    const obj = JSON.parse(JSON.stringify(objetivosRaw));
    const gano = gf > gc;

    if (posicionActual != null) {
        obj.principal.progreso = posicionActual;
        if (terminada) {
            obj.principal.estado = posicionActual <= obj.principal.meta ? 'cumplido' : 'fallado';
        }
    }

    for (const s of obj.secundarios || []) {
        if (s.tipo === 'goles_favor') {
            s.progreso = (s.progreso || 0) + Math.max(0, gf);
        } else if (s.tipo === 'victorias_seguidas') {
            s.actualCorrida = gano ? (s.actualCorrida || 0) + 1 : 0;
            s.progreso = Math.max(s.progreso || 0, s.actualCorrida);
        } else if (s.tipo === 'ganar_clasico') {
            if (gano && esClasico) s.progreso = (s.progreso || 0) + 1;
        } else if (s.tipo === 'vallas_invictas') {
            if (gc === 0) s.progreso = (s.progreso || 0) + 1;
        }

        if (s.progreso >= s.meta) {
            s.estado = 'cumplido';
        } else if (terminada) {
            s.estado = 'fallado';
        }
    }

    if (terminada && !obj.evaluadosAlFinal) {
        obj.evaluadosAlFinal = true;
        const todos = [obj.principal, ...(obj.secundarios || [])];
        const cumplidos = todos.filter((x) => x.estado === 'cumplido');
        const repTotal = { popularidad: 0, respeto: 0, hinchada: 0 };
        for (const c of cumplidos) {
            repTotal.popularidad += (c.recompensa && c.recompensa.popularidad) || 0;
            repTotal.respeto += (c.recompensa && c.recompensa.respeto) || 0;
            repTotal.hinchada += (c.recompensa && c.recompensa.hinchada) || 0;
        }
        if (obj.principal.estado === 'fallado') {
            repTotal.hinchada -= 3;
            repTotal.respeto -= 2;
        }
        obj.resumenFinal = {
            cumplidos: cumplidos.length,
            total: todos.length,
            principalCumplido: obj.principal.estado === 'cumplido',
            recompensaReputacion: repTotal,
        };
    }

    return obj;
}

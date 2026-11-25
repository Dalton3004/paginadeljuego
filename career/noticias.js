/**
 * ETAPA 5 — Noticias Chaquito (Diario deportivo interno parametrizado).
 *
 * Genera titulares y crónicas breves a partir de eventos reales del partido
 * y de las competiciones (remontadas, goles tardíos, goleadas, clásicos,
 * cambios de líder, rachas, caídas de invicto, figuras y títulos),
 * evitando repetición de plantillas consecutivas.
 */

const PLANTILLAS = {
    campeon_supercopa: [
        {
            id: 'sc_1',
            etiqueta: 'SUPERCOPA',
            titular: '¡{ganador_mayus} ES EL SUPERCAMPEÓN CHAQUITO!',
            bajada: '{ganador} venció {marcador} a {perdedor} y levantó el trofeo de campeones.',
        },
        {
            id: 'sc_2',
            etiqueta: 'SUPERCOPA',
            titular: 'REY DE REYES: {ganador_mayus} SE QUEDÓ CON LA SUPERCOPA',
            bajada: 'Con {figura} como estandarte, {ganador} derrotó a {perdedor} ({marcador}) en una noche histórica.',
        },
    ],
    campeon_copa: [
        {
            id: 'cp_1',
            etiqueta: 'COPA CHAQUITO',
            titular: '¡{ganador_mayus} GRITÓ CAMPEÓN DE LA COPA CHAQUITO!',
            bajada: 'En una final inolvidable superó {marcador} a {perdedor} y desató el festejo en la tribuna.',
        },
        {
            id: 'cp_2',
            etiqueta: 'COPA CHAQUITO',
            titular: 'LA COPA TIENE DUEÑO: CONSAGRACIÓN DE {ganador_mayus}',
            bajada: '{ganador} se impuso {marcador} ante {perdedor} y sumó una estrella dorada a su vitrina.',
        },
    ],
    campeon_liga: [
        {
            id: 'lg_camp_1',
            etiqueta: 'CAMPEÓN LIGA',
            titular: '¡DALE CAMPEÓN! {ganador_mayus} CONQUISTÓ LA LIGA CHAQUITO',
            bajada: '{ganador} coronó una campaña brillante y se quedó con el título oficial del torneo.',
        },
    ],
    remontada: [
        {
            id: 'rem_1',
            etiqueta: 'REMONTADA',
            titular: '{ganador_mayus} REMONTÓ UN PARTIDAZO',
            bajada: '{heroe} apareció en el momento clave para dar vuelta la historia y sellar el {marcador} ante {perdedor}.',
        },
        {
            id: 'rem_2',
            etiqueta: 'ÉPICA',
            titular: 'CORAZÓN Y FÚTBOL: {ganador_mayus} LO DIO VUELTA',
            bajada: 'Empezó abajo contra {perdedor}, no bajó los brazos y terminó festejando un {marcador} tremendo.',
        },
    ],
    clasico_victoria: [
        {
            id: 'cla_w1',
            etiqueta: 'CLÁSICO',
            titular: 'EL CLÁSICO FUE TODO DE {ganador_mayus}',
            bajada: '{ganador} pisó fuerte ante {perdedor} ({marcador}) y se quedó con el duelo más caliente del barrio.',
        },
        {
            id: 'cla_w2',
            etiqueta: 'CLÁSICO',
            titular: 'FIESTA EN LA TRIBUNA: {ganador_mayus} GANÓ EL CLÁSICO',
            bajada: 'Con autoridad y {figura} encendido, superó {marcador} a {perdedor} en un partido de alta tensión.',
        },
    ],
    clasico_derrota: [
        {
            id: 'cla_l1',
            etiqueta: 'CLÁSICO',
            titular: 'GOLPE DURO EN EL CLÁSICO PARA {mi_mayus}',
            bajada: '{ganador} aprovechó sus momentos y se llevó el clásico por {marcador}.',
        },
    ],
    gol_tardio: [
        {
            id: 'tar_1',
            etiqueta: 'AGÓNICO',
            titular: '¡SOBRE LA HORA! {ganador_mayus} LO GANÓ EN EL FINAL',
            bajada: '{heroe} marcó a los {minuto}\' para darle la victoria {marcador} a {ganador} frente a {perdedor}.',
        },
        {
            id: 'tar_2',
            etiqueta: 'ÚLTIMO SUSPIRO',
            titular: 'DELIRIO EN EL MINUTO {minuto}: FESTEJÓ {ganador_mayus}',
            bajada: 'Cuando parecía cerrado, {heroe} clavó el tanto decisivo para el {marcador} definitivo.',
        },
    ],
    cambio_lider: [
        {
            id: 'lid_1',
            etiqueta: 'NUEVO LÍDER',
            titular: 'CAMBIO EN LA CIMA: {lider_mayus} MANDA EN LA LIGA',
            bajada: 'Tras el {marcador} de la fecha, {lider} tomó la punta del campeonato y mete presión.',
        },
    ],
    goleada_favor: [
        {
            id: 'gol_f1',
            etiqueta: 'GOLEADA',
            titular: 'APLANADORA: {ganador_mayus} GOLEÓ SIN PIEDAD',
            bajada: ' Exhibición ofensiva para vencer {marcador} a {perdedor} con {figura} como gran figura.',
        },
        {
            id: 'gol_f2',
            etiqueta: 'SHOW DE GOLES',
            titular: 'LLUVIA DE GOLES DE {ganador_mayus} ANTE {perdedor_mayus}',
            bajada: 'Con contundencia total cerró un {marcador} categórico que ilusiona a toda su gente.',
        },
    ],
    goleada_contra: [
        {
            id: 'gol_c1',
            etiqueta: 'TROPIEZO',
            titular: 'TARDE NEGRA PARA {mi_mayus}: DURA CAÍDA {marcador}',
            bajada: '{ganador} no perdonó y obligará a {mi_equipo} a barajar y dar de nuevo en la próxima fecha.',
        },
    ],
    fin_invicto: [
        {
            id: 'inv_1',
            etiqueta: 'FIN DEL INVICTO',
            titular: 'CAYÓ EL INVICTO DE {mi_mayus}',
            bajada: 'Después de {invicto_previo} partidos sin perder, {ganador} le puso freno con un {marcador} trabajado.',
        },
    ],
    racha_positiva: [
        {
            id: 'rac_1',
            etiqueta: 'EN RACHA',
            titular: 'IMPARABLE: {mi_mayus} SUMA {racha} VICTORIAS SEGUIDAS',
            bajada: 'Superó {marcador} a {perdedor} y estira su gran presente futbolístico.',
        },
        {
            id: 'rac_2',
            etiqueta: 'RACHA GANADORA',
            titular: '¿QUIÉN FRENA A {mi_mayus}? YA VAN {racha} AL HILO',
            bajada: 'Otra actuación convincente ({marcador} vs {perdedor}) liderada por {figura}.',
        },
    ],
    copa_clasificacion: [
        {
            id: 'cop_ok1',
            etiqueta: 'COPA CHAQUITO',
            titular: '{mi_mayus} AVANZA A {ronda_sig_mayus} DE LA COPA',
            bajada: 'Dejó en el camino a {perdedor} ({marcador}) y sigue soñando con levantar el trofeo.',
        },
    ],
    copa_eliminacion: [
        {
            id: 'cop_ko1',
            etiqueta: 'COPA CHAQUITO',
            titular: 'DESPEDIDA DE COPA PARA {mi_mayus}',
            bajada: '{ganador} se impuso {marcador} y avanzó de ronda en un cruce sin margen de error.',
        },
    ],
    figura_individual: [
        {
            id: 'fig_1',
            etiqueta: 'FIGURA',
            titular: 'NOCHE CONSAGRATORIA DE {figura_mayus} ({rating})',
            bajada: 'Con {aporte_figura}, fue determinante en el {marcador} entre {mi_equipo} y {rival}.',
        },
    ],
    victoria: [
        {
            id: 'vic_1',
            etiqueta: 'VICTORIA',
            titular: 'PASO FIRME DE {ganador_mayus} ANTE {perdedor_mayus}',
            bajada: 'Se impuso por {marcador} con puntos altos como {figura} y suma confianza.',
        },
        {
            id: 'vic_2',
            etiqueta: 'TRIUNFO',
            titular: '{ganador_mayus} SE LLEVÓ UN TRIUNFO VALIOSO ({marcador})',
            bajada: 'Trabajó bien el partido frente a {perdedor} y festejó junto a su hinchada.',
        },
    ],
    empate: [
        {
            id: 'emp_1',
            etiqueta: 'EMPATE',
            titular: 'REPARTO DE PUNTOS ENTRE {mi_mayus} Y {rival_mayus}',
            bajada: 'Terminaron {marcador} en un duelo parejo donde destacó {figura}.',
        },
        {
            id: 'emp_2',
            etiqueta: 'TABLAS',
            titular: 'NO SE SACARON VENTAJA: {mi_mayus} Y {rival_mayus} IGUALARON {marcador}',
            bajada: 'Partido intenso y disputado hasta el pitazo final.',
        },
    ],
    derrota: [
        {
            id: 'der_1',
            etiqueta: 'CAÍDA',
            titular: '{ganador_mayus} SUPERÓ {marcador} A {mi_mayus}',
            bajada: 'A {mi_equipo} le costó encontrar espacios y ya piensa en la revancha.',
        },
        {
            id: 'der_2',
            etiqueta: 'DERROTA',
            titular: 'PASO EN FALSO DE {mi_mayus} FRENTE A {ganador_mayus}',
            bajada: 'Fue {marcador} en un encuentro exigente; toca corregir para lo que viene.',
        },
    ],
};

function interpolarTexto(plantilla, vars) {
    return String(plantilla || '')
        .replace(/\{([a-z0-9_]+)\}/gi, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
        .replace(/\s+/g, ' ')
        .trim();
}

function elegirPlantilla(categoria, recientesIds = []) {
    const lista = PLANTILLAS[categoria] || PLANTILLAS.empate;
    const noUsadas = lista.filter((p) => !recientesIds.includes(p.id));
    const pool = noUsadas.length ? noUsadas : lista;
    return pool[0];
}

/**
 * Detecta hechos verificables ocurridos durante el partido (remontada, gol tardío, goleada).
 */
export function analizarNarrativaPartido({
    ladoMio = 'local',
    golesMios = 0,
    golesOtro = 0,
    golesDetalle = [],
    penales = null, // { golesMios, golesOtro }
} = {}) {
    let estuvoAbajo = false;
    let maxDesventaja = 0;
    let golTardioMio = null;
    let golTardioRival = null;

    let mAcum = 0;
    let oAcum = 0;
    for (const g of golesDetalle || []) {
        if (g.team === ladoMio) mAcum++;
        else oAcum++;
        if (oAcum > mAcum) {
            estuvoAbajo = true;
            maxDesventaja = Math.max(maxDesventaja, oAcum - mAcum);
        }
        if ((g.minuto || 0) >= 80) {
            if (g.team === ladoMio) golTardioMio = g;
            else golTardioRival = g;
        }
    }

    const ganoPenales = !!(penales && penales.golesMios > penales.golesOtro);
    const perdioPenales = !!(penales && penales.golesOtro > penales.golesMios);
    const victoriaEfectiva = golesMios > golesOtro || ganoPenales;
    const derrotaEfectiva = golesOtro > golesMios || perdioPenales;

    const remontada = golesMios > golesOtro && estuvoAbajo;
    const golTardioDecisivo =
        !!(golTardioMio && golesMios > golesOtro && golesMios - golesOtro === 1) ||
        !!(golTardioRival && golesOtro > golesMios && golesOtro - golesMios === 1);

    return {
        resultadoEfectivo: victoriaEfectiva ? 'win' : (derrotaEfectiva ? 'loss' : 'draw'),
        remontada,
        maxDesventaja,
        goleadaFavor: golesMios - golesOtro >= 3,
        goleadaContra: golesOtro - golesMios >= 3,
        golTardioDecisivo,
        golTardioMio,
        golTardioRival,
        definidoPorPenales: !!penales,
    };
}

/**
 * Genera la noticia principal de un partido a partir de sus eventos reales.
 */
export function generarNoticiaPartido(
    {
        modo = 'solo', // 'solo' | 'liga' | 'copa' | 'supercopa' | 'online'
        miEquipoId = '',
        rivalId = '',
        nombreMio = 'Tu Equipo',
        nombreRival = 'Rival',
        golesMios = 0,
        golesOtro = 0,
        penales = null,
        golesDetalle = [],
        ladoMio = 'local',
        figura = null,
        rachaInfo = null,
        rivalidadInfo = null,
        impactoLiga = null,
        infoCopa = null, // { esFinal, rondaSiguiente, campeon, eliminado }
        infoSupercopa = null, // { campeon }
        contextoTorneo = '',
    } = {},
    recientesIds = []
) {
    const nar = analizarNarrativaPartido({ ladoMio, golesMios, golesOtro, golesDetalle, penales });
    const gano = nar.resultadoEfectivo === 'win';
    const perdio = nar.resultadoEfectivo === 'loss';

    const ganador = gano ? nombreMio : nombreRival;
    const perdedor = gano ? nombreRival : nombreMio;
    const marcadorBase = `${golesMios}-${golesOtro}`;
    const marcador = penales ? `${marcadorBase} (${penales.golesMios}-${penales.golesOtro} pen.)` : marcadorBase;

    const ultimoGolGanador = [...(golesDetalle || [])]
        .reverse()
        .find((g) => (gano ? g.team === ladoMio : g.team !== ladoMio));
    const heroe =
        (nar.golTardioMio && nar.golTardioMio.nombre) ||
        (ultimoGolGanador && ultimoGolGanador.nombre) ||
        (figura && figura.nombre) ||
        ganador;
    const minutoClave =
        (nar.golTardioMio && nar.golTardioMio.minuto) ||
        (nar.golTardioRival && nar.golTardioRival.minuto) ||
        (ultimoGolGanador && ultimoGolGanador.minuto) ||
        88;

    // Selección jerárquica de categoría según importancia real del hecho
    let categoria = gano ? 'victoria' : (perdio ? 'derrota' : 'empate');
    const finInvictoEv = rachaInfo && rachaInfo.eventos && rachaInfo.eventos.find((e) => e.tipo === 'fin_invicto');
    const rachaVic = rachaInfo && rachaInfo.estado ? rachaInfo.estado.victoriasConsecutivas : 0;
    const esClasico = !!(rivalidadInfo && rivalidadInfo.esClasico);
    const cambioLiderMio =
        impactoLiga && impactoLiga.posAntes > 1 && impactoLiga.posDespues === 1 && gano;

    if (modo === 'supercopa' && infoSupercopa) {
        categoria = 'campeon_supercopa';
    } else if (modo === 'copa' && infoCopa && infoCopa.campeon) {
        categoria = 'campeon_copa';
    } else if (modo === 'liga' && impactoLiga && impactoLiga.proximo && impactoLiga.proximo.terminada && impactoLiga.proximo.salioCampeon) {
        categoria = 'campeon_liga';
    } else if (nar.remontada && gano) {
        categoria = 'remontada';
    } else if (esClasico && gano) {
        categoria = 'clasico_victoria';
    } else if (esClasico && perdio) {
        categoria = 'clasico_derrota';
    } else if (nar.golTardioMio && gano && golesMios - golesOtro === 1) {
        categoria = 'gol_tardio';
    } else if (cambioLiderMio) {
        categoria = 'cambio_lider';
    } else if (nar.goleadaFavor) {
        categoria = 'goleada_favor';
    } else if (finInvictoEv && finInvictoEv.cantidadAnterior >= 3) {
        categoria = 'fin_invicto';
    } else if (nar.goleadaContra) {
        categoria = 'goleada_contra';
    } else if (modo === 'copa' && infoCopa && infoCopa.rondaSiguiente && gano) {
        categoria = 'copa_clasificacion';
    } else if (modo === 'copa' && infoCopa && infoCopa.eliminado && perdio) {
        categoria = 'copa_eliminacion';
    } else if (rachaVic >= 3 && gano) {
        categoria = 'racha_positiva';
    } else if (figura && figura.rating >= 8.8) {
        categoria = 'figura_individual';
    }

    const pl = elegirPlantilla(categoria, recientesIds);
    const vars = {
        mi_equipo: nombreMio,
        mi_mayus: String(nombreMio).toUpperCase(),
        rival: nombreRival,
        rival_mayus: String(nombreRival).toUpperCase(),
        ganador,
        ganador_mayus: String(ganador).toUpperCase(),
        perdedor,
        perdedor_mayus: String(perdedor).toUpperCase(),
        marcador,
        heroe,
        minuto: minutoClave,
        figura: figura ? figura.nombre : heroe,
        figura_mayus: String(figura ? figura.nombre : heroe).toUpperCase(),
        rating: figura && figura.rating ? figura.rating.toFixed(1) : '8.5',
        aporte_figura: figura && figura.resumen ? figura.resumen.toLowerCase() : 'una gran actuación',
        racha: rachaVic,
        invicto_previo: finInvictoEv ? finInvictoEv.cantidadAnterior : 3,
        lider: nombreMio,
        lider_mayus: String(nombreMio).toUpperCase(),
        ronda_sig_mayus: String((infoCopa && infoCopa.rondaSiguiente) || 'LA SIGUIENTE RONDA').toUpperCase(),
    };

    return {
        id: 'not_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        plantillaId: pl.id,
        categoria,
        etiqueta: pl.etiqueta,
        titular: interpolarTexto(pl.titular, vars),
        bajada: interpolarTexto(pl.bajada, vars),
        contexto: contextoTorneo || modo.toUpperCase(),
        equipoId: miEquipoId,
        rivalId,
        destacada: [
            'campeon_supercopa',
            'campeon_copa',
            'campeon_liga',
            'remontada',
            'clasico_victoria',
            'gol_tardio',
            'cambio_lider',
        ].includes(categoria),
        narrativa: nar,
        cuando: Date.now(),
    };
}

/**
 * Crea una noticia complementaria a partir de una declaración en conferencia post-partido.
 */
export function generarNoticiaConferencia({ nombreClub, periodista, cita, tono = 'equipo', rivalNombre = '' } = {}) {
    const clubMayus = String(nombreClub || 'EL DT').toUpperCase();
    const prefijo =
        tono === 'picante'
            ? `PICANTE EN CONFERENCIA · ${clubMayus}`
            : tono === 'autocritica'
            ? `AUTOCRÍTICA EN ${clubMayus}`
            : `VOCES EN ${clubMayus}`;
    return {
        id: 'not_conf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        plantillaId: 'conf_' + tono,
        categoria: 'conferencia',
        etiqueta: 'DECLARACIONES',
        titular: prefijo,
        bajada: `"${cita}" — respuesta ante ${periodista || 'la prensa'}${rivalNombre ? ` tras cruzar a ${rivalNombre}` : ''}.`,
        contexto: 'SALA DE PRENSA',
        destacada: tono === 'picante',
        cuando: Date.now(),
    };
}

/**
 * ETAPA 6 — Sistema de Conferencias Post-Partido.
 *
 * Tras partidos seleccionados por reglas claras (finales, clásicos, remontadas,
 * victorias sobre el líder, goleadas, goles agónicos, rachas o muestreo ligero),
 * un periodista formula una pregunta contextual con 3 opciones de respuesta.
 * Afecta de forma ligera reputación, relación con hinchada, rivalidad y tono de noticias.
 */

const PERIODISTAS = [
    { nombre: 'Chicho Pelota', medio: 'Radio El Potrero' },
    { nombre: 'Marta Gol', medio: 'Diario Chaquito' },
    { nombre: 'Tito Táctica', medio: 'Canal 8 Arcade' },
];

const BANCO_CONFERENCIAS = {
    titulo: {
        pregunta: '¡Salud, campeón! {mi_equipo} levantó el trofeo tras el {marcador} frente a {rival}. ¿A quién va dedicada esta estrella?',
        opciones: [
            {
                id: 'humilde',
                tono: 'equipo',
                texto: 'A toda la gente del barrio y a este plantel que dejó el alma en cada pelota.',
                efecto: { popularidad: 2, respeto: 3, hinchada: 4, rivalidad: 0 },
            },
            {
                id: 'orgullo',
                tono: 'picante',
                texto: 'A los que dudaban de {mi_equipo}. Quedó demostrado quién manda en la cancha.',
                efecto: { popularidad: 4, respeto: -1, hinchada: 3, rivalidad: 5 },
            },
            {
                id: 'ambicion',
                tono: 'autocritica',
                texto: 'Hoy se festeja, pero mañana ya pensamos en ganar el próximo campeonato.',
                efecto: { popularidad: 2, respeto: 4, hinchada: 2, rivalidad: 1 },
            },
        ],
    },
    remontada: {
        pregunta: 'Estaban abajo en el marcador contra {rival} y terminaron ganándolo {marcador}. ¿Dónde estuvo la clave de la remontada?',
        opciones: [
            {
                id: 'corazon',
                tono: 'equipo',
                texto: 'En la rebeldía del grupo y el empuje de la tribuna, que nunca dejó de cantar.',
                efecto: { popularidad: 2, respeto: 2, hinchada: 4, rivalidad: 0 },
            },
            {
                id: 'picante',
                tono: 'picante',
                texto: '{rival} festejó antes de tiempo y contra {mi_equipo} eso se paga caro.',
                efecto: { popularidad: 3, respeto: -2, hinchada: 3, rivalidad: 6 },
            },
            {
                id: 'tactica',
                tono: 'autocritica',
                texto: 'Ajustamos las marcas, tuvimos paciencia para tocar y corregimos los errores del arranque.',
                efecto: { popularidad: 1, respeto: 4, hinchada: 1, rivalidad: 0 },
            },
        ],
    },
    clasico_ganado: {
        pregunta: 'Los clásicos no se juegan, se ganan, y hoy {mi_equipo} superó {marcador} a {rival}. ¿Qué significa este triunfo?',
        opciones: [
            {
                id: 'respeto',
                tono: 'equipo',
                texto: 'Una alegría enorme para nuestra hinchada ante un gran rival como {rival}.',
                efecto: { popularidad: 2, respeto: 3, hinchada: 3, rivalidad: 0 },
            },
            {
                id: 'chicana',
                tono: 'picante',
                texto: 'El barrio ya sabe de qué color se pinta cada vez que nos cruzamos.',
                efecto: { popularidad: 3, respeto: -2, hinchada: 4, rivalidad: 6 },
            },
            {
                id: 'calma',
                tono: 'autocritica',
                texto: 'Suma mucho en lo anímico, pero el objetivo grande sigue siendo toda la temporada.',
                efecto: { popularidad: 1, respeto: 3, hinchada: 1, rivalidad: 1 },
            },
        ],
    },
    clasico_perdido: {
        pregunta: 'Duele perder el clásico ({marcador} ante {rival}). ¿Qué mensaje le dejás al hincha de {mi_equipo}?',
        opciones: [
            {
                id: 'dar_cara',
                tono: 'autocritica',
                texto: 'Pedirles disculpas y trabajar el doble. En la próxima vuelta nos vamos a sacar la espina.',
                efecto: { popularidad: 0, respeto: 3, hinchada: 2, rivalidad: 1 },
            },
            {
                id: 'caliente',
                tono: 'picante',
                texto: 'Tuvieron fortuna en las divididas. Ya nos vamos a volver a ver las caras.',
                efecto: { popularidad: 2, respeto: -2, hinchada: 1, rivalidad: 5 },
            },
            {
                id: 'bancar',
                tono: 'equipo',
                texto: 'El grupo dejó todo hasta el final; confío a muerte en estos jugadores.',
                efecto: { popularidad: 1, respeto: 2, hinchada: 2, rivalidad: 0 },
            },
        ],
    },
    victoria_lider: {
        pregunta: 'Dieron el golpe bajando al puntero ({marcador} frente a {rival}). ¿{mi_equipo} se anota en la pelea grande?',
        opciones: [
            {
                id: 'paso_a_paso',
                tono: 'equipo',
                texto: 'Vamos partido a partido, con humildad, pero sin achicarnos ante nadie.',
                efecto: { popularidad: 2, respeto: 3, hinchada: 3, rivalidad: 0 },
            },
            {
                id: 'aviso',
                tono: 'picante',
                texto: 'Que tomen nota todos: {mi_equipo} va por todo este año.',
                efecto: { popularidad: 4, respeto: 0, hinchada: 3, rivalidad: 4 },
            },
            {
                id: 'orden',
                tono: 'autocritica',
                texto: 'Hicimos un partido inteligente, aunque todavía tenemos cosas por pulir.',
                efecto: { popularidad: 1, respeto: 3, hinchada: 1, rivalidad: 0 },
            },
        ],
    },
    gol_tardio: {
        pregunta: 'Lo ganaron sobre el cierre ({marcador}) con un grito agónico de {heroe}. ¿Se sufrió más de la cuenta?',
        opciones: [
            {
                id: 'elogio',
                tono: 'equipo',
                texto: 'Así se goza el doble. {heroe} tuvo premio por buscarlo hasta el último segundo.',
                efecto: { popularidad: 3, respeto: 2, hinchada: 3, rivalidad: 0 },
            },
            {
                id: 'mistica',
                tono: 'picante',
                texto: 'A {mi_equipo} nunca lo podés dar por muerto hasta que pita el juez.',
                efecto: { popularidad: 3, respeto: 0, hinchada: 4, rivalidad: 3 },
            },
            {
                id: 'definicion',
                tono: 'autocritica',
                texto: 'Tuvimos chances para liquidarlo antes; debemos afinar la puntería.',
                efecto: { popularidad: 0, respeto: 3, hinchada: 1, rivalidad: 0 },
            },
        ],
    },
    goleada: {
        pregunta: 'Contundente {marcador} ante {rival}. ¿Vimos la mejor versión futbolística de {mi_equipo}?',
        opciones: [
            {
                id: 'colectivo',
                tono: 'equipo',
                texto: 'Salió redondo porque todos corrieron y jugaron para el compañero.',
                efecto: { popularidad: 2, respeto: 3, hinchada: 3, rivalidad: 0 },
            },
            {
                id: 'show',
                tono: 'picante',
                texto: 'Cuando nos sueltan así, es muy difícil que nos puedan parar.',
                efecto: { popularidad: 4, respeto: -1, hinchada: 3, rivalidad: 4 },
            },
            {
                id: 'pies_tierra',
                tono: 'autocritica',
                texto: 'Fue un gran partido, pero tres puntos valen igual que un 1-0. Pies sobre la tierra.',
                efecto: { popularidad: 1, respeto: 4, hinchada: 1, rivalidad: 0 },
            },
        ],
    },
    racha_positiva: {
        pregunta: '{mi_equipo} encadena {racha} victorias seguidas tras el {marcador}. ¿Cómo se sostiene este envión?',
        opciones: [
            {
                id: 'union',
                tono: 'equipo',
                texto: 'Con el vestuario unido y respetando a cada rival como una final.',
                efecto: { popularidad: 2, respeto: 3, hinchada: 3, rivalidad: 0 },
            },
            {
                id: 'confianza',
                tono: 'picante',
                texto: 'Hoy entramos a la cancha sabiendo que lo vamos a ganar.',
                efecto: { popularidad: 3, respeto: -1, hinchada: 3, rivalidad: 3 },
            },
            {
                id: 'exigencia',
                tono: 'autocritica',
                texto: 'No relajándonos ni un metro en los entrenamientos.',
                efecto: { popularidad: 1, respeto: 3, hinchada: 2, rivalidad: 0 },
            },
        ],
    },
    derrota: {
        pregunta: 'No salieron las cosas en el {marcador} frente a {rival}. ¿Cuál es tu diagnóstico del partido?',
        opciones: [
            {
                id: 'autocritica',
                tono: 'autocritica',
                texto: 'El responsable soy yo. Nos faltó claridad en los metros finales y hay que trabajar.',
                efecto: { popularidad: 0, respeto: 3, hinchada: 2, rivalidad: 0 },
            },
            {
                id: 'respaldo',
                tono: 'equipo',
                texto: '{rival} golpeó en los momentos justos, pero este plantel tiene con qué levantarse ya.',
                efecto: { popularidad: 1, respeto: 2, hinchada: 2, rivalidad: 0 },
            },
            {
                id: 'bronca',
                tono: 'picante',
                texto: 'Me voy con bronca porque merecimos más; en el próximo cruce nos cobramos revancha.',
                efecto: { popularidad: 2, respeto: -1, hinchada: 2, rivalidad: 4 },
            },
        ],
    },
};

function reemplazarVars(str, vars) {
    return String(str || '').replace(/\{([a-z0-9_]+)\}/gi, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

/**
 * Regla clara para decidir si tras este partido corresponde conferencia de prensa.
 * Nunca se dispara en partidos Online (para no bloquear la ventana de revancha en red).
 */
export function evaluarActivacionConferencia({
    modo = 'solo',
    tituloGanado = false,
    esFinal = false,
    esClasico = false,
    remontada = false,
    victoriaSobreLider = false,
    goleadaFavor = false,
    goleadaContra = false,
    golTardioDecisivo = false,
    rachaVictorias = 0,
    rachaDerrotas = 0,
    partidosDesdeUltima = 99,
    azar = Math.random,
} = {}) {
    if (modo === 'online') return { activar: false, motivo: null };

    // Eventos mayores: activan siempre
    if (tituloGanado) return { activar: true, motivo: 'titulo' };
    if (esFinal && modo !== 'solo') return { activar: true, motivo: 'final' };
    if (remontada) return { activar: true, motivo: 'remontada' };
    if (esClasico && modo !== 'solo') return { activar: true, motivo: 'clasico' };
    if (victoriaSobreLider) return { activar: true, motivo: 'victoria_lider' };

    // En modo Solo amistoso solo aparece ante hitos fuertes (remontada, clásico con alta tensión o goleada) con cooldown
    if (modo === 'solo') {
        if (partidosDesdeUltima < 2) return { activar: false, motivo: null };
        if (esClasico && azar() < 0.65) return { activar: true, motivo: 'clasico' };
        if (goleadaFavor && azar() < 0.5) return { activar: true, motivo: 'goleada' };
        return { activar: false, motivo: null };
    }

    // Competiciones oficiales (Liga / Copa / Supercopa): hitos secundarios con alta probabilidad + cooldown suave
    if (golTardioDecisivo && azar() < 0.85) return { activar: true, motivo: 'gol_tardio' };
    if ((goleadaFavor || goleadaContra) && azar() < 0.8) return { activar: true, motivo: 'goleada' };
    if (rachaVictorias >= 3 && azar() < 0.75) return { activar: true, motivo: 'racha_positiva' };
    if (rachaDerrotas >= 2 && azar() < 0.7) return { activar: true, motivo: 'derrota' };

    if (partidosDesdeUltima >= 2 && azar() < 0.25) {
        return { activar: true, motivo: 'general' };
    }
    return { activar: false, motivo: null };
}

/**
 * Construye el objeto completo de conferencia listo para presentar en UI.
 */
export function crearConferenciaPostPartido({
    motivo = 'general',
    resultado = 'win',
    nombreMio = 'Tu Equipo',
    nombreRival = 'Rival',
    marcador = '1-0',
    heroe = 'el goleador',
    rachaVictorias = 0,
    indicePeriodista = 0,
} = {}) {
    let clave;
    if (motivo === 'titulo') clave = 'titulo';
    else if (motivo === 'remontada' && resultado === 'win') clave = 'remontada';
    else if (motivo === 'clasico') clave = resultado === 'win' ? 'clasico_ganado' : 'clasico_perdido';
    else if (motivo === 'victoria_lider' && resultado === 'win') clave = 'victoria_lider';
    else if (motivo === 'gol_tardio' && resultado === 'win') clave = 'gol_tardio';
    else if (motivo === 'goleada' && resultado === 'win') clave = 'goleada';
    else if ((motivo === 'racha_positiva' || rachaVictorias >= 3) && resultado === 'win') clave = 'racha_positiva';
    else if (resultado === 'win') clave = 'goleada';
    else clave = 'derrota';

    const base = BANCO_CONFERENCIAS[clave] || BANCO_CONFERENCIAS.derrota;
    const per = PERIODISTAS[Math.abs(indicePeriodista) % PERIODISTAS.length];
    const vars = {
        mi_equipo: nombreMio,
        rival: nombreRival,
        marcador,
        heroe,
        racha: Math.max(2, rachaVictorias),
    };

    return {
        id: 'conf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        clave,
        periodista: per.nombre,
        medio: per.medio,
        pregunta: reemplazarVars(base.pregunta, vars),
        opciones: base.opciones.map((op) => ({
            id: op.id,
            tono: op.tono,
            texto: reemplazarVars(op.texto, vars),
            efecto: { ...op.efecto },
        })),
        respondida: false,
        respuestaElegida: null,
    };
}

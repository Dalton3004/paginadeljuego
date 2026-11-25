import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { EQUIPOS } from '../assets/equipos.js';
import { crearEstadoRachas, actualizarRachas } from '../career/rachas.js';
import {
    crearEstadoRivalidades,
    consultarRivalidad,
    registrarEnfrentamientoRivalidad,
    rivalidadesDeEquipo,
} from '../career/rivalidades.js';
import {
    crearEstadoReputacion,
    actualizarReputacionPorPartido,
    aplicarDeltaReputacion,
} from '../career/reputacion.js';
import { analizarNarrativaPartido, generarNoticiaPartido } from '../career/noticias.js';
import { evaluarActivacionConferencia, crearConferenciaPostPartido } from '../career/conferencias.js';
import { generarObjetivosTemporada } from '../career/objetivos.js';
import { CarreraStore } from '../career/store.js';
import { LigaCore } from '../liga.js';
import { CopaCore, CopaStore } from '../copa.js';
import { SupercopaCore, SupercopaStore } from '../supercopa.js';
import { resolverEjecucionPenal, decisionPenalIA, SeriePenales } from '../sim/penales_core.js';
import { calcularPerfil } from '../perfil.js';

globalThis.EQUIPOS = EQUIPOS;

describe('FASE B — Liga, Competiciones y Narrativa Deportiva (Etapas 5 a 13)', () => {
    beforeEach(() => {
        CarreraStore.reiniciar();
    });

    it('Etapa 5 (Noticias Chaquito): detecta remontadas, goles tardíos, clásicos y evita repetir plantilla consecutiva', () => {
        const golesRemontada = [
            { team: 'rival', nombre: 'Beto', minuto: 18 },
            { team: 'local', nombre: 'Lucho', minuto: 52 },
            { team: 'local', nombre: 'Mariano', minuto: 86 },
        ];
        const nar = analizarNarrativaPartido({
            ladoMio: 'local',
            golesMios: 2,
            golesOtro: 1,
            golesDetalle: golesRemontada,
        });
        assert.equal(nar.remontada, true);
        assert.equal(nar.golTardioDecisivo, true);
        assert.equal(nar.resultadoEfectivo, 'win');

        const n1 = generarNoticiaPartido({
            modo: 'liga',
            nombreMio: 'La Retoneta',
            nombreRival: 'El Boguero',
            golesMios: 2,
            golesOtro: 1,
            golesDetalle: golesRemontada,
            ladoMio: 'local',
        });
        assert.equal(n1.categoria, 'remontada');
        assert.ok(n1.titular.includes('LA RETONETA'));
        assert.ok(n1.bajada.includes('Mariano'));

        // Anti-repetición: pasando el plantillaId anterior elige la variante alternativa
        const n2 = generarNoticiaPartido(
            {
                modo: 'liga',
                nombreMio: 'La Retoneta',
                nombreRival: 'El Boguero',
                golesMios: 2,
                golesOtro: 1,
                golesDetalle: golesRemontada,
                ladoMio: 'local',
            },
            [n1.plantillaId]
        );
        assert.notEqual(n2.plantillaId, n1.plantillaId);

        // Gol agónico sin remontada (1-0 a los 88')
        const nTardio = generarNoticiaPartido({
            modo: 'liga',
            nombreMio: 'Macabro',
            nombreRival: 'Monarca',
            golesMios: 1,
            golesOtro: 0,
            golesDetalle: [{ team: 'local', nombre: 'Nico', minuto: 88 }],
            ladoMio: 'local',
        });
        assert.equal(nTardio.categoria, 'gol_tardio');
        assert.ok(nTardio.bajada.includes('88'));
    });

    it('Etapa 6 (Conferencias Post-Partido): nunca se activa en Online, genera 3 opciones y aplica consecuencias', () => {
        const offOnline = evaluarActivacionConferencia({
            modo: 'online',
            tituloGanado: true,
            esFinal: true,
            remontada: true,
        });
        assert.equal(offOnline.activar, false);

        const onClasico = evaluarActivacionConferencia({
            modo: 'liga',
            esClasico: true,
        });
        assert.equal(onClasico.activar, true);
        assert.equal(onClasico.motivo, 'clasico');

        const conf = crearConferenciaPostPartido({
            motivo: 'clasico',
            resultado: 'win',
            nombreMio: 'La Retoneta',
            nombreRival: 'El Boguero',
            marcador: '3-1',
        });
        assert.equal(conf.opciones.length, 3);
        assert.equal(conf.respondida, false);

        const rivAntes = CarreraStore.rivalidadEntre('retoneta', 'el_boguero').nivel;
        const opPicante = conf.opciones.find((o) => o.tono === 'picante');
        assert.ok(opPicante);

        const resp = CarreraStore.responderConferencia(conf, opPicante.id, {
            miEquipoId: 'retoneta',
            rivalId: 'el_boguero',
            nombreMio: 'La Retoneta',
            nombreRival: 'El Boguero',
        });
        assert.ok(resp);
        assert.equal(conf.respondida, true);
        assert.ok(resp.rivalidadActualizada.nivel > rivAntes);
        assert.equal(CarreraStore.leer().noticias[0].categoria, 'conferencia');
    });

    it('Etapa 7 (Reputación): se mantiene entre 0 y 100 y desbloquea títulos cosméticos no pay-to-win', () => {
        let rep = crearEstadoReputacion();
        assert.equal(rep.popularidad, 50);
        assert.ok(rep.general >= 50 && rep.general <= 52);

        const out = actualizarReputacionPorPartido(rep, {
            resultado: 'win',
            goleadaFavor: true,
            remontada: true,
            esClasico: true,
            esFinal: true,
            tituloGanado: true,
            rachaVictorias: 4,
            nivelRivalidad: 88,
        });
        assert.ok(out.estado.general > rep.general);
        assert.equal(out.estado.rivalidadMaxima, 88);
        assert.ok(out.nuevosTitulos.length >= 1);

        // Tope superior 100 e inferior 0 garantizados
        const tope = aplicarDeltaReputacion(out.estado, { popularidad: 500, respeto: 500, hinchada: 500 });
        assert.equal(tope.estado.general, 100);
        const piso = aplicarDeltaReputacion(tope.estado, { popularidad: -500, respeto: -500, hinchada: -500 });
        assert.equal(piso.estado.general, 0);
    });

    it('Etapa 8 (Objetivos de Temporada): ajusta exigencia por estrellas, mide progreso y evalúa fin de Liga', () => {
        const obj5 = generarObjetivosTemporada({
            miEquipo: 'retoneta',
            estrellas: 5,
            totalFechas: 12,
            totalEquipos: 13,
            tieneClasico: true,
        });
        const obj2 = generarObjetivosTemporada({
            miEquipo: 'choborra',
            estrellas: 2,
            totalFechas: 12,
            totalEquipos: 13,
            tieneClasico: false,
        });
        assert.equal(obj5.principal.meta, 1); // 5 estrellas exige salir campeón
        assert.ok(obj2.principal.meta > obj5.principal.meta); // 2 estrellas pide campaña acorde

        // Progreso en una liga corta de 4 equipos (3 fechas)
        const ids = ['retoneta', 'el_boguero', 'macabro', 'monarca'];
        const liga = LigaCore.crear({ ids, miEquipo: 'retoneta', dificultad: 'normal', formato: 'ida' });
        assert.ok(liga.objetivos && liga.objetivos.principal);

        while (!LigaCore.terminada(liga)) {
            const m = LigaCore.partidoUsuario(liga, liga.fechaActual);
            const soyLocal = m.l === 'retoneta';
            m.gl = soyLocal ? 4 : 0;
            m.gv = soyLocal ? 0 : 4;
            LigaCore.cerrarFecha(liga);
            LigaCore.actualizarObjetivosTrasFecha(liga, { gf: 4, gc: 0, esClasico: true });
        }

        assert.equal(liga.objetivos.evaluadosAlFinal, true);
        assert.equal(liga.objetivos.principal.estado, 'cumplido');
        assert.ok(liga.objetivos.resumenFinal.principalCumplido);
        assert.ok(liga.objetivos.resumenFinal.recompensaReputacion.popularidad > 0);
    });

    it('Etapa 9 (Copa Chaquito): sortea cuadro de 13 equipos con byes, soporta ida/vuelta, detecta penales y corona campeón', () => {
        const ids13 = EQUIPOS.map((e) => e.id);
        assert.equal(ids13.length, 13);

        const copa = CopaCore.crear({
            ids: ids13,
            miEquipo: 'retoneta',
            dificultad: 'normal',
            formato: 'unico',
        });
        assert.equal(copa.rondas.length, 1);
        assert.equal(copa.rondas[0].slots, 16);
        assert.equal(copa.rondas[0].llaves.length, 8);
        const byes = copa.rondas[0].llaves.filter((ll) => ll.bye);
        assert.equal(byes.length, 3); // 16 - 13 = 3 pases directos

        // Avanzar toda la copa hasta tener un campeón oficial
        CopaCore.simularRestoCopa(copa);
        assert.equal(CopaCore.terminada(copa), true);
        assert.ok(ids13.includes(copa.campeon));
        assert.ok(ids13.includes(copa.subcampeon));
        assert.notEqual(copa.campeon, copa.subcampeon);

        CopaStore.registrarHistorial(copa);
        assert.equal(CopaStore.historial()[0].campeon, copa.campeon);

        // Formato ida y vuelta: empate global tras vuelta activa detección de penales
        const copaIV = CopaCore.crear({
            ids: ['retoneta', 'el_boguero', 'macabro', 'monarca'],
            miEquipo: 'retoneta',
            formato: 'idayvuelta',
        });
        assert.equal(copaIV.rondas[0].idaYVuelta, true);
        // En la ida empatar NO requiere penales todavía
        assert.equal(CopaCore.requierePenalesTrasResultado(copaIV, 1, 1), false);
        const resIda = CopaCore.registrarPartidoUsuario(copaIV, 2, 1);
        assert.ok(resIda);
        assert.equal(copaIV.rondas[0].vueltaActual, 1);
        // Si en la vuelta pierde 0-1, el global queda 2-2 -> requiere penales
        assert.equal(CopaCore.requierePenalesTrasResultado(copaIV, 0, 1), true);
        const resVuelta = CopaCore.registrarPartidoUsuario(copaIV, 0, 1, { golesMios: 4, golesOtro: 3 });
        assert.equal(resVuelta.ganoLlave, true);
        // La Final siempre es a partido único
        assert.equal(CopaCore.rondaActiva(copaIV).slots, 2);
        assert.equal(CopaCore.rondaActiva(copaIV).idaYVuelta, false);
    });

    it('Etapa 10 (Penales): resuelve dirección/potencia/efecto, corte matemático anticipado y muerte súbita', () => {
        // Arquero al otro palo + potencia controlada = gol seguro
        const gol = resolverEjecucionPenal(
            { direccion: 'izq', potencia: 0.76, efecto: 'comba', decisionArquero: 'der' },
            () => 0.5
        );
        assert.equal(gol.esGol, true);

        // Exceso de potencia (>0.94) al ángulo con tirada baja dispara travesaño
        const trav = resolverEjecucionPenal(
            { direccion: 'der', potencia: 0.99, efecto: 'angulo', decisionArquero: 'izq' },
            () => 0.05
        );
        assert.equal(trav.esGol, false);
        assert.equal(trav.desenlace, 'travesano');

        const ia = decisionPenalIA({ rol: 'patear', dificultad: 'dificil', azar: () => 0.4 });
        assert.ok(['izq', 'centro', 'der'].includes(ia.direccion));

        // Corte matemático 3-0 tras 3 rondas
        const serieRapida = new SeriePenales({ empiezaUsuario: true, tirosReglamentarios: 5 });
        for (let i = 0; i < 3; i++) {
            serieRapida.registrarTiro(true);  // usuario convierte
            serieRapida.registrarTiro(false); // rival erra
        }
        assert.equal(serieRapida.terminada, true);
        assert.equal(serieRapida.ganador, 'mio');
        assert.equal(serieRapida.golesMios, 3);
        assert.equal(serieRapida.golesOtro, 0);

        // Empate 5-5 -> Muerte súbita definida en el 6° penal
        const serieMS = new SeriePenales({ empiezaUsuario: true, tirosReglamentarios: 5 });
        for (let i = 0; i < 5; i++) {
            serieMS.registrarTiro(true);
            serieMS.registrarTiro(true);
        }
        assert.equal(serieMS.terminada, false);
        assert.equal(serieMS.enMuerteSubita, true);
        serieMS.registrarTiro(false); // 6° usuario falla
        assert.equal(serieMS.terminada, false); // falta patear el rival
        serieMS.registrarTiro(true);  // 6° rival anota -> gana rival 6-5
        assert.equal(serieMS.terminada, true);
        assert.equal(serieMS.ganador, 'rival');
    });

    it('Etapa 11 (Supercopa Chaquito): cruza Campeón de Liga vs Campeón de Copa y aplica regla de doblete contra Subcampeón de Liga', () => {
        const cruceNormal = SupercopaCore.armarCruce({
            campeonLiga: { equipoId: 'retoneta', subcampeonId: 'macabro', esUsuario: true, fecha: 100 },
            campeonCopa: { equipoId: 'el_boguero', finalistaId: 'monarca', esUsuario: false, fecha: 200 },
            idsEquipos: EQUIPOS.map((e) => e.id),
        });
        assert.equal(cruceNormal.habilitada, true);
        assert.equal(cruceNormal.hayDoblete, false);
        assert.equal(cruceNormal.equipoA, 'retoneta');
        assert.equal(cruceNormal.equipoB, 'el_boguero');

        // Regla oficial de doblete: mismo campeón en Liga y Copa juega vs Subcampeón de Liga
        const cruceDoblete = SupercopaCore.armarCruce({
            campeonLiga: { equipoId: 'retoneta', subcampeonId: 'la_tikineta', esUsuario: true, fecha: 300 },
            campeonCopa: { equipoId: 'retoneta', finalistaId: 'el_boguero', esUsuario: true, fecha: 400 },
            idsEquipos: EQUIPOS.map((e) => e.id),
        });
        assert.equal(cruceDoblete.habilitada, true);
        assert.equal(cruceDoblete.hayDoblete, true);
        assert.equal(cruceDoblete.equipoA, 'retoneta');
        assert.equal(cruceDoblete.equipoB, 'la_tikineta');
        assert.equal(cruceDoblete.rolB, 'SUBCAMPEÓN DE LIGA');

        SupercopaStore.registrarEdicion({
            claveEdicion: cruceDoblete.claveEdicion,
            equipoA: 'retoneta',
            equipoB: 'la_tikineta',
            gl: 2,
            gv: 1,
            campeon: 'retoneta',
            subcampeon: 'la_tikineta',
        });
        assert.equal(SupercopaStore.yaJugada(cruceDoblete.claveEdicion), true);
    });

    it('Etapa 12 (Rachas): contabiliza victorias, invicto, goles seguidos y anuncia cuando se corta el invicto', () => {
        let st = crearEstadoRachas();
        for (let i = 0; i < 4; i++) {
            const out = actualizarRachas(st, { resultado: 'win', gf: 2, gc: i === 0 ? 1 : 0 });
            st = out.estado;
            if (i === 3) {
                assert.ok(out.mensajes.includes('4 VICTORIAS CONSECUTIVAS'));
            }
        }
        assert.equal(st.victoriasConsecutivas, 4);
        assert.equal(st.partidosInvicto, 4);
        assert.equal(st.partidosMarcando, 4);
        assert.equal(st.vallasInvictasSeguidas, 3);

        // Un empate mantiene el invicto en 5
        const emp = actualizarRachas(st, { resultado: 'draw', gf: 1, gc: 1 });
        assert.equal(emp.estado.victoriasConsecutivas, 0);
        assert.equal(emp.estado.partidosInvicto, 5);
        assert.equal(emp.estado.partidosMarcando, 5);

        // Una derrota corta el invicto con mensaje explícito
        const caida = actualizarRachas(emp.estado, { resultado: 'loss', gf: 0, gc: 2 });
        assert.equal(caida.estado.partidosInvicto, 0);
        assert.ok(caida.mensajes.some((m) => m.includes('SE TERMINÓ EL INVICTO')));

        // Integración en calcularPerfil (nuevo -> viejo)
        const perfil = calcularPerfil([
            { resultado: 'draw', gf: 1, gc: 1 },
            { resultado: 'win', gf: 2, gc: 0 },
            { resultado: 'win', gf: 3, gc: 1 },
            { resultado: 'loss', gf: 0, gc: 2 },
        ]);
        assert.equal(perfil.partidosInvicto, 3);
        assert.equal(perfil.partidosMarcando, 3);
    });

    it('Etapa 13 (Rivalidades): reconoce clásicos fundacionales y convierte duelos intensos en nuevos clásicos (>= 70/100)', () => {
        let st = crearEstadoRivalidades();
        const clasicoBase = consultarRivalidad(st, 'retoneta', 'el_boguero');
        assert.equal(clasicoBase.esClasico, true);
        assert.ok(clasicoBase.nivel >= 70);
        assert.match(clasicoBase.textoNivel, /^RIVALIDAD \d+\/100$/);

        // Dos equipos sin clásico previo suben su rivalidad tras finales/remontadas hasta >= 70
        let cruce = consultarRivalidad(st, 'manchester_fichin', 'monarca');
        assert.equal(cruce.esClasico, false);

        let vioNuevoClasico = false;
        for (let i = 0; i < 3; i++) {
            const r = registrarEnfrentamientoRivalidad(st, {
                eqLocal: 'manchester_fichin',
                eqRival: 'monarca',
                golesLocal: 3,
                golesRival: 2,
                remontada: true,
                esFinal: true,
            });
            st = r.estado;
            if (r.nuevoClasico) vioNuevoClasico = true;
        }
        cruce = consultarRivalidad(st, 'manchester_fichin', 'monarca');
        assert.equal(vioNuevoClasico, true);
        assert.equal(cruce.esClasico, true);
        assert.ok(cruce.nivel >= 70);

        const lista = rivalidadesDeEquipo(st, 'manchester_fichin');
        assert.equal(lista[0].rivalId, 'monarca');
    });
});

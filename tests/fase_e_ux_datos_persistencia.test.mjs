/**
 * Batería de tests automatizados — FASE E (Etapas 27 a 33):
 *   - Etapa 27: Central Chaquito y navegación accesible
 *   - Etapa 28: Accesibilidad (daltonismo, alto contraste, fuente, controles táctiles zurdo/escala, símbolos sin color)
 *   - Etapa 29: Equipo Favorito explícito (jamás deducido del último partido)
 *   - Etapa 30: Historial permanente multi-temporada y Palmarés visual
 *   - Etapa 31: Récords históricos reales (sin datos inventados)
 *   - Etapa 32: Frontera Online vs Offline vs Cosméticos y rechazo de falsificación competitiva
 *   - Etapa 33: Persistencia y migración segura para cuentas antiguas en servidor HTTP real
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { scryptSync, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { EQUIPOS } from '../assets/equipos.js';
import { SECCIONES_NAVEGACION, construirEstadoCentralChaquito } from '../career/navegacion.js';
import {
    MODOS_DALTONISMO,
    normalizarPreferenciasAccesibilidad,
    obtenerPaletaAccesible,
    indicadorResultadoAccesible,
    aplicarClasesAccesibilidadDOM,
} from '../career/accesibilidad.js';
import {
    EquipoFavoritoStore,
    esEquipoFavoritoValido,
    sanitizarEquipoFavorito,
    describirEquipoFavorito,
} from '../career/favorito_perfil.js';
import { construirHistorialYPalmares, calcularRecordsReales } from '../career/records_palmares.js';
import {
    CLASIFICACION_SISTEMAS,
    validarPayloadPartidoCliente,
    aislarClienteParaOnline,
} from '../career/integracion_online.js';
import {
    migrarRegistroCuenta,
    migrarRegistroJugador,
    migrarRegistroPartido,
    sanitizarDatosCarreraServidor,
} from '../career/persistencia_migracion.js';
import { CarreraStore } from '../career/store.js';
import { HistorialLocalStore } from '../perfil.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function puertoLibre() {
    return new Promise((resolve, reject) => {
        const s = createServer();
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close((err) => (err ? reject(err) : resolve(port)));
        });
        s.on('error', reject);
    });
}

async function esperarServidor(base, timeoutMs = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        try {
            const r = await fetch(`${base}/api/version`);
            if (r.ok) return;
        } catch (_e) {
            /* reintentar */
        }
        await new Promise((res) => setTimeout(res, 60));
    }
    throw new Error('Timeout esperando arranque del servidor de prueba');
}

describe('FASE E — Etapas 27 y 28: Navegación y Accesibilidad', () => {
    test('Etapa 27: Central Chaquito incluye las 10 secciones requeridas e insignias en vivo', () => {
        const ids = SECCIONES_NAVEGACION.map((s) => s.id);
        for (const req of [
            'jugar',
            'liga',
            'copa',
            'arcade',
            'desafios',
            'mi_club',
            'perfil',
            'noticias',
            'ranking',
            'ajustes',
        ]) {
            assert.ok(ids.includes(req), `Falta sección requerida: ${req}`);
        }

        const estado = construirEstadoCentralChaquito({
            ligaActual: { terminada: false, fechaActual: 4 },
            copaActual: { terminada: false },
            noticiasNoLeidas: 3,
            desafiosCompletados: 2,
            totalDesafios: 5,
            equipoFavoritoId: 'retoneta',
            equiposCatalogo: EQUIPOS,
        });

        const porId = Object.fromEntries(estado.secciones.map((s) => [s.id, s]));
        assert.equal(porId.liga.badge, 'FECHA 5');
        assert.equal(porId.copa.badge, 'EN CURSO');
        assert.equal(porId.noticias.badge, '3 NUEVAS');
        assert.equal(porId.desafios.badge, '2/5');
        assert.match(porId.perfil.badge, /★/);
    });

    test('Etapa 28: normalización de accesibilidad, paletas daltónicas, símbolos sin color y clases DOM', () => {
        const def = normalizarPreferenciasAccesibilidad({
            colorblindMode: 'modo_inexistente',
            highContrast: 1,
            fontScale: 'gigante',
            touchScale: 'grande',
            touchHandedness: 'zurdo',
        });
        assert.deepEqual(def, {
            colorblindMode: 'off',
            highContrast: true,
            fontScale: 'normal',
            touchScale: 'grande',
            touchHandedness: 'zurdo',
        });

        assert.equal(obtenerPaletaAccesible({ colorblindMode: 'off' }).marcadorAnilloRival, false);
        for (const modo of ['deuteranopia', 'protanopia', 'tritanopia']) {
            const pal = obtenerPaletaAccesible({ colorblindMode: modo });
            assert.ok(MODOS_DALTONISMO[modo]);
            assert.equal(pal.marcadorAnilloRival, true);
            assert.notEqual(pal.localColor, pal.rivalColor);
        }

        // Indicadores no dependientes únicamente del color
        assert.equal(indicadorResultadoAccesible('win').simbolo, '▲');
        assert.equal(indicadorResultadoAccesible('loss').simbolo, '▼');
        assert.equal(indicadorResultadoAccesible('draw').simbolo, '◆');

        // Mock DOM para verificar clases en body y #touch-controls
        const makeClassList = () => {
            const set = new Set();
            return {
                toggle(cls, force) {
                    if (force) set.add(cls);
                    else set.delete(cls);
                },
                has(cls) {
                    return set.has(cls);
                },
            };
        };
        const mockTouch = { classList: makeClassList() };
        const mockDoc = {
            body: { classList: makeClassList(), dataset: {} },
            getElementById: (id) => (id === 'touch-controls' ? mockTouch : null),
        };

        aplicarClasesAccesibilidadDOM(
            {
                colorblindMode: 'tritanopia',
                highContrast: true,
                fontScale: 'grande',
                touchScale: 'compacto',
                touchHandedness: 'zurdo',
            },
            mockDoc
        );

        assert.equal(mockDoc.body.dataset.colorblind, 'tritanopia');
        assert.equal(mockDoc.body.classList.has('a11y-high-contrast'), true);
        assert.equal(mockDoc.body.classList.has('a11y-font-large'), true);
        assert.equal(mockTouch.classList.has('tc-zurdo'), true);
        assert.equal(mockTouch.classList.has('tc-scale-compacto'), true);
        assert.equal(mockTouch.classList.has('tc-scale-grande'), false);
    });
});

describe('FASE E — Etapas 29, 30 y 31: Equipo Favorito, Historial Permanente y Récords Reales', () => {
    test('Etapa 29: Equipo Favorito es explícito y jamás se deduce del último partido jugado', () => {
        EquipoFavoritoStore.reiniciar();
        HistorialLocalStore.limpiar();
        CarreraStore.reiniciar();

        assert.equal(EquipoFavoritoStore.obtener(), '');
        assert.equal(describirEquipoFavorito('', EQUIPOS).elegido, false);

        // Jugar partidos con El Boguero NO debe asignar automáticamente equipo favorito
        HistorialLocalStore.registrar({
            resultado: 'win',
            gf: 4,
            gc: 1,
            modo: 'liga',
            equipoLocal: 'el_boguero',
            equipoRival: 'macabro',
        });
        CarreraStore.procesarPartido({
            modo: 'liga',
            miEquipoId: 'el_boguero',
            rivalId: 'macabro',
            nombreMio: 'El Boguero',
            nombreRival: 'Macabro',
            ladoMio: 'local',
            golesMios: 4,
            golesOtro: 1,
        });

        assert.equal(EquipoFavoritoStore.obtener(), '', 'El equipo favorito no debe asumirse del último partido');

        // Selección explícita válida e inválida
        assert.equal(esEquipoFavoritoValido('cattarino'), true);
        assert.equal(esEquipoFavoritoValido('club_fantasma'), false);
        assert.equal(sanitizarEquipoFavorito('club_fantasma'), '');

        EquipoFavoritoStore.fijar('cattarino', { sincronizarRemoto: false });
        assert.equal(EquipoFavoritoStore.obtener(), 'cattarino');
        const desc = describirEquipoFavorito(EquipoFavoritoStore.obtener(), EQUIPOS);
        assert.equal(desc.elegido, true);
        assert.equal(desc.id, 'cattarino');
    });

    test('Etapa 30: comenzar una nueva temporada conserva intactas las campañas anteriores y el palmarés visual', () => {
        CarreraStore.reiniciar();

        // Cerrar Temporada 1 (subcampeón)
        CarreraStore.registrarTemporadaLiga({
            ligaId: 'liga_t1',
            miEquipo: 'retoneta',
            posicionFinal: 2,
            puntos: 26,
            gf: 22,
            gc: 10,
            campeonId: 'el_boguero',
            mejorJugador: 'Tito Gómez',
            botinDeOro: 'Lucho Paz (9)',
        });

        // Iniciar y cerrar Temporada 2 (campeón + premios)
        CarreraStore.registrarTituloCompeticion({
            competicion: 'liga',
            edicion: 'Liga Chaquito T2',
            clubId: 'retoneta',
        });
        CarreraStore.registrarPremiosTemporada({
            ligaId: 'liga_t2',
            campeon: { equipoId: 'retoneta', puntos: 31 },
            mejorJugador: { nombre: 'Nico Vera', equipoId: 'retoneta', resumen: '11 goles y 4 asistencias' },
            botinDeOro: { nombre: 'Nico Vera', equipoId: 'retoneta', goles: 11 },
            mejorArquero: { nombre: 'Mono Díaz', equipoId: 'retoneta', vallasInvictas: 6 },
        });
        CarreraStore.registrarTemporadaLiga({
            ligaId: 'liga_t2',
            miEquipo: 'retoneta',
            posicionFinal: 1,
            puntos: 31,
            gf: 29,
            gc: 7,
            campeonId: 'retoneta',
            mejorJugador: 'Nico Vera',
            botinDeOro: 'Nico Vera (11)',
        });

        const pal = construirHistorialYPalmares({
            carrera: CarreraStore.leer(),
            copaHistorial: [{ campeon: 'retoneta', subcampeon: 'macabro', marcadorFinal: '3-1', fecha: 1000 }],
            supercopaHistorial: [{ campeon: 'retoneta', subcampeon: 'el_boguero', gl: 2, gv: 1, fecha: 2000 }],
            historiaEstado: { campanaCompletada: true },
            equiposCatalogo: EQUIPOS,
        });

        assert.equal(pal.temporadas.length, 2, 'Ambas temporadas deben conservarse permanentemente');
        assert.equal(pal.temporadas[0].posicionFinal, 1);
        assert.equal(pal.temporadas[0].puntos, 31);
        assert.equal(pal.temporadas[1].posicionFinal, 2);
        assert.equal(pal.temporadas[1].puntos, 26);
        assert.equal(pal.copas.length, 1);
        assert.equal(pal.supercopas.length, 1);
        assert.ok(pal.mejoresJugadores.length >= 3);
        const vitrina = Object.fromEntries(pal.vitrinaVisual.map((v) => [v.id, v.cantidad]));
        assert.equal(vitrina.liga, 1);
        assert.equal(vitrina.historia, 1);
    });

    test('Etapa 31: los 8 récords usan exclusivamente datos reales (sin cifras inventadas en cuenta limpia)', () => {
        CarreraStore.reiniciar();
        HistorialLocalStore.limpiar();

        const vacios = calcularRecordsReales({
            carrera: CarreraStore.leer(),
            historialPartidos: [],
            equiposCatalogo: EQUIPOS,
        });
        assert.equal(vacios.length, 8);
        assert.ok(vacios.every((r) => r.registrado === false));

        // Registrar partido real con remontada (de ir perdiendo 0-2 a ganar 5-2 con gol al 89')
        CarreraStore.procesarPartido({
            modo: 'liga',
            miEquipoId: 'retoneta',
            rivalId: 'macabro',
            nombreMio: 'La Retoneta',
            nombreRival: 'Macabro',
            ladoMio: 'local',
            golesMios: 5,
            golesOtro: 2,
            golesDetalle: [
                { team: 'rival', nombre: 'Rival 9', minuto: 10, segundo: 12 },
                { team: 'rival', nombre: 'Rival 10', minuto: 21, segundo: 5 },
                { team: 'local', nombre: 'Enzo Ríos', minuto: 38, segundo: 30 },
                { team: 'local', nombre: 'Enzo Ríos', minuto: 54, segundo: 15 },
                { team: 'local', nombre: 'Enzo Ríos', minuto: 67, segundo: 44 },
                { team: 'local', nombre: 'Enzo Ríos', minuto: 81, segundo: 10 },
                { team: 'local', nombre: 'Enzo Ríos', minuto: 89, segundo: 55 },
            ],
        });
        CarreraStore.registrarTituloCompeticion({
            tipo: 'copa',
            campeonId: 'retoneta',
            esUsuario: true,
        });

        const reales = calcularRecordsReales({
            carrera: CarreraStore.leer(),
            historialPartidos: [],
            equiposCatalogo: EQUIPOS,
        });
        const mapa = Object.fromEntries(reales.map((r) => [r.id, r]));

        assert.equal(mapa.mayor_goleada.registrado, true);
        assert.match(mapa.mayor_goleada.valorTexto, /5-2/);
        assert.equal(mapa.mayor_remontada.registrado, true);
        assert.match(mapa.mayor_remontada.valorTexto, /levantó -2/);
        assert.equal(mapa.maximo_goleador.registrado, true);
        assert.match(mapa.maximo_goleador.valorTexto, /Enzo Ríos.*5 goles/);
        assert.equal(mapa.mas_victorias_consecutivas.registrado, true);
        assert.equal(mapa.mayor_cantidad_titulos.registrado, true);
        assert.equal(mapa.gol_mas_tardio.registrado, true);
        assert.match(mapa.gol_mas_tardio.valorTexto, /89'.*Enzo Ríos/);
        assert.equal(mapa.mejor_racha_invicta.registrado, true);
        assert.equal(mapa.partido_con_mas_goles.registrado, true);
        assert.match(mapa.partido_con_mas_goles.valorTexto, /7 goles/);
    });
});

describe('FASE E — Etapas 32 y 33: Seguridad Online, Persistencia y Migración Segura', () => {
    let port;
    let base;
    let dataDir;
    let dataFile;
    let child;

    before(async () => {
        port = await puertoLibre();
        base = `http://127.0.0.1:${port}`;
        dataDir = mkdtempSync(join(tmpdir(), 'chaquito-fase-e-'));
        dataFile = join(dataDir, 'datos_legacy.json');

        // Sembrar una base JSON de formato antiguo (pre-Fase E):
        // sin equipoFavorito, sin datosCarrera y partido antiguo sin equipoLocal/equipoRival
        const salt = randomBytes(16).toString('hex');
        const hash = scryptSync('claveantigua123', salt, 32).toString('hex');
        const legacyData = {
            v: 1,
            cuentas: [
                {
                    id: 'u_vet_1',
                    nombre: 'Veterano',
                    salt,
                    hash,
                    creada: 1700000000000,
                },
            ],
            sesiones: [],
            jugadores: [
                {
                    id: 'j_vet_1',
                    cuentaId: 'u_vet_1',
                    nombre: 'Veterano',
                    pj: 4,
                    pg: 3,
                    pp: 1,
                    pe: 0,
                    pts: 9,
                    gf: 8,
                    gc: 3,
                    ultimo: 1700000050000,
                },
            ],
            partidos: [
                {
                    id: 'p_vet_1',
                    cuentaId: 'u_vet_1',
                    nombre: 'Veterano',
                    resultado: 'win',
                    gf: 2,
                    gc: 0,
                    modo: 'solo',
                    cuando: 1700000050000,
                },
            ],
        };
        writeFileSync(dataFile, JSON.stringify(legacyData, null, 2), 'utf8');

        child = spawn(process.execPath, ['server.js'], {
            cwd: ROOT,
            env: {
                ...process.env,
                PORT: String(port),
                LIGA_DATA: dataFile,
                DATABASE_URL: '',
            },
            stdio: 'ignore',
        });
        await esperarServidor(base);
    });

    after(() => {
        if (child && !child.killed) {
            child.kill('SIGTERM');
        }
        if (dataDir) {
            rmSync(dataDir, { recursive: true, force: true });
        }
    });

    test('Etapa 32: clasificación de sistemas y aislamiento limpio de cliente al entrar a Online', () => {
        assert.ok(CLASIFICACION_SISTEMAS.offline.includes('modo_arcade'));
        assert.ok(CLASIFICACION_SISTEMAS.offline.includes('atributos_rasgos_plantel'));
        assert.ok(CLASIFICACION_SISTEMAS.onlineAutoritativo.includes('simulacion_partido_online'));
        assert.ok(CLASIFICACION_SISTEMAS.cosmeticos.includes('celebraciones_gol'));

        assert.equal(validarPayloadPartidoCliente({ modo: 'online' }).permitido, false);
        assert.equal(validarPayloadPartidoCliente({ modo: 'online' }).status, 403);
        assert.equal(validarPayloadPartidoCliente({ modo: 'arcade' }).permitido, false);
        assert.equal(validarPayloadPartidoCliente({ modo: 'desafio' }).permitido, false);
        assert.equal(validarPayloadPartidoCliente({ modo: 'historia' }).permitido, true);

        const mockGame = {
            modoLiga: { fecha: 2 },
            modoArcade: { mutador: 'super_tiro' },
            modoDesafio: { id: 'muro' },
            _ctrlArcade: {},
            _arcadeFinalizarTrasFestejo: true,
            ball: { arcadePowerMult: 1.65 },
            players: [{ attrMods: { velMult: 1.05 }, _arcadeFuria: true, _clutchActivo: true }],
        };
        aislarClienteParaOnline(mockGame);
        assert.equal(mockGame.modoLiga, null);
        assert.equal(mockGame.modoArcade, null);
        assert.equal(mockGame.modoDesafio, null);
        assert.equal(mockGame.ball.arcadePowerMult, 1);
        assert.equal(mockGame.players[0].attrMods, null);
        assert.equal(mockGame.players[0]._arcadeFuria, false);
        assert.equal(mockGame.players[0]._clutchActivo, false);
    });

    test('Etapa 33: helpers de migración conservan registros antiguos y acotan payloads', () => {
        const c = migrarRegistroCuenta({ nombre: 'Antiguo', hash: 'abc' });
        assert.equal(c.equipoFavorito, '');
        assert.equal(c.datosCarrera, null);

        const j = migrarRegistroJugador({ nombre: 'Antiguo', pts: 12 }, { equipoFavorito: 'trotenham' });
        assert.equal(j.pts, 12);
        assert.equal(j.equipoFavorito, 'trotenham');

        const p = migrarRegistroPartido({ resultado: 'win', gf: 3, gc: 1 });
        assert.equal(p.modo, 'solo');
        assert.equal(p.equipoLocal, '');

        const gigante = { carrera: { basura: 'x'.repeat(200_000) } };
        assert.equal(sanitizarDatosCarreraServidor(gigante), null);
    });

    test('Etapas 32 y 33 (HTTP): usuario antiguo inicia sesión, rechaza falsificación online/arcade y persiste favorito + carrera', async () => {
        // 1) Login de cuenta antigua sin perder sus puntos ni partidos previos
        const loginRes = await fetch(`${base}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: 'Veterano', password: 'claveantigua123' }),
        });
        assert.equal(loginRes.status, 200);
        const loginBody = await loginRes.json();
        assert.equal(loginBody.ok, true);
        assert.equal(loginBody.cuenta.equipoFavorito, '');
        const token = loginBody.token;
        assert.ok(token);

        // 2) Verificar que su partido antiguo sigue intacto con defaults migrados
        const histAntes = await (
            await fetch(`${base}/api/partidos`, {
                headers: { Authorization: `Bearer ${token}` },
            })
        ).json();
        assert.equal(histAntes.partidos.length, 1);
        assert.equal(histAntes.partidos[0].gf, 2);
        assert.equal(histAntes.partidos[0].modo, 'solo');

        // 3) Etapa 32: el servidor bloquea intento de falsificar partido online o inyectar arcade
        const fakeOnline = await fetch(`${base}/api/partido`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resultado: 'win', gf: 9, gc: 0, modo: 'online' }),
        });
        assert.equal(fakeOnline.status, 403);

        const fakeArcade = await fetch(`${base}/api/partido`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ resultado: 'win', gf: 9, gc: 0, modo: 'arcade' }),
        });
        assert.equal(fakeArcade.status, 403);

        // 4) Registrar partido válido de modo Historia con clubes reales
        const realHist = await fetch(`${base}/api/partido`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                resultado: 'win',
                gf: 3,
                gc: 1,
                modo: 'historia',
                equipoLocal: 'macabro',
                equipoRival: 'retoneta',
            }),
        });
        assert.equal(realHist.status, 200);

        // 5) Etapa 29: fijar Equipo Favorito explícito y verificarlo en /api/yo y /api/ranking
        const favRes = await fetch(`${base}/api/perfil/favorito`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ equipoFavorito: 'macabro' }),
        });
        assert.equal(favRes.status, 200);
        const favBody = await favRes.json();
        assert.equal(favBody.equipoFavorito, 'macabro');

        const yoBody = await (
            await fetch(`${base}/api/yo`, { headers: { Authorization: `Bearer ${token}` } })
        ).json();
        assert.equal(yoBody.cuenta.equipoFavorito, 'macabro');

        const histDespues = await (
            await fetch(`${base}/api/partidos`, { headers: { Authorization: `Bearer ${token}` } })
        ).json();
        assert.equal(histDespues.partidos.length, 2);
        assert.equal(histDespues.partidos[0].modo, 'historia');
        assert.equal(histDespues.partidos[0].equipoLocal, 'macabro');
        assert.equal(histDespues.partidos[0].equipoRival, 'retoneta');

        const rkBody = await (await fetch(`${base}/api/ranking`)).json();
        const filaVet = (rkBody.ranking || rkBody.jugadores || []).find((x) => x.nombre === 'Veterano');
        assert.ok(filaVet);
        // Etapa 32: el partido offline desde cliente NO infla los puntos competitivos del ranking global (siguen en 9)
        assert.equal(filaVet.pts, 9);
        assert.equal(filaVet.equipoFavorito, 'macabro');

        // 6) Etapa 33: respaldar y recuperar paquete completo de Carrera en /api/carrera
        const putCar = await fetch(`${base}/api/carrera`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                datosCarrera: {
                    equipoFavorito: 'macabro',
                    carrera: { reputacion: { general: 64 }, palmares: { ligas: 2, copas: 1, supercopas: 1 } },
                    desafios: { completados: { muro: { medalla: 'ORO' } } },
                    historia: { campanaCompletada: true },
                    copaHistorial: [{ campeon: 'macabro', subcampeon: 'retoneta', marcadorFinal: '2-0' }],
                },
            }),
        });
        assert.equal(putCar.status, 200);

        const getCar = await (
            await fetch(`${base}/api/carrera`, { headers: { Authorization: `Bearer ${token}` } })
        ).json();
        assert.equal(getCar.ok, true);
        assert.equal(getCar.datosCarrera.carrera.reputacion.general, 64);
        assert.equal(getCar.datosCarrera.desafios.completados.muro.medalla, 'ORO');
        assert.equal(getCar.datosCarrera.copaHistorial.length, 1);
    });
});

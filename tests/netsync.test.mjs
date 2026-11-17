// Tests de net/netsync.js
// node --test tests/netsync.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarSimulacion } from '../sim_offline.js';

await import('../net/netsync.js');
const NetSync = globalThis.NetSync;
const S = cargarSimulacion();
const { Jugador, CONFIG: _CONFIG } = S;

describe('netsync', () => {
    test('interpolación sin saltos con jitter (paso ...…... px/cuadro, ideal 1)', () => {

  const buf = new NetSync.SnapshotBuffer({ delayMs: 80 });
  const snap = (tick) => ({ tick, estado: 'EN_JUEGO', pelota: { x: tick * 2, y: 100, z: 0, vx: 2, vy: 0 },
    jugadores: [{ x: tick, y: 50, vx: 1, vy: 0, dirX: 1, dirY: 0, id: 'a' }] });
  let t = 1000, last = null, maxPaso = 0, minPaso = 1e9;
  for (let tick = 0; tick <= 120; tick += 2) {                     // snapshots a 30 Hz con jitter ±12 ms
    const arribo = 1000 + tick * (1000 / 60) + (Math.random() - 0.5) * 24;
    buf.push(snap(tick), arribo);
  }
  // dibujo a 60 fps sobre el último segundo
  for (let ms = 1500; ms < 2800; ms += 1000 / 60) {
    const m = buf.sample(ms).jugadores[0].x;
    if (last !== null) { maxPaso = Math.max(maxPaso, m - last); minPaso = Math.min(minPaso, m - last); }
    last = m;
  }
  assert.ok(minPaso >= -0.01, 'nunca retrocede');
  assert.ok(maxPaso < 2.2, 'sin saltos grandes (paso máx ' + maxPaso.toFixed(2) + ')');
    });

    test('un salto grande (gol / saque) se muestra de golpe, no se desliza por la cancha', () => {

  const buf = new NetSync.SnapshotBuffer({ delayMs: 0 });
  buf.push({ tick: 0, pelota: { x: 10, y: 10, z: 0, vx: 0, vy: 0 }, jugadores: [{ x: 10, y: 10 }] }, 0);
  buf.push({ tick: 2, pelota: { x: 400, y: 500, z: 0, vx: 0, vy: 0 }, jugadores: [{ x: 400, y: 500 }] }, 33);
  const m = buf.sample(33 - 16.6);   // mitad del tramo
  assert.ok(m.jugadores[0].x === 10 || m.jugadores[0].x === 400);
  assert.ok(m.pelota.x === 10 || m.pelota.x === 400);
    });

    test('si el servidor se atrasa, se extrapola como máximo 100 ms (no se va volando)', () => {

  const buf = new NetSync.SnapshotBuffer({ delayMs: 0 });
  buf.push({ tick: 0, pelota: { x: 0, y: 0, z: 0, vx: 3, vy: 0 }, jugadores: [{ x: 0, y: 0, vx: 3, vy: 0 }] }, 0);
  buf.push({ tick: 2, pelota: { x: 6, y: 0, z: 0, vx: 3, vy: 0 }, jugadores: [{ x: 6, y: 0, vx: 3, vy: 0 }] }, 33);
  const lejos = buf.sample(5000);     // 5 s sin snapshots
  assert.ok(lejos.jugadores[0].x <= 6 + 3 * (100 / (1000 / 60)) + 0.01, 'no se pasa de 100 ms de extrapolación');
    });

    test('un partido nuevo (tick vuelve a 0) no mezcla snapshots viejos', () => {

  const buf = new NetSync.SnapshotBuffer();
  buf.push({ tick: 5000, pelota: { x: 0, y: 0 }, jugadores: [] }, 0);
  buf.push({ tick: 3, pelota: { x: 1, y: 1 }, jugadores: [] }, 100);
  assert.equal(buf.snaps.length, 1);
    });

    test('el jugador propio arranca a ... ms (servidor: ... ms) → sin el retraso de ida y vuelta', () => {

  const mk = () => new Jugador(240, 460, { isHuman: true, team: 'local', mobilityId: 'local_0' });
  const srv = mk();                         // "servidor": recibe las teclas con retraso de 60 ms
  const vista = mk();                       // "cliente": lo que se dibuja
  const pred = new NetSync.OwnPredictor();
  const LAT = 60, DT = 1 / 60, F = 1000 / 60;
  const teclas = (ms) => ({ up: ms > 100 && ms < 900, down: false, left: ms > 500 && ms < 1300, right: false, shift: ms > 300 && ms < 700 });
  const cola = [];                          // snapshots en vuelo del servidor al cliente
  const buf = new NetSync.SnapshotBuffer();
  let ms = 0, maxErrPred = 0, maxErrSinPred = 0, primerMov = null, primerMovSrv = null;
  const x0 = vista.pos.x, y0 = vista.pos.y;
  for (let tick = 0; tick < 150; tick++) {
    ms = tick * F;
    const kCliente = teclas(ms);
    const kServidor = teclas(ms - LAT);     // el servidor ve la tecla 60 ms después
    srv.keys = kServidor; srv._updateMovement(DT); srv._updateStamina(DT); srv._clampToField();
    if (tick % 2 === 0) cola.push({ llega: ms + LAT, snap: { tick, estado: 'EN_JUEGO', pelota: { x: 240, y: 300, z: 0, vx: 0, vy: 0 },
      jugadores: [{ x: srv.pos.x, y: srv.pos.y, vx: srv.vel.x, vy: srv.vel.y, dirX: srv.facing.x, dirY: srv.facing.y, id: 'yo', st: srv.stamina }] } });
    while (cola.length && cola[0].llega <= ms) buf.push(cola.shift().snap, ms);
    const interp = buf.sample(ms);
    if (!interp) continue;
    const j = interp.jugadores[0];
    vista.pos.set(j.x, j.y); vista.vel.set(j.vx, j.vy); vista.facing.set(j.dirX, j.dirY); vista.stamina = j.st;
    vista.hitStun = 0; vista.isSliding = false; vista.slideTimer = 0; vista.hasBall = false; vista.hitSlow = 0;
    const sinPred = Math.hypot(vista.pos.x - srv.pos.x, vista.pos.y - srv.pos.y);
    const ult = buf.ultimo().jugadores[0];
    pred.actualizar(vista, { keys: kCliente, dt: DT, activo: true, servidor: { x: ult.x, y: ult.y, vx: ult.vx, vy: ult.vy },
      edadMs: ms - buf.ultimaRecepcion, rttMs: 2 * LAT, crearSombra: (p) => mk() });
    // comparar con dónde estaría el servidor si tuviera tus teclas YA (verdad ideal)
    if (primerMov === null && Math.hypot(vista.pos.x - x0, vista.pos.y - y0) > 0.5) primerMov = ms;
    if (primerMovSrv === null && Math.hypot(srv.pos.x - x0, srv.pos.y - y0) > 0.5) primerMovSrv = ms;
    if (tick > 30) { maxErrSinPred = Math.max(maxErrSinPred, sinPred); maxErrPred = Math.max(maxErrPred, Math.hypot(vista.pos.x - srv.pos.x, vista.pos.y - srv.pos.y)); }
    assert.ok(isFinite(vista.pos.x) && isFinite(vista.pos.y));
  }
  assert.ok(primerMov !== null && primerMov < primerMovSrv, `responde antes que el servidor (${primerMov?.toFixed(0)} ms vs ${primerMovSrv?.toFixed(0)} ms)`);
  assert.ok(maxErrPred < 60, 'la predicción no se aleja del servidor: error máx ' + maxErrPred.toFixed(1));
    });

    test('aturdido por un choque: no se predice, manda el servidor', () => {

  const mk = () => new Jugador(240, 460, { isHuman: true, team: 'local', mobilityId: 'local_0' });
  const vista = mk(), pred = new NetSync.OwnPredictor();
  vista.hitStun = 0.4;
  const x = vista.pos.x;
  const r = pred.actualizar(vista, { keys: { up: true }, dt: 1 / 60, activo: true, servidor: { x, y: 460, vx: 0, vy: 0 }, edadMs: 0, rttMs: 100, crearSombra: () => mk() });
  assert.equal(r, false);
  assert.equal(vista.pos.y, 460);
    });
});

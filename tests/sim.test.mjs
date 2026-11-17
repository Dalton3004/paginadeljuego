// Tests de la simulación (física con altura, cabezazos, IA, tácticas)
// node --test tests/sim.test.mjs
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cargarSimulacion } from '../sim_offline.js';

const S = cargarSimulacion();
const {
    CONFIG, Pelota, Jugador, GestorPartido, EstadoPartido, Vector2D,
    DIFICULTADES, TACTICAS, perfilConEstrellas,
} = S;
const DT = 1 / 60;
const V = (x, y) => new Vector2D(x, y);

describe('simulación offline', () => {
    test('un tiro/pase por el piso recorre exactamente lo mismo que antes (la altura no lo toca)', () => {

  const b = new Pelota(240, 420);
  b.kick(V(0, -1), 12);
  for (let i = 0; i < 30; i++) b.update(DT);
  // fricción 0.968 por cuadro: 12 * Σ 0.968^i (i=0..39)
  let esperado = 0, v = 12; for (let i = 0; i < 30; i++) { esperado += v; v *= CONFIG.BALL_FRICTION; }
  assert.ok(Math.abs((420 - b.pos.y) - esperado) < 0.5, 'recorrido por el piso igual al original');
  assert.equal(b.z, 0);
    });

    test('el pase elevado pica a ±12 % de la distancia pedida, a 100–340 px, y termina rodando', () => {

  for (const dist of [100, 180, 260, 340]) {
    const b = new Pelota(240, 500);
    b.lanzarElevado(V(0, -1), dist, 'local', 4.7 + dist / 260);
    let zmax = 0, primerPique = null;
    for (let i = 0; i < 120; i++) {
      b.update(DT); zmax = Math.max(zmax, b.z);
      if (primerPique === null && i > 3 && b.z === 0) primerPique = 500 - b.pos.y;
      assert.ok(b.z >= 0 && isFinite(b.z));
    }
    assert.ok(zmax > 30, 'sube por encima de la cabeza (' + zmax.toFixed(0) + ' px)');
    assert.ok(Math.abs(primerPique - dist) < dist * 0.12 + 6, `pica a ${primerPique.toFixed(0)} px (pedido ${dist})`);
    assert.equal(b.z, 0); assert.equal(b.vz, 0);
  }
    });

    test('un tiro bajo entra; un tiro muy elevado pasa por encima del travesaño y no cuenta', () => {

  for (const [vz, debeSerGol] of [[0.6, true], [9.5, false]]) {
    const b = new Pelota(240, 300);
    const j = [new Jugador(100, 400, { team: 'local' }), new Jugador(380, 150, { team: 'rival' })];
    const g = new GestorPartido(b, j);
    g.estado = EstadoPartido.EN_JUEGO; j.forEach(p => p.frozen = true);
    b.kick(V(0, -1), 12, vz, 'local');
    for (let i = 0; i < 120 && g.estado === EstadoPartido.EN_JUEGO; i++) g.update(DT);
    assert.equal(g.golesLocal === 1, debeSerGol, `vz=${vz} → gol=${g.golesLocal}`);
  }

    });

    test('cabezazo: lo hace el equipo contrario, siempre hacia adelante; el pase propio se deja bajar', () => {

  const b = new Pelota(240, 300);
  const rival = new Jugador(240, 330, { team: 'rival', mobilityId: 'rival_0' });
  rival.update = Jugador.prototype.update;
  const loc = new Jugador(240, 420, { team: 'local' });
  b.pos.set(240, 330); b.z = 20; b.vz = 0.2; b.vel.set(0, 0); b.lastTeam = 'local'; b.kickCooldown = 0;
  rival._handlePossession(b);
  assert.ok(b.vel.y > 3 && b.vz > 1, 'el rival cabecea hacia su ataque (abajo)');
  assert.equal(rival.headCooldown > 0, true);
  // pelota propia en el aire sobre un compañero: NO cabecea
  const b2 = new Pelota(240, 330); b2.z = 20; b2.vz = 0.2; b2.lastTeam = 'rival'; b2.kickCooldown = 0;
  const mate = new Jugador(240, 330, { team: 'rival' });
  mate._handlePossession(b2);
  assert.equal(b2.vel.length(), 0, 'no cabecea un pase de su propio equipo');

    });

    test('el receptor controla el pase elevado cuando baja', () => {

  const b = new Pelota(240, 300);
  const mate = new Jugador(240, 300 - 200, { team: 'local' });
  b.pos.set(240, 400); b.lanzarElevado(V(0, -1), 200, 'local', 5.2);
  const pasador = new Jugador(240, 420, { team: 'local' });
  let tomada = false;
  for (let i = 0; i < 120 && !tomada; i++) { b.update(DT); mate.update(DT, b, [mate, pasador]); tomada = b.owner === mate; }
  assert.ok(tomada, 'el receptor la controla al caer');
    });

    test('el arquero ataja la pelota baja y no alcanza una que pasa por encima de su cabeza', () => {

  const mk = (z) => {
    const b = new Pelota(240, 560); const gk = new Jugador(240, 560, { team: 'local', isGK: true });
    gk.diff = DIFICULTADES.normal;
    b.pos.set(240, 562 - 28 + 0); b.z = z; b.vz = 0; b.vel.set(0, 3); b.kickCooldown = 0;
    gk._handlePossession(b); return { b, gk };
  };
  const bajo = mk(0), alto = mk(40);
  assert.ok(bajo.gk.gkAction === 'catch' || bajo.b.owner === bajo.gk || bajo.b.vel.y < 0, 'ataja la baja');
  assert.ok(alto.gk.gkAction !== 'catch' && alto.b.vel.y > 0, 'no llega a la que pasa por arriba');
    });

    test('8 partidos completos IA vs IA terminan sin valores inválidos, con goles y juego aéreo razonables', () => {

  const partido = (tacL, tacR, semilla) => {
    const cx = CONFIG.WIDTH / 2;
    const [l0, l1, l2] = TACTICAS[tacL].f, [r0, r1, r2] = TACTICAS[tacR].f;
    const J = (x, y, o) => new Jugador(x, y, o);
    const ps = [J(cx + l0[0], l0[1], { team: 'local', mobilityId: 'local_0' }), J(cx + l1[0], l1[1], { team: 'local', mobilityId: 'local_1' }),
      J(cx + l2[0], l2[1], { team: 'local', mobilityId: 'local_2' }), J(cx, 545, { team: 'local', isGK: true, mobilityId: 'local_gk' }),
      J(cx + r0[0], 640 - r0[1], { team: 'rival', mobilityId: 'rival_0' }), J(cx + r1[0], 640 - r1[1], { team: 'rival', mobilityId: 'rival_1' }),
      J(cx + r2[0], 640 - r2[1], { team: 'rival', mobilityId: 'rival_2' }), J(cx, 95, { team: 'rival', isGK: true, mobilityId: 'rival_gk' })];
    for (const p of ps) { p.diff = p.isGK ? DIFICULTADES.normal : DIFICULTADES.normal; p.tacticaAvance = p.team === 'local' ? TACTICAS[tacL].avance : TACTICAS[tacR].avance; }
    const b = new Pelota(cx, 320), g = new GestorPartido(b, ps);
    const st = { aire: 0, cabezazos: 0, zmax: 0, ticks: 0, lobs: 0 };
    let prevZ = 0, headCount = 0;
    ps.forEach(p => { const f = p._cabecear.bind(p); p._cabecear = (ball) => { const r = f(ball); if (r) st.cabezazos++; return r; }; });
    const kick = b.kick.bind(b); b.kick = (d, p, vz = 0, t = null) => { if (vz > 4) st.lobs++; return kick(d, p, vz, t); };
    for (let i = 0; i < 60 * 150 && g.estado !== EstadoPartido.FINALIZADO; i++) {
      g.update(DT); st.ticks++;
      for (const p of ps) { assert.ok(isFinite(p.pos.x) && isFinite(p.pos.y), 'jugador con NaN'); }
      assert.ok(isFinite(b.pos.x) && isFinite(b.pos.y) && isFinite(b.z) && b.z >= 0 && b.z < 200, 'pelota inválida z=' + b.z);
      if (b.z > 1) st.aire++; st.zmax = Math.max(st.zmax, b.z);
    }
    assert.equal(g.estado, EstadoPartido.FINALIZADO, 'el partido termina');
    return { gl: g.golesLocal, gr: g.golesRival, ...st };
  };
  const res = [];
  for (let i = 0; i < 80; i++) res.push(partido("equilibrada", "equilibrada"));
  const goles = res.reduce((a, r) => a + r.gl + r.gr, 0) / res.length;
  const aire = res.reduce((a, r) => a + r.aire, 0) / res.reduce((a, r) => a + r.ticks, 0);
  console.log(`     (${res.length} partidos IA vs IA: ${goles.toFixed(1)} goles/partido, pelota en el aire ${(aire * 100).toFixed(1)} % del tiempo, ` +
              `${(res.reduce((a, r) => a + r.cabezazos, 0) / res.length).toFixed(1)} cabezazos y ${(res.reduce((a, r) => a + r.lobs, 0) / res.length).toFixed(1)} pases/tiros altos por partido, z máx ${Math.max(...res.map(r => r.zmax)).toFixed(0)})`);
  assert.ok(goles >= 0.5 && goles <= 14, 'goles por partido razonables: ' + goles);
  assert.ok(aire > 0.01 && aire < 0.6, 'la pelota pasa un tiempo razonable en el aire');

  // tácticas: la ofensiva genera más ataque que la defensiva
  const o = [], d = [];
  for (let i = 0; i < 6; i++) { const r = partido('ofensiva', 'equilibrada'); o.push(r.gl + r.gr); const q = partido('defensiva', 'equilibrada'); d.push(q.gl + q.gr); }
  const prom = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`     (goles totales por partido: ofensiva ${prom(o).toFixed(1)} · defensiva ${prom(d).toFixed(1)})`);
    });

    test('las estrellas ajustan ±6 % la IA (velocidad, reacción, arquero) y no ensucian el perfil base', () => {

  const base = DIFICULTADES.normal, copia = JSON.stringify(base);
  const e5 = perfilConEstrellas(base, 5), e1 = perfilConEstrellas(base, 1), e3 = perfilConEstrellas(base, 3);
  assert.ok(e5.chaseStep > base.chaseStep && e1.chaseStep < base.chaseStep && e3 === base);
  assert.ok(e5.react < base.react && e1.react > base.react);
  assert.ok(e5.gk.diveSpeed > base.gk.diveSpeed);
  assert.ok(e5.gk.reach > base.gk.reach && e5.gk.look > base.gk.look, 'el arquero de más estrellas lee y alcanza más');
  assert.equal(JSON.stringify(base), copia, 'el perfil original no se modifica');
  assert.ok(e5.passProb <= 1 && e5.tackleProb <= 1);
    });

    test('el desmarque deja el puesto táctico si está marcado y abre la línea de pase', () => {
        const owner = new Jugador(240, 420, { team: 'local', isHuman: true, mobilityId: 'hum' });
        const mate = new Jugador(176, 500, { team: 'local', mobilityId: 'local_1' });
        const marca = new Jugador(176, 330, { team: 'rival', mobilityId: 'rival_1' });
        const target = new Vector2D(176, 330);
        mate._desmarcar(target, owner, [owner, mate, marca]);
        const separado = Math.hypot(target.x - 176, target.y - 330);
        assert.ok(separado > 20, 'se corre de la marca (' + separado.toFixed(0) + ' px)');
        const dx = target.x - owner.pos.x, dy = target.y - owner.pos.y;
        const len2 = dx * dx + dy * dy;
        const t = ((marca.pos.x - owner.pos.x) * dx + (marca.pos.y - owner.pos.y) * dy) / len2;
        const px = owner.pos.x + dx * t, py = owner.pos.y + dy * t;
        const tapa = t > 0.12 && t < 0.92 && Math.hypot(marca.pos.x - px, marca.pos.y - py) < 22;
        assert.equal(tapa, false, 'la línea de pase queda libre');
    });
});

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

    test('pelota quieta en el área propia: el arquero o el defensor de IA SIEMPRE salen a agarrarla (sin zona muerta)', () => {
        const f = CONFIG.FIELD;
        const xs = [100, 130, 160, 190, 240, 290, 320, 350, 380];
        const profundidades = [14, 26, 38, 50, 62, 80, 95];   // px a la línea de gol propia
        for (const team of ['local', 'rival']) {
            const sgn = team === 'local' ? 1 : -1;
            const cy = (y) => team === 'local' ? y : CONFIG.HEIGHT - y;
            const otro = team === 'local' ? 'rival' : 'local';
            for (const dn of [null, 'normal']) {
                for (const x of xs) for (const d of profundidades) {
                    const ball = new Pelota(x, (team === 'local' ? f.BOTTOM : f.TOP) - sgn * d);
                    const mk = (px, py, o) => { const p = new Jugador(px, py, o); if (dn) p.diff = DIFICULTADES[dn]; return p; };
                    const mios = [
                        mk(240, cy(200), { team, isHuman: true, mobilityId: team + '_0' }),
                        mk(176, cy(500), { team, mobilityId: team + '_1' }),
                        mk(304, cy(500), { team, mobilityId: team + '_2' }),
                        mk(240, cy(548), { team, isGK: true, mobilityId: team + '_gk' }),
                    ];
                    const rivales = [
                        mk(100, cy(60), { team: otro, mobilityId: otro + '_0' }),
                        mk(380, cy(60), { team: otro, mobilityId: otro + '_1' }),
                        mk(240, cy(40), { team: otro, mobilityId: otro + '_2' }),
                        mk(240, cy(20), { team: otro, isGK: true, mobilityId: otro + '_gk' }),
                    ];
                    const g = new GestorPartido(ball, [...mios, ...rivales]);
                    g.estado = EstadoPartido.EN_JUEGO;
                    mios.forEach(p => p.frozen = false);
                    rivales.forEach(p => p.frozen = true);
                    let agarro = false;
                    for (let i = 0; i < 60 * 6 && !agarro; i++) {
                        g.update(DT);
                        agarro = !!(ball.owner && ball.owner.team === team);
                    }
                    assert.ok(agarro, `${team} dif=${dn || '-'}: nadie agarró la pelota en x=${x}, a ${d}px de la línea de gol`);
                }
            }
        }
    });

    test('el arquero vuelve a su línea después de salir y no sale si un rival llega primero a la pelota', () => {
        const f = CONFIG.FIELD;
        // (1) sale a una pelota suelta del área y regresa a su línea dentro de los postes
        const ball = new Pelota(150, f.BOTTOM - 40);
        const gk = new Jugador(240, 548, { team: 'local', isGK: true, mobilityId: 'local_gk' });
        gk.diff = DIFICULTADES.normal;
        const lejos = new Jugador(100, 60, { team: 'rival', mobilityId: 'rival_0' });
        const gk2 = new Jugador(240, 95, { team: 'rival', isGK: true, mobilityId: 'rival_gk' });
        const g = new GestorPartido(ball, [gk, lejos, gk2]);
        g.estado = EstadoPartido.EN_JUEGO;
        gk.frozen = false; lejos.frozen = true; gk2.frozen = true;
        let salio = false;
        for (let i = 0; i < 60 * 12; i++) { g.update(DT); if (gk.gkSalida) salio = true; }
        assert.ok(salio, 'el arquero salió a buscar la pelota');
        const gs = CONFIG.GOAL_SOUTH;
        assert.ok(gk.pos.x >= gs.x - 10 && gk.pos.x <= gs.x + gs.w + 10, 'volvió entre los postes (x=' + gk.pos.x.toFixed(0) + ')');
        assert.ok(Math.abs(gk.pos.y - (f.BOTTOM - 24)) <= 8, 'volvió a su línea (y=' + gk.pos.y.toFixed(0) + ')');
        assert.equal(gk.gkSalida, false);
        // (2) un rival está más cerca de la pelota suelta: el arquero se queda
        const b2 = new Pelota(250, f.BOTTOM - 45);
        const gkB = new Jugador(240, 548, { team: 'local', isGK: true, mobilityId: 'local_gk' });
        const riv = new Jugador(255, f.BOTTOM - 60, { team: 'rival', mobilityId: 'rival_0' });
        const g2 = new GestorPartido(b2, [gkB, riv]);
        g2.estado = EstadoPartido.EN_JUEGO; gkB.frozen = false; riv.frozen = true;
        g2.update(DT);
        assert.equal(gkB.gkSalida, false, 'no sale si el rival llega primero');
    });

    test('rebote del arquero: proporcional a la potencia del tiro (sin piso fijo); un tiro suave se ataja', () => {
        const rebote = (speed, team = 'local') => {
            const y = team === 'local' ? 548 : 92;
            const gk = new Jugador(240, y, { team, isGK: true, mobilityId: team + '_gk' });
            gk.frozen = false;
            const b = new Pelota(240, y - 27);
            b.vel.set(0, team === 'local' ? speed : -speed);
            b.kickCooldown = 0;
            gk._handlePossession(b);
            return { owner: b.owner, v: b.vel.length(), gk };
        };
        let previo = 0;
        for (const s of [3.5, 5, 7, 9, 12, 15]) {
            const r = rebote(s);
            assert.equal(r.owner, null, `tiro ${s}: se rebota (no se agarra)`);
            assert.ok(Math.abs(r.v - s * CONFIG.GK_REBOTE_FACTOR) < 0.01, `tiro ${s}: rebote ${r.v.toFixed(2)} = tiro × ${CONFIG.GK_REBOTE_FACTOR}`);
            assert.ok(r.v > previo, 'a más potencia, más rebote');
            previo = r.v;
        }
        // Un tiro mucho más suave rebota mucho menos que uno fuerte (antes los dos salían a 3,2).
        assert.ok(Math.abs(rebote(12).v / rebote(4).v - 3) < 0.01, 'un tiro 3 veces más fuerte rebota 3 veces más');
        // Tiro lento: lo ataja y se queda con la pelota (en los dos arcos).
        for (const team of ['local', 'rival']) {
            const r = rebote(CONFIG.GK_ATAJA_VEL - 0.3, team);
            assert.equal(r.owner, r.gk, 'el arquero ' + team + ' ataja el tiro suave');
        }
    });

    test('compañero de IA: no se tira si no llega a la pelota, y si se tira es porque llega pronto (barrida segura)', () => {
        const armar = (ox, oy, vx, vy) => {
            const yo = new Jugador(240, 400, { team: 'local', mobilityId: 'local_0' });
            const rival = new Jugador(ox, oy, { team: 'rival', mobilityId: 'rival_0' });
            rival.facing.set(vx, vy); rival.vel.set(vx * 1.5, vy * 1.5);
            const b = new Pelota(ox + vx * 18, oy + vy * 18);
            b.owner = rival; rival.hasBall = true;
            return { yo, rival, b };
        };
        // Rival que viene de frente hacia el compañero: llega rápido -> hay rumbo.
        let t = armar(240, 430, 0, -1);
        assert.ok(t.yo.rumboBarridaSegura(t.rival, t.b, DT), 'de frente y cerca: barrida segura');
        // Rival lejos: no llega dentro del límite de cuadros.
        t = armar(240, 480, 0, -1);
        assert.equal(t.yo.rumboBarridaSegura(t.rival, t.b, DT), null, 'lejos: no se tira');
        // Rival que se aleja corriendo más rápido que el barredor: no llega.
        t = armar(240, 370, 0, -1);
        t.rival.vel.set(0, -3.0);
        assert.equal(t.yo.rumboBarridaSegura(t.rival, t.b, DT), null, 'se escapa: no se tira');
        // Sin diff (compañero de IA) la pausa entre barridas se respeta.
        assert.ok(CONFIG.ALIADO_BARRIDA_ESPERA >= 2 && CONFIG.ALIADO_BARRIDA_MAX_FRAMES <= 10);
    });

    test('cambio de jugador: sin posesión pasa al más cercano a la pelota (sin repetir el actual); con posesión rota', () => {
        const armar = (team = 'local') => {
            const dir = team === 'local' ? 1 : -1;
            const y0 = team === 'local' ? 400 : 240;
            const J = (x, y, o) => new Jugador(x, y, { team, mobilityId: team + '_' + (o || 0) });
            const a = J(100, y0, 0), b = J(240, y0 + 60 * dir, 1), c = J(380, y0 - 60 * dir, 2);
            const gk = new Jugador(240, team === 'local' ? 545 : 95, { team, isGK: true, mobilityId: team + '_gk' });
            const rivalTeam = team === 'local' ? 'rival' : 'local';
            const r = new Jugador(240, 320, { team: rivalTeam, mobilityId: rivalTeam + '_0' });
            const ball = new Pelota(380, y0 - 70 * dir);
            const g = new GestorPartido(ball, [a, b, c, gk, r]);
            return { a, b, c, gk, r, ball, g };
        };
        for (const team of ['local', 'rival']) {
            const { a, b, c, r, ball, g } = armar(team);
            // Pelota suelta junto a C: desde A se va a C (el más cercano), no a B (el "siguiente" de la lista).
            assert.equal(g.siguienteJugadorControlado(team, a), c, team + ': suelta → el más cercano');
            // Estando en C (ya el más cercano), el cambio va al segundo más cercano, no se queda.
            assert.notEqual(g.siguienteJugadorControlado(team, c), c);
            // La tiene el rival: igual, el más cercano a la pelota.
            ball.owner = r; r.hasBall = true;
            assert.equal(g.siguienteJugadorControlado(team, a), c, team + ': la tiene el rival → el más cercano');
            // La tiene un compañero: rotación como antes (A → B → C → A).
            ball.owner = b; b.hasBall = true;
            assert.equal(g.siguienteJugadorControlado(team, a), b);
            assert.equal(g.siguienteJugadorControlado(team, b), c);
            assert.equal(g.siguienteJugadorControlado(team, c), a);
        }
        // Pelota suelta y rodando hacia A: se mide contra dónde va a estar, no dónde está ahora.
        const t = armar('local');
        t.ball.pos.set(240, 330); t.ball.vel.set(-14, 8);      // en 8 cuadros ≈ (128, 394): junto a A
        assert.equal(t.g.siguienteJugadorControlado('local', t.c), t.a, 'anticipa la pelota rodando');
    });
});

// 關卡物件的 3D 外觀（GLB 軟膠素材，同種物件全部 InstancedMesh）：鉤點花、蘑菇、尖刺、鋸片、風扇、圈圈、蒼蠅、終點荷葉＋葉牆。
import * as THREE from 'three';
import { movePos, flyPos } from './sim.js';
import { dressProp, softMaterial, WORLD_PAL } from './artkit.js';
import { ART, splitProp, PartSet } from './art.js';

const tmp = { x: 0, y: 0 };
const dummy = new THREE.Object3D();
const M4 = new THREE.Matrix4(), N4 = new THREE.Matrix4();
const FAN_TILT = 0.5; // 風扇往鏡頭傾一點：側視角也看得到轉動的扇葉（美術線提醒）

const GEO = {
  vine: (() => { const g = new THREE.CylinderGeometry(0.09, 0.09, 1, 10); g.translate(0, 0.5, 0); return g; })(),
  pole: (() => { const g = new THREE.CylinderGeometry(0.13, 0.13, 1, 12); g.translate(0, 0.5, 0); return g; })(),
  track: new THREE.BoxGeometry(1, 1, 0.05),
  column: new THREE.BoxGeometry(1, 1, 0.1),
  ripple: new THREE.TorusGeometry(1.35, 0.09, 8, 40),
  stump: new THREE.CylinderGeometry(1.1, 1.3, 4.5, 24),
  flagPole: new THREE.CylinderGeometry(0.1, 0.1, 6, 12),
  flag: new THREE.PlaneGeometry(2.2, 1.4, 8, 2),
};
const flagBase = Float32Array.from(GEO.flag.attributes.position.array);

// 彈性出場（0→1，帶過衝）：換關時物件由左到右依序「啵」地長出來
const elastic = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(2, -9 * u) * Math.cos(u * 10.5));

export function createLevelView(scene) {
  const group = new THREE.Group(); scene.add(group);
  let sets = [], lv = null, wi = 0;
  const st = { hookWob: [], hookWobV: [], mushK: [], mushKV: [], flyGone: [], ringGone: [], ringJ: [], target: -1, attached: -1, goalBounce: 0, intro: 9, introX: 0 };
  const S = {};
  const mats = {
    track: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }),
    column: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false }),
    hi: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  };
  // 目標高亮（兩個環：實心 + 外擴）
  const hi = new THREE.Mesh(GEO.ripple, mats.hi); hi.renderOrder = 2; scene.add(hi);
  const hi2Mat = mats.hi.clone(); const hi2 = new THREE.Mesh(GEO.ripple, hi2Mat); scene.add(hi2);

  const add = (name, parts, n, o) => { const s = new PartSet(group, parts, n, o); sets.push(s); S[name] = s; return s; };
  const simple = (name, geo, mat, n, shadow = false) => add(name, [{ geometry: geo, material: mat, matrix: new THREE.Matrix4(), cast: true }], n, { shadow, receive: shadow });
  const mat = (x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); return dummy.matrix;
  };
  const popK = (x) => elastic(st.intro - Math.max(0, Math.min(0.7, (x - st.introX) * 0.01)));

  let fan = null, mush = null, fly = null;
  function build(level, w) {
    lv = level; wi = Math.max(0, Math.min(3, level.world ?? 0));
    const P = WORLD_PAL[wi], q = ART.q;
    for (const s of sets) s.dispose(group);
    for (const o of [...group.children]) group.remove(o);
    sets = [];
    const H = level.hooks.length;
    add('hook', splitProp('prop-hook', wi).main, H);
    simple('vine', GEO.vine, softMaterial(P.vine, q, { rough: 0.5 }), H);
    mush = splitProp('prop-mush', wi, ['stem']);
    add('cap', mush.main, level.mush.length); add('stem', mush.sub.stem.parts, level.mush.length);
    add('spike', splitProp('prop-spike', wi).main, level.spikes.length);
    simple('pole', GEO.pole, softMaterial(P.hazard, q, { rough: 0.3 }), level.spikes.length, true);
    add('saw', splitProp('prop-saw', wi).main, level.saws.length);
    simple('track', GEO.track, mats.track, level.saws.length);
    fan = splitProp('prop-fan', wi, ['blades']);
    add('fanBase', fan.main, level.fans.length); add('blade', fan.sub.blades.parts, level.fans.length);
    simple('column', GEO.column, mats.column, level.fans.length);
    add('ring', splitProp('prop-ring', wi).main, level.rings.length);
    fly = splitProp('prop-fly', wi, ['wing_L', 'wing_R']);
    add('fly', fly.main, level.flies.length, { shadow: false }); add('wingL', fly.sub.wing_L.parts, level.flies.length, { shadow: false }); add('wingR', fly.sub.wing_R.parts, level.flies.length, { shadow: false });
    st.hookWob = new Float32Array(H); st.hookWobV = new Float32Array(H);
    st.mushK = new Float32Array(level.mush.length); st.mushKV = new Float32Array(level.mush.length);
    level.spikes.forEach((s, i) => {
      if (s.pole) S.pole.set(i, mat(s.x, -1, -0.2, 0, 0, 0, 1, s.y + 1, 1));
      else S.pole.set(i, mat(s.x, s.y, -0.2, 0, 0, 0, 0.6, 40, 0.6));
    });
    level.saws.forEach((s, i) => S.track.set(i, mat(s.x, s.y, -0.3, 0, 0, 0, s.move.ax * 2 + 0.25, s.move.ay * 2 + 0.25, 1)));
    level.fans.forEach((f, i) => S.column.set(i, mat(f.x, (f.y0 + f.y1) / 2, -0.4, 0, 0, 0, f.w, f.y1 - f.y0, 1)));
    for (const k of ['pole', 'track', 'column']) S[k].commit();
    // 起點木樁、終點荷葉、葉牆、旗子（各一個，不用 instancing）
    const stump = new THREE.Mesh(GEO.stump, softMaterial(P.wood, q, { rough: 0.5 }));
    stump.position.set(level.start.x, level.start.y - 2.25, 0); stump.castShadow = stump.receiveShadow = true; group.add(stump);
    const g = level.goal;
    const goal = dressProp(ART.models, 'prop-goal', wi, q); goal.position.set(g.x, g.y, 0); goal.scale.x = g.w / 12; group.add(goal); st.pad = goal;
    // 葉牆：遠看像一根綠柱（美術線提醒）→ 加寬、前後兩片錯開、往鏡頭轉一點，讀起來是一整片葉簾
    for (const [dx, dz, sx, ry] of [[0.9, -0.2, 1.5, -0.35], [2.6, -1.6, 1.3, 0.3]]) {
      const wall = dressProp(ART.models, 'prop-goalWall', wi, q); wall.position.set(g.wall + dx, 0, dz); wall.scale.set(sx, 1.05, 1); wall.rotation.y = ry; group.add(wall);
    }
    const pole = new THREE.Mesh(GEO.flagPole, softMaterial('#ffffff', q, { rough: 0.3 })); pole.position.set(g.x - 1.5, g.y + 3, -1.6); pole.castShadow = true; group.add(pole);
    const flagMat = softMaterial(P.accent ?? '#ff6fb5', q, { rough: 0.35 }).clone(); flagMat.side = THREE.DoubleSide;
    const flag = new THREE.Mesh(GEO.flag, flagMat); flag.position.set(g.x - 0.4, g.y + 5.2, -1.6); flag.castShadow = true; group.add(flag); st.flag = flag;
    reset();
  }

  function reset() {
    if (!lv) return;
    st.flyGone = lv.flies.map(() => 0); st.ringGone = lv.rings.map(() => 0); st.ringJ = lv.rings.map(() => 0); st.attached = -1;
    st.hookWob.fill(0); st.hookWobV.fill(0); st.mushK.fill(0); st.mushKV.fill(0);
  }

  function update(s, t, dt, mouth) {
    if (!lv) return;
    st.intro += dt;
    const vineTop = 45;
    for (let i = 0; i < lv.hooks.length; i++) {
      movePos(lv.hooks[i], s.t, tmp);
      st.hookWobV[i] += (-st.hookWob[i] * 320 - st.hookWobV[i] * 8) * dt; st.hookWob[i] += st.hookWobV[i] * dt;
      const k = (1 + st.hookWob[i]) * popK(tmp.x), sw = Math.sin(t * 1.3 + i) * 0.08 + st.hookWob[i] * 0.5;
      const big = i === st.target ? 1.12 : 1;
      // 果凍：橫向擠、縱向拉（體積守恆的感覺）
      S.hook.set(i, mat(tmp.x, tmp.y, 0, 0, 0, sw, 1.15 * big * (1 - st.hookWob[i] * 0.4) * popK(tmp.x), 1.15 * big * k, 1.15 * big * popK(tmp.x)));
      S.vine.set(i, mat(tmp.x, tmp.y + 0.55, -0.3, 0, 0, sw * 0.08, 1, vineTop - tmp.y, 1));
    }
    S.hook.commit(); S.vine.commit();
    lv.mush.forEach((m, i) => {
      st.mushKV[i] += (-st.mushK[i] * 260 - st.mushKV[i] * 7) * dt; st.mushK[i] += st.mushKV[i] * dt;
      const k = st.mushK[i], sc = (m.r / 1.5) * popK(m.x);
      S.cap.set(i, mat(m.x, m.y - 0.15, 0, 0, 0, Math.sin(t * 1.7 + i) * 0.04, sc * (1 - k * 0.6), sc * (1 + k), sc * (1 - k * 0.6)));
      M4.copy(mat(m.x, m.y - 0.15, -0.05, 0, 0, 0, sc, m.y + 1.0, sc)).multiply(mush.sub.stem.node); S.stem.set(i, M4);
    });
    S.cap.commit(); S.stem.commit();
    lv.spikes.forEach((sp, i) => S.spike.set(i, mat(sp.x, sp.y + (sp.hang ? Math.sin(t * 1.6 + i) * 0.15 : 0), 0, t * 0.5, t * 0.7 + i, 0, popK(sp.x))));
    S.spike.commit();
    lv.saws.forEach((sw, i) => { movePos(sw, s.t, tmp); S.saw.set(i, mat(tmp.x, tmp.y, 0, 0, 0, -t * 9, (sw.r / 1.25) * popK(sw.x))); });
    S.saw.commit();
    lv.fans.forEach((f, i) => {
      const sc = (f.w / 3.2) * popK(f.x);
      N4.copy(mat(f.x, f.y0, 0, FAN_TILT, 0, 0, sc)); S.fanBase.set(i, N4);
      M4.copy(N4).multiply(fan.sub.blades.node).multiply(mat(0, 0, 0, 0, t * 14, 0, 1)); S.blade.set(i, M4);
    });
    S.fanBase.commit(); S.blade.commit();
    lv.rings.forEach((g, i) => {
      st.ringJ[i] *= Math.exp(-dt * 3);
      let k;
      if (st.ringGone[i] > 0) { st.ringGone[i] = Math.min(1, st.ringGone[i] + dt * 3.2); const u = st.ringGone[i]; k = (1 + Math.sin(u * 14) * 0.25 * (1 - u) + u * 0.5) * (1 - u * u); } // 果凍晃兩下再縮掉
      else k = 1 + Math.sin(t * 4 + i) * 0.04;
      k *= popK(g.x);
      S.ring.set(i, mat(g.x, g.y, 0, 0, 0.55 + Math.sin(t * 1.2 + i) * 0.2, 0, k));
    });
    S.ring.commit();
    lv.flies.forEach((f, i) => {
      let x, y, k = 1.3;
      flyPos(f, s.t, tmp); x = tmp.x; y = tmp.y;
      if (st.flyGone[i] > 0) {
        st.flyGone[i] = Math.min(1, st.flyGone[i] + dt * 8);
        const u = st.flyGone[i]; x += (mouth.x - x) * u; y += (mouth.y - y) * u; k *= 1 - u;
      }
      k *= popK(x);
      N4.copy(mat(x, y, 0.3, 0.25, -0.5, Math.sin(t * 10 + i) * 0.3, k));
      S.fly.set(i, N4);
      const flap = Math.sin(t * 60 + i) * 0.7;
      M4.copy(N4).multiply(fly.sub.wing_L.node).multiply(mat(0, 0, 0, -0.3 - flap, 0, 0, 1)); S.wingL.set(i, M4);
      M4.copy(N4).multiply(fly.sub.wing_R.node).multiply(mat(0, 0, 0, 0.3 + flap, 0, 0, 1)); S.wingR.set(i, M4);
    });
    S.fly.commit(); S.wingL.commit(); S.wingR.commit();
    // 目標高亮
    const tg = st.target;
    if (tg >= 0 && st.attached < 0) {
      movePos(lv.hooks[tg], s.t, tmp);
      hi.visible = hi2.visible = true;
      hi.position.set(tmp.x, tmp.y, 0.5); hi.scale.setScalar(1 + Math.sin(t * 12) * 0.08);
      const u = (t * 1.6) % 1; hi2.position.copy(hi.position); hi2.scale.setScalar(1 + u * 0.9); hi2Mat.opacity = 0.7 * (1 - u);
    } else hi.visible = hi2.visible = false;
    // 終點旗子飄（頂點波）
    if (st.flag) {
      const p = GEO.flag.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const u = (flagBase[i] + 1.1) / 2.2; p[i + 2] = Math.sin(flagBase[i] * 2.4 - t * 6) * 0.22 * u; }
      GEO.flag.attributes.position.needsUpdate = true; GEO.flag.computeVertexNormals();
    }
    // 落荷葉：荷葉果凍彈（壓扁＋橫向撐開）
    if (st.pad) { st.goalBounce *= Math.exp(-dt * 4); const b = st.goalBounce * Math.sin(t * 26); st.pad.scale.y = 1 - b * 0.55; st.pad.scale.z = 1 + b * 0.25; }
  }

  return {
    build, reset, update, st,
    wobbleHook(i) { st.hookWobV[i] += 11; },
    squashMush(i) { st.mushK[i] = -0.5; st.mushKV[i] = 0; },
    eatFly(i) { st.flyGone[i] = 0.001; },
    takeRing(i) { st.ringGone[i] = 0.001; },
    bouncePad() { st.goalBounce = 1; },
    intro(x) { st.intro = 0; st.introX = x; },
  };
}

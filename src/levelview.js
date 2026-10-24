// 關卡物件的 3D 外觀（全部 InstancedMesh，draw call 固定）：鉤點花、蘑菇、尖刺、鋸片、風扇、圈圈、蒼蠅、終點荷葉。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { movePos, flyPos } from './sim.js';
import { tint } from './scene.js';

const lam = (o) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });
const TAU = Math.PI * 2;
const tmp = { x: 0, y: 0 };
const dummy = new THREE.Object3D();

function capGeo() {
  const g = new THREE.SphereGeometry(1, 10, 5, 0, TAU, 0, Math.PI / 2).toNonIndexed();
  g.scale(1.65, 1.15, 1.65);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  let seed = 7;
  for (let i = 0; i < n; i += 3) {
    seed = (seed * 16807) % 2147483647;
    const spot = seed % 100 < 28 ? 1 : 0;
    for (let k = 0; k < 3; k++) col.set(spot ? [1, 1, 1] : [0, 0, 0], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.mask = Float32Array.from({ length: n }, (_, i) => col[i * 3]);
  return g;
}
// mask 0 → 顏色 a，1 → 顏色 b（換世界時重新上色）
function recolor(g, a, b) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b), col = g.attributes.color, m = g.userData.mask;
  for (let i = 0; i < col.count; i++) { const c = m[i] ? cb : ca; col.setXYZ(i, c.r, c.g, c.b); }
  col.needsUpdate = true;
}
function spikeGeo() {
  const parts = [tint(new THREE.IcosahedronGeometry(0.62, 0), '#ffffff', 0.15)];
  const ico = new THREE.IcosahedronGeometry(1, 0), p = ico.attributes.position, seen = new Set();
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize(), key = v.toArray().map((a) => a.toFixed(2)).join();
    if (seen.has(key)) continue; seen.add(key);
    const c = new THREE.ConeGeometry(0.24, 0.62, 4); c.translate(0, 0.78, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
    parts.push(tint(c, '#ffffff'));
  }
  const g = mergeGeometries(parts), nb = parts[0].attributes.position.count;
  g.userData.mask = Float32Array.from({ length: g.attributes.position.count }, (_, i) => (i < nb ? 0 : 1));
  return g;
}
function sawGeo() {
  const parts = [tint(new THREE.CylinderGeometry(1.05, 1.05, 0.18, 14), '#ffffff', 0.1), tint(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8), '#555555')];
  for (let i = 0; i < 12; i++) {
    const c = new THREE.ConeGeometry(0.2, 0.42, 3); c.rotateZ(-Math.PI / 2); c.translate(1.18, 0, 0); c.rotateY((i / 12) * TAU);
    parts.push(tint(c, '#ffffff'));
  }
  const g = mergeGeometries(parts); g.rotateX(Math.PI / 2); return g;
}
function bladeGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) { const b = new THREE.BoxGeometry(1.2, 0.08, 0.36); b.translate(0.6, 0, 0); b.rotateY((i / 3) * TAU); parts.push(b); }
  return mergeGeometries(parts);
}

const GEO = {
  petal: (() => { const g = new THREE.DodecahedronGeometry(0.85, 0); g.scale(1, 1, 0.35); return g; })(),
  bud: new THREE.IcosahedronGeometry(0.42, 0),
  vine: (() => { const g = new THREE.CylinderGeometry(0.07, 0.07, 1, 5); g.translate(0, 0.5, 0); return g; })(),
  cap: capGeo(),
  stem: (() => { const g = new THREE.CylinderGeometry(0.42, 0.6, 1, 7); g.translate(0, -0.5, 0); return g; })(),
  spike: spikeGeo(),
  pole: (() => { const g = new THREE.CylinderGeometry(0.12, 0.12, 1, 5); g.translate(0, 0.5, 0); return g; })(),
  saw: sawGeo(),
  track: new THREE.BoxGeometry(1, 1, 0.05),
  fanBase: (() => { const g = new THREE.CylinderGeometry(1.5, 1.7, 0.7, 8); return g; })(),
  blade: bladeGeo(),
  column: new THREE.BoxGeometry(1, 1, 0.1),
  ring: new THREE.TorusGeometry(1.9, 0.2, 6, 22),
  flyBody: new THREE.IcosahedronGeometry(0.3, 0),
  wing: (() => { const g = new THREE.CircleGeometry(0.32, 6); g.scale(1, 0.55, 1); return g; })(),
  pad: new THREE.CylinderGeometry(1, 1, 0.45, 22, 1, false, 0.35, TAU - 0.7),
  ripple: new THREE.TorusGeometry(1.25, 0.08, 4, 24),
};

export function createLevelView(scene) {
  const group = new THREE.Group(); scene.add(group);
  let meshes = [], lv = null, theme = null;
  const st = { hookWob: [], hookWobV: [], mushK: [], mushKV: [], flyGone: [], ringGone: [], target: -1, attached: -1, goalBounce: 0 };
  const M = {};
  const mats = {
    petal: lam({ color: '#ff6fb5' }), bud: lam({ color: '#ffd23f' }), vine: lam({ color: '#27ae60' }),
    cap: lam({ color: '#ffffff', vertexColors: true }), stem: lam({ color: '#f5e6c8' }),
    spike: lam({ color: '#ffffff', vertexColors: true }), pole: lam({ color: '#6b4f3a' }),
    saw: new THREE.MeshPhongMaterial({ color: '#c0c8d0', vertexColors: true, flatShading: true, shininess: 80 }),
    track: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }),
    fanBase: lam({ color: '#6b4f3a' }), blade: lam({ color: '#dddddd' }),
    column: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.13, depthWrite: false }),
    ring: new THREE.MeshPhongMaterial({ color: '#ffd23f', emissive: '#7a5a00', shininess: 70, flatShading: true }),
    fly: lam({ color: '#222233' }), wing: new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    pad: lam({ color: '#2ecc71' }), wood: lam({ color: '#8b5a2b' }),
    hi: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  };
  // 目標高亮（兩個環：實心 + 外擴）
  const hi = new THREE.Mesh(GEO.ripple, mats.hi); hi.renderOrder = 2; scene.add(hi);
  const hi2Mat = mats.hi.clone(); const hi2 = new THREE.Mesh(GEO.ripple, hi2Mat); scene.add(hi2);

  const inst = (name, geo, mat, n, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.castShadow = shadow; m.receiveShadow = shadow;
    m.frustumCulled = false; group.add(m); meshes.push(m); M[name] = m; return m;
  };
  const set = (m, i, x, y, z, rx, ry, rz, sx, sy = sx, sz = sx) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
  };

  function build(level, w) {
    lv = level; theme = w;
    for (const m of meshes) { group.remove(m); m.dispose(); }
    for (const o of [...group.children]) group.remove(o);
    meshes = [];
    mats.petal.color.set(w.petal); mats.bud.color.set(w.bud); mats.vine.color.set(w.vine);
    recolor(GEO.cap, w.cap, w.capSpot); recolor(GEO.spike, w.hazard, w.hazardTip);
    mats.stem.color.set(w.stem); mats.pole.color.set(w.hazard);
    mats.saw.color.set(w.saw); mats.fanBase.color.set(w.wood); mats.pad.color.set(w.pad); mats.wood.color.set(w.wood);
    const neon = w.props === 'city' || w.props === 'volcano';
    mats.petal.emissive.set(neon ? w.petal : '#000000'); mats.petal.emissiveIntensity = neon ? 0.55 : 0;
    mats.bud.emissive.set(neon ? w.bud : '#000000'); mats.bud.emissiveIntensity = neon ? 0.4 : 0;
    const H = level.hooks.length;
    inst('petal', GEO.petal, mats.petal, H); inst('bud', GEO.bud, mats.bud, H); inst('vine', GEO.vine, mats.vine, H, false);
    inst('cap', GEO.cap, mats.cap, level.mush.length); inst('stem', GEO.stem, mats.stem, level.mush.length);
    inst('spike', GEO.spike, mats.spike, level.spikes.length); inst('pole', GEO.pole, mats.pole, level.spikes.length, false);
    inst('saw', GEO.saw, mats.saw, level.saws.length); inst('track', GEO.track, mats.track, level.saws.length, false);
    inst('fanBase', GEO.fanBase, mats.fanBase, level.fans.length); inst('blade', GEO.blade, mats.blade, level.fans.length);
    inst('column', GEO.column, mats.column, level.fans.length, false);
    inst('ring', GEO.ring, mats.ring, level.rings.length);
    inst('fly', GEO.flyBody, mats.fly, level.flies.length, false); inst('wing', GEO.wing, mats.wing, level.flies.length * 2, false);
    st.hookWob = new Float32Array(H); st.hookWobV = new Float32Array(H);
    st.mushK = new Float32Array(level.mush.length); st.mushKV = new Float32Array(level.mush.length);
    level.mush.forEach((m, i) => set(M.stem, i, m.x, m.y + 0.05, -0.1, 0, 0, 0, 1, m.y + 1.2, 1));
    level.spikes.forEach((s, i) => {
      if (s.pole) set(M.pole, i, s.x, -1, -0.2, 0, 0, 0, 1, s.y + 1, 1);
      else set(M.pole, i, s.x, s.y, -0.2, 0, 0, 0, 0.7, 40, 0.7);
    });
    level.saws.forEach((s, i) => {
      const ax = s.move.ax, ay = s.move.ay;
      set(M.track, i, s.x, s.y, -0.3, 0, 0, 0, ax * 2 + 0.25, ay * 2 + 0.25, 1);
    });
    level.fans.forEach((f, i) => {
      set(M.fanBase, i, f.x, f.y0, 0, 0, 0, 0, f.w / 3.2);
      set(M.column, i, f.x, (f.y0 + f.y1) / 2, -0.4, 0, 0, 0, f.w, f.y1 - f.y0, 1);
    });
    for (const m of [M.stem, M.pole, M.track, M.fanBase, M.column]) m.instanceMatrix.needsUpdate = true;
    // 起點木樁、終點荷葉、後牆
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.5, 8), mats.wood);
    stump.position.set(level.start.x, level.start.y - 2.25, 0); stump.castShadow = stump.receiveShadow = true; group.add(stump);
    const g = level.goal;
    const pad = new THREE.Mesh(GEO.pad, mats.pad); pad.scale.set(g.w * 0.5, 1, g.w * 0.32); pad.position.set(g.x, g.y - 0.22, 0);
    pad.receiveShadow = true; group.add(pad); st.pad = pad;
    const flower = new THREE.Group(); flower.position.set(g.x + g.w * 0.3, g.y + 0.2, -1.2); group.add(flower);
    for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(GEO.petal, mats.petal); p.scale.set(0.9, 0.5, 1.3); p.rotation.set(-0.9, (i / 6) * TAU, 0); p.position.set(Math.sin((i / 6) * TAU) * 0.6, 0.3, Math.cos((i / 6) * TAU) * 0.6); flower.add(p); }
    const fc = new THREE.Mesh(GEO.bud, mats.bud); fc.position.y = 0.6; flower.add(fc);
    // 終點後面的一叢大葉子（擋住飛過頭的青蛙）
    const leafA = lam({ color: w.vine }), leafB = lam({ color: w.pad });
    [[0.2, 2, 3.2, leafA], [0.8, 7.5, 3.4, leafB], [0.3, 13, 3, leafA], [0.9, 18, 2.6, leafB]].forEach(([dx, y, r, m], i) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m); b.position.set(g.wall + r + dx, y, -2.6 - (i % 2) * 0.8); b.rotation.set(i, i * 2, 0);
      b.castShadow = b.receiveShadow = true; group.add(b);
    });
    // 旗子
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 5), lam({ color: '#ffffff' })); pole.position.set(g.x - 1.5, g.y + 3, -1.6); group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 4, 1), new THREE.MeshLambertMaterial({ color: '#ff6fb5', side: THREE.DoubleSide })); flag.position.set(g.x - 0.4, g.y + 5.2, -1.6); group.add(flag); st.flag = flag;
    reset();
  }

  function reset() {
    if (!lv) return;
    st.flyGone = lv.flies.map(() => 0); st.ringGone = lv.rings.map(() => 0); st.attached = -1;
    st.hookWob.fill(0); st.hookWobV.fill(0); st.mushK.fill(0); st.mushKV.fill(0);
  }

  function update(s, t, dt, mouth) {
    if (!lv) return;
    const vineTop = 45;
    for (let i = 0; i < lv.hooks.length; i++) {
      movePos(lv.hooks[i], s.t, tmp);
      st.hookWobV[i] += (-st.hookWob[i] * 320 - st.hookWobV[i] * 10) * dt; st.hookWob[i] += st.hookWobV[i] * dt;
      const k = 1 + st.hookWob[i], sw = Math.sin(t * 1.3 + i) * 0.08;
      set(M.petal, i, tmp.x, tmp.y, -0.15, 0, 0, t * 0.4 + i, k * (i === st.target ? 1.15 : 1));
      set(M.bud, i, tmp.x, tmp.y, 0.22, 0, 0, sw, k);
      set(M.vine, i, tmp.x, tmp.y + 0.5, -0.3, 0, 0, sw * 0.1, 1, vineTop - tmp.y, 1);
    }
    M.petal.instanceMatrix.needsUpdate = M.bud.instanceMatrix.needsUpdate = M.vine.instanceMatrix.needsUpdate = true;
    lv.mush.forEach((m, i) => {
      st.mushKV[i] += (-st.mushK[i] * 260 - st.mushKV[i] * 9) * dt; st.mushK[i] += st.mushKV[i] * dt;
      const k = st.mushK[i];
      set(M.cap, i, m.x, m.y - 0.15, 0, 0, 0, Math.sin(t * 1.7 + i) * 0.04, 1 - k * 0.6, 1 + k, 1 - k * 0.6);
    });
    if (lv.mush.length) M.cap.instanceMatrix.needsUpdate = true;
    lv.spikes.forEach((sp, i) => set(M.spike, i, sp.x, sp.y + (sp.hang ? Math.sin(t * 1.6 + i) * 0.15 : 0), 0, t * 0.5, t * 0.7 + i, 0, 1));
    if (lv.spikes.length) M.spike.instanceMatrix.needsUpdate = true;
    lv.saws.forEach((sw, i) => { movePos(sw, s.t, tmp); set(M.saw, i, tmp.x, tmp.y, 0, 0, 0, -t * 9, sw.r / 1.25); });
    if (lv.saws.length) M.saw.instanceMatrix.needsUpdate = true;
    lv.fans.forEach((f, i) => set(M.blade, i, f.x, f.y0 + 0.45, 0, 0, t * 14, 0, f.w / 3.2));
    if (lv.fans.length) M.blade.instanceMatrix.needsUpdate = true;
    lv.rings.forEach((g, i) => {
      if (st.ringGone[i] > 0) st.ringGone[i] = Math.min(1, st.ringGone[i] + dt * 5);
      const k = st.ringGone[i] > 0 ? Math.max(0, 1 + st.ringGone[i] * 0.6) * (1 - st.ringGone[i]) : 1 + Math.sin(t * 4 + i) * 0.04;
      set(M.ring, i, g.x, g.y, 0, 0, 0.55 + Math.sin(t * 1.2 + i) * 0.2, 0, k);
    });
    if (lv.rings.length) M.ring.instanceMatrix.needsUpdate = true;
    lv.flies.forEach((f, i) => {
      let x, y, k = 1;
      flyPos(f, s.t, tmp); x = tmp.x; y = tmp.y;
      if (st.flyGone[i] > 0) {
        st.flyGone[i] = Math.min(1, st.flyGone[i] + dt * 8);
        const u = st.flyGone[i]; x += (mouth.x - x) * u; y += (mouth.y - y) * u; k = 1 - u;
      }
      set(M.fly, i, x, y, 0.3, 0, 0, Math.sin(t * 10 + i) * 0.3, k, k * 0.85, k);
      const flap = Math.abs(Math.sin(t * 60 + i)) * k;
      set(M.wing, i * 2, x - 0.18, y + 0.25, 0.3, 0, 0, 0.6, flap, k, 1);
      set(M.wing, i * 2 + 1, x + 0.18, y + 0.25, 0.3, 0, 0, -0.6, flap, k, 1);
    });
    if (lv.flies.length) { M.fly.instanceMatrix.needsUpdate = true; M.wing.instanceMatrix.needsUpdate = true; }
    // 目標高亮
    const tg = st.target;
    if (tg >= 0 && st.attached < 0) {
      movePos(lv.hooks[tg], s.t, tmp);
      hi.visible = hi2.visible = true;
      hi.position.set(tmp.x, tmp.y, 0.4); hi.scale.setScalar(1 + Math.sin(t * 12) * 0.08);
      const u = (t * 1.6) % 1; hi2.position.copy(hi.position); hi2.scale.setScalar(1 + u * 0.9); hi2Mat.opacity = 0.7 * (1 - u);
    } else hi.visible = hi2.visible = false;
    // 終點旗子飄
    if (st.flag) st.flag.rotation.y = Math.sin(t * 3) * 0.25;
    if (st.pad) { st.goalBounce *= Math.exp(-dt * 6); st.pad.scale.y = 1 - st.goalBounce * Math.sin(t * 30) * 0.5; }
  }

  return {
    build, reset, update, st,
    wobbleHook(i) { st.hookWobV[i] += 9; },
    squashMush(i) { st.mushKV[i] -= 0; st.mushK[i] = -0.45; },
    eatFly(i) { st.flyGone[i] = 0.001; },
    takeRing(i) { st.ringGone[i] = 0.001; },
    bouncePad() { st.goalBounce = 1; },
  };
}

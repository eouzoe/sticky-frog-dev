// 關卡物件的 3D 外觀（GLB 軟膠素材，同種物件全部 InstancedMesh）：鉤點花、蘑菇、尖刺、鋸片、風扇、圈圈、蒼蠅、終點荷葉＋葉牆。
import * as THREE from 'three';
import { movePos, flyPos, burstOn, burstWarn, duneH, duneStart, duneEnd } from './sim.js';
import { TUNE as T } from './config.js';
import { dressProp, softMaterial, WORLD_PAL, initEnv } from './artkit.js';
import { ART, splitProp, PartSet } from './art.js';

const tmp = { x: 0, y: 0 };
const dummy = new THREE.Object3D();
const M4 = new THREE.Matrix4(), N4 = new THREE.Matrix4(), INV = new THREE.Matrix4();
const FAN_TILT = 0.5; // 風扇往鏡頭傾一點：側視角也看得到轉動的扇葉（美術線提醒）

const GEO = {
  vine: (() => { const g = new THREE.CylinderGeometry(0.09, 0.09, 1, 10); g.translate(0, 0.5, 0); return g; })(),
  pole: (() => { const g = new THREE.CylinderGeometry(0.13, 0.13, 1, 12); g.translate(0, 0.5, 0); return g; })(),
  track: new THREE.BoxGeometry(1, 1, 0.05),
  column: new THREE.BoxGeometry(1, 1, 0.1),
  ripple: new THREE.TorusGeometry(1.35, 0.09, 8, 40),
  padRim: (() => { const g = new THREE.TorusGeometry(1, 0.06, 8, 48); g.rotateX(Math.PI / 2); return g; })(), // 荷葉外框（平放在水面上，縮放成荷葉的橢圓）
  stump: new THREE.CylinderGeometry(1.1, 1.3, 4.5, 24),
  leaf: (() => { const g = new THREE.SphereGeometry(0.5, 12, 8); g.scale(1.5, 0.42, 0.8); g.translate(0.55, 0, 0); return g; })(), // 藤蔓上的葉子（軟膠橢圓，根在原點）
  flagPole: new THREE.CylinderGeometry(0.1, 0.1, 6, 12),
  flag: new THREE.PlaneGeometry(2.2, 1.4, 8, 2),
};
const flagBase = Float32Array.from(GEO.flag.attributes.position.array);

// 沙丘表面：所有片區併成一個網格（一個 draw call）。高度場 y(x, z) = h(x)·g(z) − (1 − g(z))·1.2：
// g(z) 在青蛙走的那條帶（z −2.2～1.0）是 1，往前（到 z 3.4）、往後（到 z −8）圓滑降到 0 沒入流沙；x 方向左緣有緩坡、lip 後面有背坡（sim 的 duneH），所以整個網格沒有任何垂直切面，物理（z=0）跟畫面一致。
const SAND_Z = [-8, -6.4, -5, -3.8, -2.8, -2.2, -1, 0, 1, 1.5, 2.0, 2.5, 3.0, 3.4];
const sandG = (z) => (z > 1 ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (z - 1) / 2.4))) : z < -2.2 ? 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (-2.2 - z) / 5.8))) : 1);
function sandGeometry(dunes, pal) {
  const C = pal.map((c) => new THREE.Color(c)), col = new THREE.Color();
  const pos = [], rgb = [], idx = [];
  const fields = new Map();
  for (const d of dunes) { if (!fields.has(d.f)) fields.set(d.f, []); fields.get(d.f).push(d); }
  for (const fl of fields.values()) {
    const a = duneStart(fl[0]), b = duneEnd(fl[fl.length - 1]), N = Math.ceil((b - a) / 0.3), base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const x = a + (b - a) * i / N;
      let h = 0, hm = 1; for (const d of fl) if (x >= duneStart(d) && x <= duneEnd(d)) { h = duneH(d, x); hm = d.H + T.DUNE_BASE; break; }
      for (const z of SAND_Z) {
        const g = sandG(z), k = Math.min(1, h / hm);
        col.copy(C[0]).lerp(C[1], Math.pow(k, 0.8)).lerp(C[2], Math.max(0, 0.3 - Math.abs(g - 0.6)) * 1.2 * k).lerp(C[3], (1 - g) * 0.85);
        pos.push(x, h * g - (1 - g) * 1.2, z); rgb.push(col.r, col.g, col.b);
      }
    }
    const W = SAND_Z.length;
    for (let i = 0; i < N; i++) for (let r = 0; r < W - 1; r++) { const p0 = base + i * W + r, p1 = p0 + W, p2 = p0 + 1, p3 = p1 + 1; idx.push(p0, p2, p1, p1, p2, p3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function sandMaterial(high) {
  const m = high ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, envMap: initEnv(null), envMapIntensity: 0.4 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.34, 0.24, 0.12) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0) + diffuseColor.rgb * 0.1;'); };
  m.customProgramCacheKey = () => `sand|${high}`;
  return m;
}

// 彈性出場（0→1，帶過衝）：換關時物件由左到右依序「啵」地長出來
const elastic = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(2, -9 * u) * Math.cos(u * 10.5));

export function createLevelView(scene) {
  const group = new THREE.Group(); scene.add(group);
  let sets = [], lv = null, wi = 0;
  const st = { padOn: [], padBounce: [], boostGone: [], hookWob: [], hookWobV: [], mushK: [], mushKV: [], flyGone: [], ringGone: [], ringJ: [], target: -1, attached: -1, goalBounce: 0, intro: 9, introX: 0 };
  const S = {};
  const mats = {
    track: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.16, depthWrite: false }),
    column: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false }),
    hi: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
    padRim: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }),
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

  let fan = null, mush = null, fly = null, geyser = false, padObjs = [], padFlagOff = null, padFlagOn = null;
  function build(level, w) {
    lv = level; wi = Math.max(0, Math.min(5, level.world ?? 0));
    const P = WORLD_PAL[wi], q = ART.q;
    for (const s of sets) s.dispose(group);
    // oxlint-disable-next-line unicorn/no-useless-spread -- the copy is required: remove() mutates children during the loop
    for (const o of [...group.children]) group.remove(o);
    sets = [];
    const H = level.hooks.length;
    add('hook', splitProp('prop-hook', wi).main, H);
    simple('vine', GEO.vine, softMaterial(P.vine, q, { rough: 0.5 }), H);
    if (wi === 0) { // 叢林：藤蔓分三節晃（只動球上方；球與錨點不動），再掛幾片葉子
      simple('vine2', GEO.vine, softMaterial(P.vine, q, { rough: 0.5 }), H);
      simple('vine3', GEO.vine, softMaterial(P.vine, q, { rough: 0.5 }), H);
      simple('leaf', GEO.leaf, softMaterial(P.leaf, q, { rough: 0.4 }), H * 3);
    }
    mush = splitProp('prop-mush', wi, ['stem']);
    add('cap', mush.main, level.mush.length); add('stem', mush.sub.stem.parts, level.mush.length);
    add('spike', splitProp('prop-spike', wi).main, level.spikes.length);
    simple('pole', GEO.pole, softMaterial(P.hazard, q, { rough: 0.3 }), level.spikes.length, true);
    add('saw', splitProp('prop-saw', wi).main, level.saws.length);
    simple('track', GEO.track, mats.track, level.saws.length);
    fan = wi === 3 ? splitProp('prop-geyser', wi) : splitProp('prop-fan', wi, ['blades']);
    geyser = wi === 3;
    // 扇葉原本是白色、底座頂面也是白：傾斜後讀成一個白盤子 → 扇葉換成世界花瓣色，轉起來才看得出是風扇
    if (!geyser) for (const p of fan.sub.blades.parts) { const u = p.material.userData.uniforms; if (u) { u.uBase.value.set(P.petal); u.uSec.value.set(P.bud); } }
    add('fanBase', fan.main, level.fans.length);
    if (!geyser) add('blade', fan.sub.blades.parts, level.fans.length);
    simple('column', GEO.column, mats.column, level.fans.length);
    add('ring', splitProp('prop-ring', wi).main, level.rings.length);
    add('boost', splitProp('prop-boost', wi).main, level.boosts.length, { shadow: false });
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
    // 沙丘（夕陽沙丘世界）：程序網格，一個 draw call
    const live = level.dunes.filter((d) => !d.off);
    if (live.length) {
      const sm = new THREE.Mesh(sandGeometry(live, w.sand ?? ['#f0a14a', '#ffd070', '#fff0b8', '#c9722f']), sandMaterial(q === 'high'));
      sm.receiveShadow = true; sm.frustumCulled = false; sm.renderOrder = 1; group.add(sm);
    }
    // 起點木樁、終點荷葉、葉牆、旗子（各一個，不用 instancing）
    const stump = new THREE.Mesh(GEO.stump, softMaterial(P.wood, q, { rough: 0.5 }));
    stump.position.set(level.start.x, level.start.y - 2.25, 0); stump.castShadow = stump.receiveShadow = true; group.add(stump);
    const g = level.goal;
    const goal = dressProp(ART.models, 'prop-goal', wi, q); goal.position.set(g.x, g.y, 0); goal.scale.x = g.w / 12; group.add(goal); st.pad = goal;
    // 葉牆：遠看像一根綠柱（美術線提醒）→ 加寬、前後兩片錯開、往鏡頭轉一點，讀起來是一整片葉簾
    // 一根會讀成綠柱 → 每片橫向撐寬成樹籬，再往右後方排出高低錯落的一叢；前面那片貼著碰撞面
    for (const [dx, dz, sx, sy, ry] of [[1.0, -0.8, 2.1, 1.0, -0.2], [3.6, -2.4, 1.9, 0.62, 0.6], [6.0, -4.2, 2.0, 0.78, 1.5], [2.0, -6.5, 2.2, 0.5, -0.9]]) {
      const wall = dressProp(ART.models, 'prop-goalWall', wi, q); wall.position.set(g.wall + dx, 0, dz); wall.scale.set(sx, sy, sx * 0.8); wall.rotation.y = ry; group.add(wall);
    }
    // 中途荷葉（E1）：prop-pad 拉寬壓扁、缺口朝左（青蛙從左邊來）；旁邊插一面小旗，落地後旗子換成世界點綴色
    padFlagOff = softMaterial('#ffffff', q, { rough: 0.3 }); padFlagOn = softMaterial(P.accent ?? '#ff6fb5', q, { rough: 0.35 }); padFlagOn.side = THREE.DoubleSide; padFlagOff.side = THREE.DoubleSide;
    padObjs = level.pads.map((p) => {
      const o = dressProp(ART.models, 'prop-pad', wi, q); o.position.set(p.x, p.y - 0.07 * 1.6, 0); o.scale.set(p.w / 2, 1.6, 2.1); o.rotation.y = Math.PI; group.add(o);
      const fp = new THREE.Mesh(GEO.flagPole, softMaterial('#ffffff', q, { rough: 0.3 })); fp.scale.set(0.9, 0.75, 0.9); fp.position.set(p.x + 2.3, p.y + 2.25, -0.9); fp.castShadow = true; group.add(fp);
      const fl = new THREE.Mesh(GEO.flag, padFlagOff); fl.scale.setScalar(0.95); fl.position.set(p.x + 3.3, p.y + 3.7, -0.9); fl.castShadow = true; group.add(fl);
      const rim = new THREE.Mesh(GEO.padRim, mats.padRim); rim.position.set(p.x, p.y - 0.02, 0); rim.scale.set(p.w / 2 + 0.25, 1, 2.35); rim.renderOrder = 1; group.add(rim);
      return { o, fl };
    });
    const pole = new THREE.Mesh(GEO.flagPole, softMaterial('#ffffff', q, { rough: 0.3 })); pole.position.set(g.x - 1.5, g.y + 3, -1.6); pole.castShadow = true; group.add(pole);
    const flagMat = softMaterial(P.accent ?? '#ff6fb5', q, { rough: 0.35 }); flagMat.side = THREE.DoubleSide; // 只有旗子用這個色
    const flag = new THREE.Mesh(GEO.flag, flagMat); flag.position.set(g.x - 0.4, g.y + 5.2, -1.6); flag.castShadow = true; group.add(flag); st.flag = flag;
    reset();
  }

  function reset() {
    if (!lv) return;
    st.flyGone = lv.flies.map(() => 0); st.ringGone = lv.rings.map(() => 0); st.boostGone = lv.boosts.map(() => 0); st.padOn = lv.pads.map(() => 0); st.padBounce = lv.pads.map(() => 0); st.ringJ = lv.rings.map(() => 0); st.attached = -1;
    st.hookWob.fill(0); st.hookWobV.fill(0); st.mushK.fill(0); st.mushKV.fill(0);
  }

  // 叢林藤蔓：三節，每節在上一節的角度上再晃一點；第一節的根固定在 (bx, by)＝球上緣，所以球與錨點完全不動
  function vineSway(i, bx, by, a0, t, len) {
    const l0 = 4, l1 = 6, l2 = Math.max(1, len - l0 - l1);
    const a1 = a0 + Math.sin(t * 0.9 + i * 1.7) * 0.03, a2 = a1 + Math.sin(t * 1.3 + i * 2.1 + 1) * 0.05, a3 = a2 + Math.sin(t * 1.7 + i * 0.9 + 2) * 0.06;
    const x1 = bx - Math.sin(a1) * l0, y1 = by + Math.cos(a1) * l0, x2 = x1 - Math.sin(a2) * l1, y2 = y1 + Math.cos(a2) * l1;
    S.vine.set(i, mat(bx, by, -0.3, 0, 0, a1, 1, l0, 1)); S.vine2.set(i, mat(x1, y1, -0.3, 0, 0, a2, 1, l1, 1)); S.vine3.set(i, mat(x2, y2, -0.3, 0, 0, a3, 1, l2, 1));
    // 三片葉子：貼在藤蔓上，跟著晃（葉子自己再多搖一點）
    const lf = [[bx - Math.sin(a1) * 2.1, by + Math.cos(a1) * 2.1, a1 + 0.8], [x1 - Math.sin(a2) * 2.6, y1 + Math.cos(a2) * 2.6, a2 + 2.3], [x2 - Math.sin(a3) * 3, y2 + Math.cos(a3) * 3, a3 + 0.9]];
    for (let k = 0; k < 3; k++) S.leaf.set(i * 3 + k, mat(lf[k][0], lf[k][1], -0.2, 0, 0, lf[k][2] + Math.sin(t * 2.2 + i + k * 2) * 0.12, 1));
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
      if (wi === 0) vineSway(i, tmp.x, tmp.y + 0.55, sw * 0.08, t, vineTop - tmp.y);
      else S.vine.set(i, mat(tmp.x, tmp.y + 0.55, -0.3, 0, 0, sw * 0.08, 1, vineTop - tmp.y, 1));
    }
    S.hook.commit(); S.vine.commit();
    if (wi === 0) { S.vine2.commit(); S.vine3.commit(); S.leaf.commit(); }
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
      if (geyser) { // 噴泉口：預兆時抖一抖、噴發時被撐高（果凍擠壓）
        const w = f.burst ? burstWarn(f.burst, s.t) : false, on = f.burst ? burstOn(f.burst, s.t) : false;
        const sq = on ? 0.22 : w ? Math.sin(t * 38) * 0.06 : 0;
        N4.copy(mat(f.x, f.y0, 0, FAN_TILT, 0, 0, sc * (1 - sq * 0.4), sc * (1 + sq), sc * (1 - sq * 0.4))); S.fanBase.set(i, N4);
        return;
      }
      N4.copy(mat(f.x, f.y0, 0, FAN_TILT, 0, 0, sc)); S.fanBase.set(i, N4);
      M4.copy(N4).multiply(fan.sub.blades.node).multiply(mat(0, 0, 0, 0, t * 14, 0, 1)); S.blade.set(i, M4);
    });
    S.fanBase.commit(); if (!geyser) S.blade.commit();
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
    lv.boosts.forEach((b, i) => {
      let k = b.off ? 0 : 1 + Math.sin(t * 5 + i) * 0.06;
      if (st.boostGone[i] > 0) { st.boostGone[i] = Math.min(1, st.boostGone[i] + dt * 2.6); const u = st.boostGone[i]; k *= (1 + u * 0.6) * (1 - u * u); }
      k *= popK(b.x);
      // 箭頭沿著加速方向；圈環在垂直於鏡頭的面上，繞 z 轉到 (dx, dy)
      S.boost.set(i, mat(b.x, b.y, 0, 0, Math.sin(t * 1.5 + i) * 0.12, Math.atan2(b.dy, b.dx), k));
    });
    S.boost.commit();
    padObjs.forEach(({ o, fl }, i) => {
      st.padBounce[i] *= Math.exp(-dt * 4); const bn = st.padBounce[i] * Math.sin(t * 26);
      o.scale.y = 1.6 * (1 - bn * 0.5); fl.material = st.padOn[i] ? padFlagOn : padFlagOff;
    });
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
    build, reset, update, st, isGeyser: () => geyser,
    // 測試用：鉤點球「實際畫出來」的世界座標＝hook 的 InstancedMesh 實例矩陣 × 模型原點（扣掉模型自帶矩陣），跟 sim 錨點比對
    ballPos(i) {
      const m = sets.length ? S.hook.meshes[0] : null; if (!m) return null;
      m.getMatrixAt(i, M4); M4.multiply(INV.copy(m.userData.pm).invert());
      return [M4.elements[12], M4.elements[13]];
    },
    wobbleHook(i) { st.hookWobV[i] += 11; },
    squashMush(i) { st.mushK[i] = -0.5; st.mushKV[i] = 0; },
    eatFly(i) { st.flyGone[i] = 0.001; },
    takeRing(i) { st.ringGone[i] = 0.001; },
    bouncePad() { st.goalBounce = 1; },
    landPad(i) { st.padOn[i] = 1; st.padBounce[i] = 1; },
    takeBoost(i) { st.boostGone[i] = 0.001; },
    intro(x) { st.intro = 0; st.introX = x; },
  };
}

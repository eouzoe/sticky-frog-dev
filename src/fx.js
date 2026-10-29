// 特效（軟膠公仔語彙）：亮面糖果碎片、彩紙、圓潤閃星、泡泡、3D 金幣（全部 InstancedMesh 物件池），
// 果凍衝擊環、速度拖尾緞帶、速度線、分級畫面震動（小事件取 max、大事件累加）。
import * as THREE from 'three';
import { TUNE as T } from './config.js';
import { initEnv } from './artkit.js';
import { ART, splitProp } from './art.js';

const MAX = 900;
const dummy = new THREE.Object3D();
const col = new THREE.Color();
const M4 = new THREE.Matrix4();
// shape：0 糖果碎片（圓潤軟糖顆粒）、1 彩紙、2 糖果火花（沿速度拉長的亮面藥丸）、3 泡泡、4 閃星、5 金幣
export const SH = { CANDY: 0, CONFETTI: 1, SPARK: 2, BUBBLE: 3, STAR: 4, COIN: 5, STEAM: 6 };

// 圓潤五角星（擠出＋倒角）
function starGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.45 : 1;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 3, curveSegments: 2 });
  g.translate(0, 0, -0.11); g.computeVertexNormals(); return g;
}
function confettiGeo() { // 圓角小紙片
  const s = new THREE.Shape(), w = 0.5, h = 0.32, r = 0.12;
  s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r); s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
  return new THREE.ShapeGeometry(s, 3);
}
// 亮面糖果材質：Standard＋環境反光＋邊緣光＋一點自發光（粒子要在任何背景都跳出來）
function candyMat(renderer, high, o = {}) {
  const m = high
    ? new THREE.MeshStandardMaterial({ roughness: o.rough ?? 0.22, metalness: 0, envMap: initEnv(renderer), envMapIntensity: 0.9, ...o.extra })
    : new THREE.MeshLambertMaterial({ ...o.extra });
  const rim = o.rim ?? 0.55, glow = o.glow ?? 0.28;
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(${rim.toFixed(2)}) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5) + diffuseColor.rgb * ${glow.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => `candy${rim}|${glow}|${high}`;
  return m;
}

export function createFx(scene, renderer) {
  const geos = [new THREE.SphereGeometry(0.5, 14, 10), confettiGeo(), null, new THREE.SphereGeometry(0.5, 16, 12), starGeo()];
  const makeMats = (high) => [
    candyMat(renderer, high),
    candyMat(renderer, high, { rough: 0.45, rim: 0.15, glow: 0.18, extra: { side: THREE.DoubleSide } }),
    null,
    candyMat(renderer, high, { rough: 0.05, rim: 1.1, glow: 0.05, extra: { transparent: true, opacity: 0.32, depthWrite: false } }),
    candyMat(renderer, high, { rough: 0.18, rim: 0.3, glow: 0.2 }),
  ];
  let mats = makeMats(true);
  const meshes = [0, 1, 3, 4].map((k) => {
    const m = new THREE.InstancedMesh(geos[k], mats[k], MAX); m.frustumCulled = false; m.count = 0;
    m.setColorAt(0, col.set('#ffffff')); scene.add(m); return m;
  });
  const meshOf = [meshes[0], meshes[1], meshes[0], meshes[2], meshes[3], null, meshes[0]]; // SPARK 共用糖果顆粒的網格
  meshes[2].renderOrder = 3;
  let coin = null; // 金幣：prop-coin（模型載入後才建）
  function coinMesh() {
    if (coin || !ART.models['prop-coin']) return coin;
    const p = splitProp('prop-coin', 0).main[0];
    coin = new THREE.InstancedMesh(p.geometry, p.material, 60); coin.frustumCulled = false; coin.count = 0; coin.userData.pm = p.matrix; scene.add(coin);
    return coin;
  }

  const P = { x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX), vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX), life: new Float32Array(MAX), max: new Float32Array(MAX), size: new Float32Array(MAX), rot: new Float32Array(MAX), rv: new Float32Array(MAX), g: new Float32Array(MAX), drag: new Float32Array(MAX), shape: new Uint8Array(MAX), r: new Float32Array(MAX), gg: new Float32Array(MAX), b: new Float32Array(MAX) };
  let alive = 0, cap = MAX; // cap：粒子池上限（畫質分級會調，見 src/quality.js）

  function spawn(x, y, z, vx, vy, vz, life, size, g, drag, shape, color) {
    if (alive >= cap) return;
    const i = alive++;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.max[i] = life;
    P.size[i] = size; P.rot[i] = Math.random() * 6.28; P.rv[i] = (Math.random() - 0.5) * 14; P.g[i] = g; P.drag[i] = drag; P.shape[i] = shape;
    col.set(color); P.r[i] = col.r; P.gg[i] = col.g; P.b[i] = col.b;
  }
  // 粒子預算：池子用掉七成後，新的爆發數量減半（大時刻疊在一起也不會吃光池子、掉幀）
  function burst(x, y, n, o = {}) {
    if (alive > cap * 0.7) n = Math.ceil(n / 2);
    const colors = o.colors ?? ['#ffffff'], sp = o.speed ?? 8, size = o.size ?? 0.25, life = o.life ?? 0.7;
    const dir = o.dir ?? null, spread = o.spread ?? Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread;
      const v = sp * (0.4 + Math.random() * 0.8);
      spawn(x + (Math.random() - 0.5) * (o.jitter ?? 0.3), y + (Math.random() - 0.5) * (o.jitter ?? 0.3), (o.z ?? 0.6) + (Math.random() - 0.5) * 0.8,
        Math.cos(a) * v + (o.vx ?? 0), Math.sin(a) * v + (o.vy ?? 0), (Math.random() - 0.5) * sp * 0.5,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), o.grav ?? 18, o.drag ?? 1.5, o.shape ?? 0, colors[k % colors.length]);
    }
  }

  // 果凍衝擊環（圓管，擴張時先衝過頭再回彈一點）
  const rings = [];
  const ringGeo = new THREE.TorusGeometry(1, 0.07, 8, 56);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    m.visible = false; scene.add(m); rings.push({ m, t: 1, dur: 0.4, size: 3, delay: 0 });
  }
  let ringI = 0;
  function shock(x, y, size = 3, color = '#ffffff', dur = 0.4, flat = false, delay = 0) {
    const r = rings[ringI++ % rings.length];
    r.m.position.set(x, y, 0.5); r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0); r.m.material.color.set(color);
    r.t = 0; r.dur = dur; r.size = size; r.delay = delay; r.m.visible = delay <= 0; r.m.scale.setScalar(0.01);
  }

  // 拖尾緞帶（頂點 RGBA）
  const TN = 36;
  const tPos = new Float32Array(TN * 2 * 3), tCol = new Float32Array(TN * 2 * 4);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 4));
  const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  tGeo.setIndex(idx);
  const trail = new THREE.Mesh(tGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  trail.frustumCulled = false; scene.add(trail);
  const hist = Array.from({ length: TN }, () => ({ x: 0, y: 0 }));
  let trailColors = [new THREE.Color('#ffffff')], trailAlpha = 0, trailId = 'none';
  function setTrail(t) { trailId = t.id; trailColors = t.colors.map((c) => new THREE.Color(c)); }
  function resetTrail(x, y) { for (const h of hist) { h.x = x; h.y = y; } }

  // 速度線（圓頭膠條）
  const LN = 36;
  const lines = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.035, 1, 2, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), LN);
  lines.frustumCulled = false; scene.add(lines);
  const L = Array.from({ length: LN }, () => ({ x: 0, y: 0, a: 0, len: 0, t: 1 }));
  let lineI = 0, lineAcc = 0;

  // 畫面震動（創傷值，平方曲線，正弦取樣不抖成雜訊）。
  // 分級：小事件（黏住、放開、彈跳、穿圈…高頻）取 max 不累加；大事件（大翻滾、落地、死亡）才累加。
  // 強度 TUNE.SHAKE_SCALE、衰減 TUNE.SHAKE_DECAY（每秒掉多少 trauma）。
  const shake = { trauma: 0, t: 0, x: 0, y: 0, roll: 0 };
  const addTrauma = (a, big = false) => { shake.trauma = big ? Math.min(1, shake.trauma + a) : Math.max(shake.trauma, Math.min(1, a)); };

  function setQuality(high, max = MAX) {
    cap = Math.min(MAX, max);
    mats = makeMats(high);
    meshes.forEach((m, i) => { m.material = mats[[0, 1, 3, 4][i]]; });
  }

  function update(dt, realDt, frog, speed, active) {
    // 粒子：先壓縮死掉的，再把每顆寫進自己形狀的網格
    for (let i = 0; i < alive; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) { const j = --alive; for (const k in P) P[k][i] = P[k][j]; i--; }
    }
    for (const m of meshes) m.count = 0;
    const cm = coinMesh(); if (cm) cm.count = 0;
    for (let i = 0; i < alive; i++) {
      const dr = 1 - P.drag[i] * dt, sh = P.shape[i];
      P.vx[i] *= dr; P.vy[i] = P.vy[i] * dr - P.g[i] * dt; P.vz[i] *= dr;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      P.rot[i] += P.rv[i] * dt;
      const u = P.life[i] / P.max[i], s = P.size[i];
      const pop = Math.min(1, (1 - u) * 8); // 出生時彈出來（0 → 1 帶一點過衝）
      const grow = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
      dummy.position.set(P.x[i], P.y[i], P.z[i]);
      if (sh === SH.SPARK) {
        const sp = Math.hypot(P.vx[i], P.vy[i]);
        dummy.rotation.set(0, 0, Math.atan2(P.vy[i], P.vx[i])); dummy.scale.set(s * (1 + sp * 0.1) * u, s * 0.42 * u, s * 0.42 * u);
      } else if (sh === SH.CONFETTI) {
        dummy.rotation.set(P.rot[i], P.rot[i] * 0.7, P.rot[i] * 0.3); dummy.scale.setScalar(s * 1.3 * grow * (u < 0.3 ? u / 0.3 : 1));
      } else if (sh === SH.BUBBLE) {
        const wob = 1 + Math.sin(P.rot[i] * 3) * 0.08;
        dummy.rotation.set(0, 0, 0); dummy.scale.set(s * (1.5 - u * 0.5) * wob * grow, s * (1.5 - u * 0.5) / wob * grow, s * (1.5 - u * 0.5) * grow);
        if (u < 0.12) dummy.scale.multiplyScalar(1 + (0.12 - u) * 4); // 破掉前鼓一下
      } else if (sh === SH.STEAM) {
        // 噴發蒸汽：不透明的軟膠團，出生鼓起來、後半慢慢縮小
        const wob = 1 + Math.sin(P.rot[i] * 2) * 0.07;
        dummy.rotation.set(0, 0, 0); dummy.scale.set(s * grow * (0.55 + 0.9 * Math.sqrt(u)) * wob, s * grow * (0.55 + 0.9 * Math.sqrt(u)) / wob, s * grow * (0.55 + 0.9 * Math.sqrt(u)));
      } else if (sh === SH.STAR) {
        const tw = 1 + Math.sin(P.rot[i] * 2.2) * 0.18; // 閃一閃
        dummy.rotation.set(0, P.rot[i] * 0.4, P.rot[i] * 0.25); dummy.scale.setScalar(s * grow * tw * Math.min(1, u * 2.5));
      } else if (sh === SH.COIN) {
        dummy.rotation.set(0, P.rot[i] * 1.6, 0); dummy.scale.setScalar(s * grow * Math.min(1, u * 3));
      } else {
        // 軟糖顆粒：落地前一直果凍晃（沿 y 擠壓、xz 撐開）
        const j = 1 + Math.sin(P.rot[i] * 2.5) * 0.15;
        dummy.rotation.set(P.rot[i], P.rot[i] * 1.3, 0); dummy.scale.set(s * grow * u * 1.15 * j, s * grow * u * 0.9 / j, s * grow * u);
      }
      dummy.updateMatrix();
      if (sh === SH.COIN) { if (cm && cm.count < 60) { M4.multiplyMatrices(dummy.matrix, cm.userData.pm); cm.setMatrixAt(cm.count++, M4); } continue; }
      const m = meshOf[sh], k = m.count++;
      m.setMatrixAt(k, dummy.matrix); m.setColorAt(k, col.setRGB(P.r[i], P.gg[i], P.b[i]));
    }
    for (const m of meshes) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    if (cm) { cm.visible = cm.count > 0; cm.instanceMatrix.needsUpdate = true; }

    for (const r of rings) {
      if (r.t >= 1) continue;
      if (r.delay > 0) { r.delay -= realDt; if (r.delay > 0) continue; r.m.visible = true; }
      r.t += realDt / r.dur;
      if (r.t >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - r.t, 3) + Math.sin(r.t * Math.PI) * 0.12; // 衝過頭一點
      r.m.scale.set(0.3 + e * r.size, 0.3 + e * r.size, 1 + (1 - r.t) * 2); r.m.material.opacity = 0.9 * (1 - r.t);
    }

    // 拖尾
    if (frog) {
      for (let i = TN - 1; i > 0; i--) { hist[i].x = hist[i - 1].x; hist[i].y = hist[i - 1].y; }
      hist[0].x = frog.x; hist[0].y = frog.y;
      const target = active && speed > 7 && frog.mode !== 'perch' ? Math.min(1, (speed - 7) / 10) : 0;
      trailAlpha += (target - trailAlpha) * Math.min(1, dt * 6 + 0.02);
      const tt = performance.now() * 0.001;
      for (let i = 0; i < TN; i++) {
        const a = hist[Math.max(0, i - 1)], b = hist[Math.min(TN - 1, i + 1)];
        let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const u = i / (TN - 1), w = 0.48 * Math.sqrt(1 - u) + 0.02;
        const h = hist[i], o = i * 6;
        tPos[o] = h.x - dy * w; tPos[o + 1] = h.y + dx * w; tPos[o + 2] = -0.05;
        tPos[o + 3] = h.x + dy * w; tPos[o + 4] = h.y - dx * w; tPos[o + 5] = -0.05;
        const c = trailColors[Math.floor(trailId === 'rainbow' ? u * trailColors.length * 0.999 : (u * 2 + tt * 3) % trailColors.length)];
        const al = trailAlpha * (1 - u) * (trailId === 'none' ? 0.45 : 0.9);
        for (const q of [0, 1]) { const ci = (i * 2 + q) * 4; tCol[ci] = c.r; tCol[ci + 1] = c.g; tCol[ci + 2] = c.b; tCol[ci + 3] = al; }
      }
      tGeo.attributes.position.needsUpdate = true; tGeo.attributes.color.needsUpdate = true;
      // 拖尾附帶粒子（火＝糖果火花往上飄、泡泡＝泡泡、其他＝小閃星）
      if (trailAlpha > 0.3 && trailId !== 'none' && Math.random() < 0.5) {
        const c = '#' + trailColors[Math.floor(Math.random() * trailColors.length)].getHexString();
        if (trailId === 'fire') spawn(frog.x, frog.y, 0, (Math.random() - 0.5) * 2, 2, 0, 0.4, 0.3, -4, 2, SH.CANDY, c);
        else if (trailId === 'bubble') spawn(frog.x, frog.y, 0.2, (Math.random() - 0.5) * 2, 1, 0, 0.7, 0.26, -3, 1, SH.BUBBLE, c);
        else spawn(frog.x, frog.y, 0.2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0, 0.5, 0.16, 0, 1, SH.STAR, c);
      }
      // 速度線
      lineAcc += dt * (active && speed > 17 ? (speed - 17) * 2.2 : 0);
      while (lineAcc > 1) {
        lineAcc -= 1;
        const l = L[lineI++ % LN], a = Math.atan2(frog.vy, frog.vx), off = (Math.random() - 0.5) * 7;
        l.x = frog.x + Math.cos(a) * (2 + Math.random() * 5) - Math.sin(a) * off; l.y = frog.y + Math.sin(a) * (2 + Math.random() * 5) + Math.cos(a) * off;
        l.a = a; l.len = speed * 0.12; l.t = 0;
      }
    }
    for (let i = 0; i < LN; i++) {
      const l = L[i];
      l.t += realDt * 4;
      dummy.position.set(l.x, l.y, 1.2); dummy.rotation.set(0, 0, l.a);
      const k = l.t < 1 ? 1 - l.t : 0; dummy.scale.set(l.len * k, k, k);
      dummy.updateMatrix(); lines.setMatrixAt(i, dummy.matrix);
    }
    lines.instanceMatrix.needsUpdate = true;

    shake.trauma = Math.max(0, shake.trauma - realDt * T.SHAKE_DECAY);
    shake.t += realDt * 32;
    const k = shake.trauma * shake.trauma * T.SHAKE_SCALE;
    shake.x = 0.9 * k * Math.sin(shake.t * 1.7); shake.y = 0.7 * k * Math.sin(shake.t * 2.3 + 1); shake.roll = 0.035 * k * Math.sin(shake.t * 1.1 + 2);
  }

  function clear() { alive = 0; for (const m of meshes) m.count = 0; for (const l of L) l.t = 1; }
  const count = () => alive;

  return { burst, shock, update, addTrauma, shake, setTrail, resetTrail, clear, spawn, setQuality, count };
}

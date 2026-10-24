// 特效：粒子池（InstancedMesh）、衝擊波環、速度拖尾緞帶、速度線、創傷值畫面震動。
import * as THREE from 'three';

const MAX = 700;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

export function createFx(scene) {
  // 粒子
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
  pMesh.frustumCulled = false; pMesh.count = 0; scene.add(pMesh);
  pMesh.setColorAt(0, col.set('#ffffff'));
  const P = { x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX), vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX), life: new Float32Array(MAX), max: new Float32Array(MAX), size: new Float32Array(MAX), rot: new Float32Array(MAX), rv: new Float32Array(MAX), g: new Float32Array(MAX), drag: new Float32Array(MAX), shape: new Uint8Array(MAX) };
  let alive = 0;

  function spawn(x, y, z, vx, vy, vz, life, size, g, drag, shape, color) {
    if (alive >= MAX) return;
    const i = alive++;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.max[i] = life;
    P.size[i] = size; P.rot[i] = Math.random() * 6.28; P.rv[i] = (Math.random() - 0.5) * 14; P.g[i] = g; P.drag[i] = drag; P.shape[i] = shape;
    pMesh.setColorAt(i, col.set(color));
  }
  // shape: 0 方塊碎片、1 彩帶、2 火花（沿速度拉長）、3 泡泡/煙（慢慢變大）
  function burst(x, y, n, o = {}) {
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

  // 衝擊波環
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); rings.push({ m, t: 1, dur: 0.4, size: 3 });
  }
  let ringI = 0;
  function shock(x, y, size = 3, color = '#ffffff', dur = 0.4, flat = false) {
    const r = rings[ringI++ % rings.length];
    r.m.position.set(x, y, 0.5); r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0); r.m.material.color.set(color);
    r.t = 0; r.dur = dur; r.size = size; r.m.visible = true;
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

  // 速度線
  const LN = 36;
  const lines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }), LN);
  lines.frustumCulled = false; scene.add(lines);
  const L = Array.from({ length: LN }, () => ({ x: 0, y: 0, a: 0, len: 0, t: 1 }));
  let lineI = 0, lineAcc = 0;

  // 畫面震動（創傷值，平方曲線，正弦取樣不抖成雜訊）
  const shake = { trauma: 0, t: 0, x: 0, y: 0, roll: 0 };
  const addTrauma = (a) => { shake.trauma = Math.min(1, shake.trauma + a); };

  function update(dt, realDt, frog, speed, active) {
    // 粒子
    for (let i = 0; i < alive; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const j = --alive;
        for (const k in P) P[k][i] = P[k][j];
        pMesh.getColorAt(j, col); pMesh.setColorAt(i, col);
        i--; continue;
      }
      const dr = 1 - P.drag[i] * dt;
      P.vx[i] *= dr; P.vy[i] = P.vy[i] * dr - P.g[i] * dt; P.vz[i] *= dr;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      P.rot[i] += P.rv[i] * dt;
      const u = P.life[i] / P.max[i], s = P.size[i];
      dummy.position.set(P.x[i], P.y[i], P.z[i]);
      if (P.shape[i] === 2) {
        const sp = Math.hypot(P.vx[i], P.vy[i]);
        dummy.rotation.set(0, 0, Math.atan2(P.vy[i], P.vx[i])); dummy.scale.set(s * (1 + sp * 0.12) * u, s * 0.35 * u, s * 0.35 * u);
      } else if (P.shape[i] === 1) {
        dummy.rotation.set(P.rot[i], P.rot[i] * 0.7, P.rot[i] * 0.3); dummy.scale.set(s, s * 0.6, s * 0.08);
        if (u < 0.3) dummy.scale.multiplyScalar(u / 0.3);
      } else if (P.shape[i] === 3) {
        dummy.rotation.set(P.rot[i], P.rot[i], 0); dummy.scale.setScalar(s * (1.6 - u * 0.6) * Math.min(1, u * 3));
      } else {
        dummy.rotation.set(P.rot[i], P.rot[i] * 1.3, 0); dummy.scale.setScalar(s * u);
      }
      dummy.updateMatrix(); pMesh.setMatrixAt(i, dummy.matrix);
    }
    pMesh.count = alive;
    pMesh.instanceMatrix.needsUpdate = true;
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;

    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += realDt / r.dur;
      if (r.t >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - r.t, 3);
      r.m.scale.setScalar(0.3 + e * r.size); r.m.material.opacity = 0.85 * (1 - r.t);
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
        const u = i / (TN - 1), w = 0.42 * (1 - u) + 0.02;
        const h = hist[i], o = i * 6;
        tPos[o] = h.x - dy * w; tPos[o + 1] = h.y + dx * w; tPos[o + 2] = -0.05;
        tPos[o + 3] = h.x + dy * w; tPos[o + 4] = h.y - dx * w; tPos[o + 5] = -0.05;
        const c = trailColors[Math.floor(trailId === 'rainbow' ? u * trailColors.length * 0.999 : (u * 2 + tt * 3) % trailColors.length)];
        const al = trailAlpha * (1 - u) * (trailId === 'none' ? 0.45 : 0.9);
        for (const q of [0, 1]) { const ci = (i * 2 + q) * 4; tCol[ci] = c.r; tCol[ci + 1] = c.g; tCol[ci + 2] = c.b; tCol[ci + 3] = al; }
      }
      tGeo.attributes.position.needsUpdate = true; tGeo.attributes.color.needsUpdate = true;
      // 拖尾附帶粒子
      if (trailAlpha > 0.3 && trailId !== 'none' && Math.random() < 0.5) {
        const c = '#' + trailColors[Math.floor(Math.random() * trailColors.length)].getHexString();
        if (trailId === 'fire') spawn(frog.x, frog.y, 0, (Math.random() - 0.5) * 2, 2, 0, 0.4, 0.3, -4, 2, 3, c);
        else if (trailId === 'bubble') spawn(frog.x, frog.y, 0.2, (Math.random() - 0.5) * 2, 1, 0, 0.6, 0.22, -3, 1, 3, c);
        else spawn(frog.x, frog.y, 0.2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0, 0.5, 0.18, 0, 1, 0, c);
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

    shake.trauma = Math.max(0, shake.trauma - realDt * 1.6);
    shake.t += realDt * 32;
    const k = shake.trauma * shake.trauma;
    shake.x = 0.9 * k * Math.sin(shake.t * 1.7); shake.y = 0.7 * k * Math.sin(shake.t * 2.3 + 1); shake.roll = 0.035 * k * Math.sin(shake.t * 1.1 + 2);
  }

  function clear() { alive = 0; pMesh.count = 0; for (const l of L) l.t = 1; }

  return { burst, shock, update, addTrauma, shake, setTrail, resetTrail, clear, spawn };
}

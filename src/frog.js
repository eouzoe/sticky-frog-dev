// 青蛙模型（程式產生 low-poly）＋擠壓伸展、晃動大眼睛、眨眼、舌頭彈性緞帶。
import * as THREE from 'three';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const TAU = Math.PI * 2;

export function createFrog(scene) {
  const root = new THREE.Group();
  const pivA = new THREE.Group(), pivB = new THREE.Group(), pivC = new THREE.Group(), model = new THREE.Group();
  root.add(pivA); pivA.add(pivB); pivB.add(pivC); pivC.add(model);
  scene.add(root);

  const mats = { body: lam('#2ecc71'), belly: lam('#d4f7a8'), eye: lam('#ffffff'), iris: lam('#ff3b3b'), pupil: lam('#111111'), cheek: new THREE.MeshBasicMaterial({ color: '#ff8fb5' }), mouth: new THREE.MeshBasicMaterial({ color: '#4a1020' }) };
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = model) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
  };
  add(ico(0.62), mats.body, 0, -0.05, 0, 1.08, 0.86, 0.95);
  add(ico(0.5), mats.belly, 0, -0.14, 0.3, 0.86, 0.66, 0.5);
  // 眼睛：眼窩 + 眼白 + 會晃的瞳孔
  const eyes = [];
  for (const sx of [-1, 1]) {
    add(ico(0.25), mats.body, sx * 0.29, 0.36, 0.08);
    const eg = new THREE.Group(); eg.position.set(sx * 0.29, 0.44, 0.2); model.add(eg);
    add(new THREE.SphereGeometry(0.23, 10, 8), mats.eye, 0, 0, 0, 1, 1, 1, eg);
    const pg = new THREE.Group(); eg.add(pg);
    add(new THREE.SphereGeometry(0.13, 8, 6), mats.iris, 0, 0, 0.13, 1, 1, 0.6, pg);
    add(new THREE.SphereGeometry(0.075, 8, 6), mats.pupil, 0, 0, 0.2, 0.6, 1.2, 0.5, pg);
    add(new THREE.SphereGeometry(0.035, 6, 4), mats.eye, 0.04, 0.05, 0.24, 1, 1, 1, pg); // 反光點
    eyes.push({ g: eg, p: pg });
  }
  for (const sx of [-1, 1]) { const c = add(new THREE.CircleGeometry(0.09, 8), mats.cheek, sx * 0.4, 0.05, 0.53); c.castShadow = false; }
  const smile = add(new THREE.TorusGeometry(0.17, 0.035, 4, 10, Math.PI), mats.mouth, 0, 0.12, 0.55, 1, 1, 1);
  smile.rotation.z = Math.PI;
  const mouthO = add(new THREE.CircleGeometry(0.14, 10), mats.mouth, 0, 0.04, 0.57, 1, 0.8, 1); mouthO.visible = false;
  // 腿
  const legs = [];
  for (const sx of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(sx * 0.42, -0.38, 0); model.add(lg);
    add(ico(0.24, 0), mats.body, sx * 0.1, -0.05, 0, 1.4, 0.7, 0.9, lg);
    add(ico(0.16, 0), mats.belly, sx * 0.28, -0.2, 0.15, 1.3, 0.45, 1.1, lg);
    legs.push(lg);
    const fl = new THREE.Group(); fl.position.set(sx * 0.22, -0.42, 0.32); model.add(fl);
    add(ico(0.1, 0), mats.belly, 0, -0.08, 0, 1.3, 0.6, 1.1, fl);
    legs.push(fl);
  }
  // 配件（依造型顯示）
  const acc = {};
  acc.spots = new THREE.Group(); model.add(acc.spots);
  const spotMat = lam('#111133');
  for (const [x, y, z] of [[0.3, 0.05, 0.42], [-0.35, -0.1, 0.4], [0.5, -0.15, 0.1], [-0.5, 0.1, 0.1], [0.1, 0.25, -0.45], [-0.2, -0.25, -0.45]]) add(ico(0.08, 0), spotMat, x, y, z, 1, 1, 0.5, acc.spots);
  acc.band = add(new THREE.TorusGeometry(0.62, 0.07, 4, 16), lam('#ff2e2e'), 0, 0.3, 0, 1, 1, 0.9); acc.band.rotation.x = Math.PI / 2;
  acc.helmet = add(new THREE.SphereGeometry(0.95, 14, 10), new THREE.MeshLambertMaterial({ color: '#cfefff', transparent: true, opacity: 0.28, depthWrite: false }), 0, 0.1, 0);
  acc.helmet.castShadow = false;
  acc.crown = new THREE.Group(); acc.crown.position.set(0, 0.62, -0.05); model.add(acc.crown);
  const gold = new THREE.MeshPhongMaterial({ color: '#ffcf33', specular: '#ffffff', shininess: 60, flatShading: true });
  add(new THREE.CylinderGeometry(0.3, 0.26, 0.16, 8, 1, true), gold, 0, 0, 0, 1, 1, 1, acc.crown).material.side = THREE.DoubleSide;
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; add(new THREE.ConeGeometry(0.07, 0.2, 4), gold, Math.sin(a) * 0.28, 0.16, Math.cos(a) * 0.28, 1, 1, 1, acc.crown); }
  add(ico(0.06, 0), lam('#ff3b6b'), 0, 0.02, 0.29, 1, 1, 1, acc.crown);

  // 舌頭：朝鏡頭的彈性緞帶（每幀改頂點）
  const N = 18;
  const tPos = new Float32Array((N + 1) * 2 * 3);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  tGeo.setIndex(idx);
  const tMat = new THREE.MeshBasicMaterial({ color: '#ff4f7a', side: THREE.DoubleSide });
  const tongue = new THREE.Mesh(tGeo, tMat); tongue.frustumCulled = false; scene.add(tongue);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: '#ff3d6e' })); scene.add(tip);

  const st = {
    k: 1, kv: 0, axis: 0, blinkT: 2, blink: 0, pupX: 0, pupY: 0, pupVX: 0, pupVY: 0, eyeS: 1, eyeSV: 0,
    pvx: 0, pvy: 0, wob: 0, wobPhase: 0, tongueLen: 0, mouthOpen: 0, tuck: 0,
  };

  function setSkin(sk) {
    mats.body.color.set(sk.body); mats.belly.color.set(sk.belly); mats.iris.color.set(sk.eye); mats.cheek.color.set(sk.cheek);
    mats.body.transparent = !!sk.glass; mats.body.opacity = sk.glass ? 0.7 : 1;
    mats.body.emissive.set(sk.shiny ? '#5a3a00' : '#000000');
    acc.spots.visible = !!sk.spots; if (sk.spots) spotMat.color.set(sk.spots);
    acc.band.visible = !!sk.band; if (sk.band) acc.band.material.color.set(sk.band);
    acc.helmet.visible = !!sk.helmet; acc.crown.visible = !!sk.crown;
  }

  // 衝擊：k<1 壓扁、k>1 拉長；axis＝世界角度（0＝沿 y 軸）
  function squash(k, axis) { st.k = k; st.kv = 0; if (axis !== undefined) st.axis = axis; st.eyeS = 1.25; st.eyeSV = 0; }
  function jiggle(a) { st.pupVX += (Math.random() - 0.5) * a; st.pupVY += (Math.random() - 0.5) * a; }

  const mouthW = { x: 0, y: 0, z: 0 };
  function mouthWorld(s, out) {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    out.x = s.x - sn * 0.06; out.y = s.y + c * 0.06; out.z = 0.55; return out;
  }

  // s＝sim；tx/ty＝舌尖世界座標（null＝收起）
  function update(s, dt, t, tongueTip, mood) {
    root.position.set(s.x, s.y, 0);
    root.rotation.z = s.angle;
    const sp = Math.hypot(s.vx, s.vy);
    // 擠壓伸展彈簧
    let target = 1, axis = st.axis;
    if (s.mode === 'air' && sp > 6) { target = 1 + Math.min(0.28, sp * 0.009); axis = Math.atan2(-s.vx, s.vy); }
    else if (s.mode === 'swing') { target = 1 + Math.min(0.2, sp * 0.006); axis = s.angle; }
    else if (s.mode === 'perch') target = s.crouch > 0 ? 0.7 : 1 + Math.sin(t * 3.2) * 0.035;
    st.kv += ((target - st.k) * 260 - st.kv * 14) * dt;
    st.k += st.kv * dt;
    let da = axis - st.axis; da -= Math.round(da / TAU) * TAU; st.axis += da * Math.min(1, dt * 18);
    const k = Math.max(0.45, Math.min(1.7, st.k));
    pivA.rotation.z = st.axis - s.angle; pivC.rotation.z = -(st.axis - s.angle);
    const side = 1 / Math.sqrt(k); pivB.scale.set(side, k, side);
    // 加速度 → 瞳孔晃動（彈簧）
    const ax = (s.vx - st.pvx) / Math.max(dt, 1e-4), ay = (s.vy - st.pvy) / Math.max(dt, 1e-4);
    st.pvx = s.vx; st.pvy = s.vy;
    if (dt > 0) {
      const c = Math.cos(-s.angle), sn = Math.sin(-s.angle);
      const lx = ax * c - ay * sn, ly = ax * sn + ay * c;
      st.pupVX += (-lx * 0.00012 - st.pupX * 180 - st.pupVX * 9) * dt;
      st.pupVY += (-ly * 0.00012 - st.pupY * 180 - st.pupVY * 9) * dt;
      st.pupX += st.pupVX * dt; st.pupY += st.pupVY * dt;
      st.pupX = Math.max(-0.07, Math.min(0.07, st.pupX)); st.pupY = Math.max(-0.07, Math.min(0.07, st.pupY));
      st.eyeSV += ((1 - st.eyeS) * 300 - st.eyeSV * 10) * dt; st.eyeS += st.eyeSV * dt;
    }
    // 眨眼
    st.blinkT -= dt;
    if (st.blinkT < 0) { st.blink = 0.12; st.blinkT = 1.8 + Math.random() * 2.8; }
    st.blink -= dt;
    const lid = st.blink > 0 ? 0.12 : 1;
    // 看向目標
    const look = mood.lookX ?? 0, lookY = mood.lookY ?? 0;
    for (const e of eyes) {
      e.g.scale.set(st.eyeS, st.eyeS * lid * (mood.scared ? 1.2 : 1), st.eyeS);
      e.p.position.set(st.pupX + look * 0.05, st.pupY + lookY * 0.05, 0);
    }
    // 嘴巴
    st.mouthOpen += ((mood.mouth ? 1 : 0) - st.mouthOpen) * Math.min(1, dt * 20);
    mouthO.visible = st.mouthOpen > 0.3; mouthO.scale.set(1, 0.4 + st.mouthOpen * 0.6, 1); smile.visible = !mouthO.visible;
    // 腿：空中快轉時縮成一團、擺盪時張開
    const tuckT = s.mode === 'air' && Math.abs(s.omega) > 6 ? 1 : 0;
    st.tuck += (tuckT - st.tuck) * Math.min(1, dt * 10);
    const spread = s.mode === 'swing' ? 0.5 + Math.sin(t * 9) * 0.15 : s.mode === 'air' ? 0.3 : 0;
    for (let i = 0; i < legs.length; i++) {
      const sx = i < 2 ? -1 : 1;
      legs[i].rotation.z = sx * (spread * (1 - st.tuck) - st.tuck * 0.6);
      legs[i].position.y = (i % 2 ? -0.42 : -0.38) + st.tuck * 0.15;
    }
    // 舌頭
    mouthWorld(s, mouthW);
    if (tongueTip) {
      const dx = tongueTip.x - mouthW.x, dy = tongueTip.y - mouthW.y, len = Math.hypot(dx, dy) || 0.001;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const amp = mood.tongueWob * Math.min(1, len * 0.15);
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const w = 0.14 * (1 - u * 0.35);
        const off = Math.sin(u * Math.PI) * Math.sin(u * 9 - t * 38) * amp;
        const cx = mouthW.x + dx * u + px * off, cy = mouthW.y + dy * u + py * off, cz = 0.55 - 0.45 * u;
        const o = i * 6;
        tPos[o] = cx + px * w; tPos[o + 1] = cy + py * w; tPos[o + 2] = cz;
        tPos[o + 3] = cx - px * w; tPos[o + 4] = cy - py * w; tPos[o + 5] = cz;
      }
      tGeo.attributes.position.needsUpdate = true;
      tongue.visible = true; tip.visible = true;
      tip.position.set(tongueTip.x, tongueTip.y, 0.15);
      const ts = mood.tipPop ?? 1; tip.scale.setScalar(ts);
    } else { tongue.visible = false; tip.visible = false; }
  }

  return { root, setSkin, squash, jiggle, update, mouthWorld, st };
}

// 主角（GLB 軟膠公仔：青蛙／貓／猿，見 src/artkit.js SKINS）＋擠壓伸展、果凍晃、晃動大眼睛、眨眼、舌頭彈性緞帶。
import * as THREE from 'three';
import { TUNE } from './config.js';
import { dressCharacter, initEnv, SKINS as ART_SKINS } from './artkit.js';
import { ART } from './art.js';

const TAU = Math.PI * 2;
const FACE_TURN = 0.32; // 身體往前進方向（+X）轉一點，看得到側臉與立體感

// 舌頭：朝鏡頭的緞帶，但用 uv.v 做出圓管的明暗＋一條亮面高光（像糖果管），所有種類共用
function tubeShade(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { float v = vMapUv.y; float body = 0.62 + 0.38 * sin(v * 3.14159);
        float spec = smoothstep(0.16, 0.0, abs(v - 0.72)) * 0.55;
        diffuseColor.rgb = diffuseColor.rgb * body + vec3(spec); }`);
  };
  m.customProgramCacheKey = () => 'tubeShade';
}
const white = (() => { const c = document.createElement('canvas'); c.width = c.height = 2; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 2, 2); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; })();

export function createFrog(scene, renderer) {
  const root = new THREE.Group();
  const pivA = new THREE.Group(), pivB = new THREE.Group(), pivC = new THREE.Group(), model = new THREE.Group();
  root.add(pivA); pivA.add(pivB); pivB.add(pivC); pivC.add(model);
  model.rotation.y = FACE_TURN;
  scene.add(root);
  const VIS = TUNE.FROG_VIS;
  root.scale.setScalar(VIS);

  // 角色節點（換皮膚時重抓）
  let char = null, eyes = [], legs = [], legRest = [], smile = null, mouthO = null, tail = null, kind = 'frog';
  const anchor = new THREE.Vector3(0, 0.06, 0.55);

  // 舌頭：朝鏡頭的彈性緞帶（每幀改頂點）
  const N = 18;
  const tPos = new Float32Array((N + 1) * 2 * 3);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  const idx = [];
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  tGeo.setIndex(idx);
  tGeo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from({ length: (N + 1) * 4 }, (_, i) => (i % 2 ? (i >> 1) % 2 : (i >> 2) / N)), 2)); // 玩法線掛鉤：舌頭材質 uv
  let tk = { width: 1, wave: 0 }; // 玩法線掛鉤：目前的舌頭種類（src/config.js TONGUES）
  const tMat = new THREE.MeshBasicMaterial({ color: '#ff4f7a', side: THREE.DoubleSide, map: white });
  tubeShade(tMat);
  const tongue = new THREE.Mesh(tGeo, tMat); tongue.frustumCulled = false; scene.add(tongue);
  const tipMat = new THREE.MeshStandardMaterial({ color: '#ff3d6e', roughness: 0.22, envMap: initEnv(renderer), envMapIntensity: 0.9 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 14), tipMat); scene.add(tip);

  const st = {
    k: 1, kv: 0, axis: 0, blinkT: 2, blink: 0, pupX: 0, pupY: 0, pupVX: 0, pupVY: 0, eyeS: 1, eyeSV: 0,
    pvx: 0, pvy: 0, tongueLen: 0, mouthOpen: 0, tuck: 0, pop: 1, tailV: 0, tailA: 0, skin: null,
  };

  function setTongue(spec, tex) { // 玩法線掛鉤
    tk = spec; tMat.color.set(spec.color); tMat.map = tex ?? white; tMat.needsUpdate = true; tipMat.color.set(spec.tip);
    tipMat.roughness = spec.id === 'silk' ? 0.12 : spec.id === 'yarn' ? 0.6 : 0.22;
  }
  function setSkin(sk) {
    st.skin = sk;
    const id = ART_SKINS[sk.id] ? sk.id : 'tree';
    if (char) model.remove(char);
    char = dressCharacter(ART.models, id, ART.q);
    model.add(char);
    kind = sk.kind ?? 'frog';
    eyes = ['L', 'R'].map((s) => ({ g: char.getObjectByName(`eye_${s}`), p: char.getObjectByName(`pupil_${s}`) }));
    legs = ['leg_BR', 'leg_FR', 'leg_BL', 'leg_FL'].map((n) => char.getObjectByName(n)); // 跟舊版順序一樣：先 −X 邊
    legRest = legs.map((l) => ({ y: l.position.y, rz: l.rotation.z }));
    smile = char.getObjectByName('mouth_smile'); mouthO = char.getObjectByName('mouth_open'); st.moS = mouthO.scale.x;
    tail = char.getObjectByName('tail');
    if (kind === 'ape') for (const l of [legs[1], legs[3]]) l.scale.set(1.45, 1, 1.45); // 美術線提醒：猿的手臂偏細
    // 舌頭起點：tongue_anchor（模型空間）轉進 pivot 空間（含 FACE_TURN）
    const a = char.getObjectByName('tongue_anchor').position, c = Math.cos(FACE_TURN), s = Math.sin(FACE_TURN);
    anchor.set(a.x * c + a.z * s, a.y, -a.x * s + a.z * c);
  }

  // 衝擊：k<1 壓扁、k>1 拉長；axis＝世界角度（0＝沿 y 軸）
  function squash(k, axis) { st.k = k; st.kv = 0; if (axis !== undefined) st.axis = axis; st.eyeS = 1.25; st.eyeSV = 0; }
  function jiggle(a) { st.pupVX += (Math.random() - 0.5) * a; st.pupVY += (Math.random() - 0.5) * a; }
  // 果凍：在目前的形變上再踢一下彈簧（不重設，所以連續事件會疊成更大的晃動，彈簧本身會收斂）
  function jelly(a) { st.kv += a; st.eyeSV += a * 2; }
  function popIn() { st.pop = 0; }

  function mouthWorld(s, out) {
    const c = Math.cos(s.angle), sn = Math.sin(s.angle);
    out.x = s.x + (anchor.x * c - anchor.y * sn) * VIS; out.y = s.y + (anchor.x * sn + anchor.y * c) * VIS; out.z = anchor.z * VIS; return out;
  }
  const mouthW = { x: 0, y: 0, z: 0 };

  // s＝sim；tongueTip＝舌尖世界座標（null＝收起）
  function update(s, dt, t, tongueTip, mood) {
    root.position.set(s.x, s.y, 0);
    root.rotation.z = s.angle;
    // 出場：彈性放大（換關過場）
    if (st.pop < 1) { st.pop = Math.min(1, st.pop + dt / 0.5); const u = st.pop; root.scale.setScalar(VIS * (1 - Math.pow(1 - u, 3) * Math.cos(u * 9))); }
    else root.scale.setScalar(VIS);
    const sp = Math.hypot(s.vx, s.vy);
    // 擠壓伸展彈簧（阻尼偏低＝果凍感，會多晃一兩下）
    let target = 1, axis = st.axis;
    if (s.mode === 'air' && sp > 6) { target = 1 + Math.min(0.28, sp * 0.009); axis = Math.atan2(-s.vx, s.vy); }
    else if (s.mode === 'swing') { target = 1 + Math.min(0.2, sp * 0.006); axis = s.angle; }
    else if (s.mode === 'perch') target = s.crouch > 0 ? 0.7 : 1 + Math.sin(t * 3.2) * 0.035; // 預備蹲＋呼吸
    st.kv += ((target - st.k) * 280 - st.kv * 9) * dt;
    st.k += st.kv * dt;
    let da = axis - st.axis; da -= Math.round(da / TAU) * TAU; st.axis += da * Math.min(1, dt * 18);
    const k = Math.max(0.45, Math.min(1.75, st.k));
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
    mouthO.visible = st.mouthOpen > 0.3; mouthO.scale.setScalar(st.moS * (0.5 + st.mouthOpen * 0.6)); smile.visible = !mouthO.visible;
    // 腿：空中快轉時縮成一團、擺盪時張開（讀進來時記下原始高度，再加位移）
    const tuckT = s.mode === 'air' && Math.abs(s.omega) > 6 ? 1 : 0;
    st.tuck += (tuckT - st.tuck) * Math.min(1, dt * 10);
    const spread = s.mode === 'swing' ? 0.5 + Math.sin(t * 9) * 0.15 : s.mode === 'air' ? 0.3 : 0;
    for (let i = 0; i < legs.length; i++) {
      const sx = i < 2 ? -1 : 1;
      legs[i].rotation.z = legRest[i].rz + sx * (spread * (1 - st.tuck) - st.tuck * 0.6);
      legs[i].position.y = legRest[i].y + st.tuck * 0.15;
    }
    // 貓尾巴：平常慢慢搖、速度越快甩越大，翻滾時捲起來
    if (tail) {
      const want = Math.sin(t * (4 + sp * 0.25)) * (0.25 + Math.min(0.5, sp * 0.03)) - st.tuck * 0.5;
      st.tailV += ((want - st.tailA) * 120 - st.tailV * 8) * dt; st.tailA += st.tailV * dt;
      tail.rotation.z = st.tailA; tail.rotation.x = -0.2 - st.tuck * 0.6;
    }
    // 舌頭
    mouthWorld(s, mouthW);
    if (tongueTip) {
      const dx = tongueTip.x - mouthW.x, dy = tongueTip.y - mouthW.y, len = Math.hypot(dx, dy) || 0.001;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      const amp = mood.tongueWob * Math.min(1, len * 0.15);
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const w = 0.15 * tk.width * (1 - u * 0.3);
        const off = Math.sin(u * Math.PI) * (Math.sin(u * 9 - t * 38) * amp + Math.sin(u * len * 1.3) * tk.wave); // 玩法線掛鉤：wave＝藤蔓／毛線的靜態捲曲
        const cx = mouthW.x + dx * u + px * off, cy = mouthW.y + dy * u + py * off, cz = mouthW.z * (1 - u) + 0.1 * u;
        const o = i * 6;
        tPos[o] = cx + px * w; tPos[o + 1] = cy + py * w; tPos[o + 2] = cz;
        tPos[o + 3] = cx - px * w; tPos[o + 4] = cy - py * w; tPos[o + 5] = cz;
      }
      tGeo.attributes.position.needsUpdate = true; if (tMat.map) tMat.map.repeat.x = tMat.map === white ? 1 : len / 1.4; // 玩法線掛鉤
      tongue.visible = true; tip.visible = true;
      tip.position.set(tongueTip.x, tongueTip.y, 0.15);
      const ts = (mood.tipPop ?? 1) * (tk.tipScale ?? 1); tip.scale.setScalar(ts); // 玩法線掛鉤：tipScale
    } else { tongue.visible = false; tip.visible = false; }
  }

  return { root, setSkin, setTongue, squash, jiggle, jelly, popIn, update, mouthWorld, st };
}

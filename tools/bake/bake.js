// 離線烘焙：用原版的模型、材質（artkit.js）與打光，把每個角色零件、關卡道具、背景件渲染成 2D 精靈圖，打包成圖集。
// 跑法：bun tools/bake/run.mjs（會開無頭 Chrome 載入這一頁，結果寫進 src/art/）。
// 鏡頭：長焦透視（fov 6°，近似正交）——原版材質的邊緣光用 vViewPosition 算菲涅耳，正交鏡頭會算錯。
// 零件分層：每層單獨渲染，其他零件只寫深度不寫顏色，所以各層疊回去＝整體渲染（遮擋關係正確）。
import * as THREE from 'three';
import { loadModels, dressCharacter, dressProp, initEnv, softMaterial, WORLD_PAL, BG_SETS } from './artkit.js';

const SS = 2; // 超取樣倍數
const HEMI = [['#ffffff', '#4a8f5a'], ['#ffffff', '#d98bb8'], ['#b8a8ff', '#3a1450'], ['#ffd0a0', '#5a1a1a'], ['#ffffff', '#86b4dc'], ['#ffdcb4', '#7a3a63']];
const HILL = [['#7fcf9a', '#a7dfb4'], ['#ffb3d9', '#ffd6ea'], ['#2a1458', '#3d1d6e'], ['#5a2a24', '#7a3a2a'], ['#8fbbe6', '#c4def5'], ['#a8467e', '#d4628a']];
const FROG_SKINS = ['tree', 'dart', 'tomato', 'candy', 'glass', 'ninja', 'gold', 'astro', 'king', 'silkfrog'];
const log = (...a) => { console.log('[bake]', ...a); };

const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
initEnv(renderer);

const scene = new THREE.Scene();
const hemi = new THREE.HemisphereLight('#ffffff', '#4a8f5a', 2.1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const cam = new THREE.PerspectiveCamera(6, 1, 1, 4000);

function setWorldLight(wi) { hemi.color.set(HEMI[wi][0]); hemi.groundColor.set(HEMI[wi][1]); }

// 鏡頭方向：仰角 elev（度，正＝從上往下看）、偏航 yaw（物件繞垂直軸轉）。回傳框住整個物件的鏡頭與像素尺寸
function frame(obj, px, elev) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const R = size.length() * 0.5 + 0.05, dist = R / Math.tan((3 * Math.PI) / 180) * 1.15;
  const e = (elev * Math.PI) / 180;
  cam.position.set(c.x, c.y + Math.sin(e) * dist, c.z + Math.cos(e) * dist); cam.lookAt(c); cam.updateMatrixWorld(true);
  // 投影 8 個角找出畫面範圍（世界單位，在物件中心的深度上）
  const pts = []; for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  const inv = cam.matrixWorldInverse;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { const v = p.clone().applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  const pad = 0.12; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, wU = x1 - x0, hU = y1 - y0;
  // 把鏡頭平移到畫面中心，fov 對準高度
  cam.position.add(new THREE.Vector3(cx, cy, 0).applyQuaternion(cam.quaternion));
  cam.fov = (2 * Math.atan(hU / 2 / dist) * 180) / Math.PI; cam.aspect = wU / hU; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  const W = Math.max(4, Math.ceil(wU * px)), H = Math.max(4, Math.ceil(hU * px));
  // 太陽陰影框住物件
  const sdir = new THREE.Vector3(6, 16, 12).normalize();
  sun.target.position.copy(c); sun.position.copy(c).addScaledVector(sdir, R * 3 + 5);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.5, far: R * 6 + 10 }); sun.shadow.camera.updateProjectionMatrix();
  return { W, H, unit: 1 / px };
}
const proj = (p, W, H) => { const v = p.clone().project(cam); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H, v.z]; };

// 渲染一次到 2D 畫布（超取樣後縮小）
const out2d = document.createElement('canvas');
function shot(W, H) {
  renderer.setSize(W * SS, H * SS, false);
  renderer.render(scene, cam);
  out2d.width = W; out2d.height = H;
  const g = out2d.getContext('2d'); g.clearRect(0, 0, W, H); g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, W, H);
  return g.getImageData(0, 0, W, H);
}
// 裁掉透明邊
function crop(img) {
  const { width: W, height: H, data: d } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').putImageData(img, -x0, -y0, x0, y0, w, h);
  return { canvas: c, x0, y0, w, h };
}

// 物件的網格：依「層」分組；每層單獨渲染，其他網格只寫深度
function meshesOf(obj) { const a = []; obj.traverse((o) => { if (o.isMesh) a.push(o); }); return a; }
// on＝這層要畫的網格；occ＝只寫深度的遮擋物（例：眼白被身體遮住的那一半不畫）；其他網格隱藏
function setLayer(all, on, occ) {
  for (const m of all) {
    if (!m.userData.mat0) m.userData.mat0 = m.material;
    if (on.has(m)) { m.material = m.userData.mat0; m.visible = true; }
    else if (occ.has(m)) { m.material = depthOnly; m.visible = true; }
    else m.visible = false;
  }
}
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });

const sprites = []; // { key, atlas, canvas, w, h, ax, ay, unit, px?, py?, depth? }
/** 拍一個物件：layers＝[{ name, pick(mesh), occ?: [其他層名] }]，依序認領網格（先認領先得，最後一層可用 ()=>true 收剩下的）；
 *  全部層共用同一個構圖與原點（錨點＝物件原點），2D 疊回去就是原本的樣子 */
function bake(atlas, key, obj, { px = 80, elev = 6, layers = [{ name: '', pick: () => true }], pivots = {}, origin = new THREE.Vector3() } = {}) {
  scene.add(obj);
  const all = meshesOf(obj);
  for (const m of all) { m.userData.vis0 ??= m.visible; m.castShadow = m.userData.vis0 !== false && m.material?.name !== 'wing' && m.material?.name !== 'glass'; m.receiveShadow = true; }
  const fr = frame(obj, px, elev);
  const o = proj(obj.localToWorld(origin.clone()), fr.W, fr.H);
  // 先把網格分給各層
  const own = new Map(), sets = {};
  for (const L of layers) sets[L.name] = new Set();
  for (const m of all) { if (m.userData.vis0 === false) continue; const L = layers.find((l) => l.pick(m)); if (L) { own.set(m, L.name); sets[L.name].add(m); } }
  for (const L of layers) {
    const name = L.name, on = sets[name];
    if (!on.size) continue;
    const occ = new Set((L.occ ?? []).flatMap((n) => [...(sets[n] ?? [])]));
    setLayer(all, on, occ);
    const c = crop(shot(fr.W, fr.H));
    if (!c) continue;
    // 這層的深度（排序用）：層內網格中心在鏡頭空間的距離
    let dsum = 0; for (const m of on) { const b = new THREE.Box3().setFromObject(m, true).getCenter(new THREE.Vector3()); dsum += b.applyMatrix4(cam.matrixWorldInverse).z; }
    const spr = { key: name ? `${key}.${name}` : key, atlas, canvas: c.canvas, w: c.w, h: c.h, ax: +(o[0] - c.x0).toFixed(1), ay: +(o[1] - c.y0).toFixed(1), unit: fr.unit, depth: +(dsum / on.size).toFixed(3) };
    const pv = pivots[name]; if (pv) { const p = proj(obj.localToWorld(pv.clone()), fr.W, fr.H); spr.px = +(p[0] - c.x0).toFixed(1); spr.py = +(p[1] - c.y0).toFixed(1); }
    sprites.push(spr);
  }
  for (const m of all) { if (m.userData.mat0) m.material = m.userData.mat0; m.visible = m.userData.vis0 ?? true; }
  scene.remove(obj);
}
const nodePos = (obj, name) => { obj.updateMatrixWorld(true); const n = obj.getObjectByName(name); if (!n) return null; const p = new THREE.Vector3().setFromMatrixPosition(n.matrixWorld); return obj.worldToLocal(p); };
const under = (m, names) => { for (let a = m; a; a = a.parent) if (names.includes(a.name)) return true; return false; };

async function main() {
  const models = await loadModels('./models/');
  log('models', Object.keys(models).length);
  setWorldLight(0);
  const FACE_TURN = 0.32;

  // ---------------- 角色（青蛙各造型、藤猿）：零件分層，原點＝角色原點
  // 遮擋：眼白被身體遮、虹膜被身體與眼白遮、嘴與配件被身體遮；腿和身體不互遮（腿在 2D 會轉，互遮會留洞）
  const charLayers = [
    { name: 'acc', pick: (m) => under(m, ['acc_band', 'acc_helmet', 'acc_crown']), occ: ['body'] },
    { name: 'legBL', pick: (m) => under(m, ['legB_L']) }, { name: 'legBR', pick: (m) => under(m, ['legB_R']) },
    { name: 'legFL', pick: (m) => under(m, ['legF_L', 'arm_L']) }, { name: 'legFR', pick: (m) => under(m, ['legF_R', 'arm_R']) },
    { name: 'eyeL', pick: (m) => m.name === 'eyeWhite_L', occ: ['body'] }, { name: 'eyeR', pick: (m) => m.name === 'eyeWhite_R', occ: ['body'] },
    { name: 'irisL', pick: (m) => /^(iris|pupil|pupilDot)_L/.test(m.name), occ: ['body', 'eyeL'] }, { name: 'irisR', pick: (m) => /^(iris|pupil|pupilDot)_R/.test(m.name), occ: ['body', 'eyeR'] },
    { name: 'glintL', pick: (m) => m.name === 'glint_L' }, { name: 'glintR', pick: (m) => m.name === 'glint_R' },
    { name: 'smile', pick: (m) => m.name === 'mouth_smile', occ: ['body'] }, { name: 'open', pick: (m) => m.name === 'mouth_open', occ: ['body'] },
    { name: 'body', pick: () => true },
  ];
  for (const id of [...FROG_SKINS, 'ape']) {
    const obj = dressCharacter(models, id, 'high');
    obj.rotation.y = FACE_TURN;
    const mo = obj.getObjectByName('mouth_open'); if (mo) { mo.visible = true; mo.userData.vis0 = true; }
    const pivots = {};
    for (const [k, ns] of [['legBL', ['legB_L']], ['legBR', ['legB_R']], ['legFL', ['legF_L', 'arm_L']], ['legFR', ['legF_R', 'arm_R']], ['eyeL', ['eye_L']], ['eyeR', ['eye_R']], ['irisL', ['eye_L']], ['irisR', ['eye_R']], ['open', ['tongue_anchor']]]) {
      for (const n of ns) { const p = nodePos(obj, n); if (p) { pivots[k] = p; break; } }
    }
    bake(`c_${id}`, id, obj, { px: 110, elev: 4, layers: charLayers, pivots }); // 每個造型一張圖集：開機只載身上那一張
    log('char', id);
  }
  // 共用：蒼蠅、金幣、翻轉圈（配色不分世界）
  {
    const fly = dressProp(models, 'prop-fly', 0, 'high');
    const pv = { wingL: nodePos(fly, 'wing_L'), wingR: nodePos(fly, 'wing_R') };
    bake('shared', 'fly', fly, { px: 90, elev: 2, layers: [{ name: 'wingL', pick: (m) => under(m, ['wing_L']) }, { name: 'wingR', pick: (m) => under(m, ['wing_R']) }, { name: 'body', pick: () => true }], pivots: pv });
    const coin = dressProp(models, 'prop-coin', 0, 'high'); bake('shared', 'coin', coin, { px: 90, elev: 2 });
    const ring = dressProp(models, 'prop-ring', 0, 'high'); ring.rotation.y = 0.55; bake('shared', 'ring', ring, { px: 60, elev: 0 });
  }

  // ---------------- 各世界：關卡道具＋背景件
  for (let wi = 0; wi < 6; wi++) {
    setWorldLight(wi);
    const A = `w${wi}`, P = WORLD_PAL[wi], D = (n) => dressProp(models, n, wi, 'high');
    bake(A, 'hook', D('prop-hook'), { px: 80, elev: 0 });
    const mush = D('prop-mush'); bake(A, 'mush', mush, { px: 80, elev: 6, layers: [{ name: 'stem', pick: (m) => under(m, ['stem']) }, { name: 'cap', pick: () => true }], pivots: { stem: nodePos(mush, 'stem') } });
    const spike = D('prop-spike'); spike.rotation.set(0.4, 0.7, 0); bake(A, 'spike', spike, { px: 72, elev: 0 });
    bake(A, 'saw', D('prop-saw'), { px: 72, elev: 0 });
    bake(A, 'boost', D('prop-boost'), { px: 72, elev: 0 });
    if (wi === 3) bake(A, 'geyser', D('prop-geyser'), { px: 60, elev: 10 });
    else {
      const fan = D('prop-fan'); fan.rotation.x = 0.28;
      const bl = fan.getObjectByName('blades');
      for (const m of meshesOf(bl)) { const u = m.material.userData.uniforms; if (u) { u.uBase.value.set(P.petal); u.uSec.value.set(P.bud); } }
      bake(A, 'fanBase', fan, { px: 60, elev: 8, layers: [{ name: '', pick: (m) => !under(m, ['blades']) }] });
      for (let k = 0; k < 4; k++) { bl.rotation.y = (k / 4) * (Math.PI * 2 / 3); bake(A, `blade${k}`, fan, { px: 60, elev: 8, layers: [{ name: '', pick: (m) => under(m, ['blades']) }] }); }
    }
    const pad = D('prop-pad'); pad.scale.set(1, 1.6, 2.1); pad.rotation.y = Math.PI; bake(A, 'pad', pad, { px: 56, elev: 16 });
    bake(A, 'goal', D('prop-goal'), { px: 32, elev: 16 });
    const wall = D('prop-goalWall'); bake(A, 'goalWall', wall, { px: 30, elev: 6 });
    // 程序幾何（原版 levelview.js 的 GEO）：木樁、藤蔓、葉子、旗桿、旗子
    bake(A, 'stump', new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.5, 32), softMaterial(P.wood, 'high', { rough: 0.5 })), { px: 56, elev: 8 });
    { const g = new THREE.CylinderGeometry(0.09, 0.09, 1, 12); g.translate(0, 0.5, 0); bake(A, 'vine', new THREE.Mesh(g, softMaterial(P.vine, 'high', { rough: 0.5 })), { px: 64, elev: 0 }); }
    { const g = new THREE.SphereGeometry(0.5, 16, 10); g.scale(1.5, 0.42, 0.8); g.translate(0.55, 0, 0); bake(A, 'leaf', new THREE.Mesh(g, softMaterial(P.leaf ?? '#2fbf62', 'high', { rough: 0.4 })), { px: 90, elev: 10 }); }
    bake(A, 'flagPole', new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 12), softMaterial('#ffffff', 'high', { rough: 0.3 })), { px: 48, elev: 0 });
    bake(A, 'flag', new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4, 8, 2), softMaterial(P.accent ?? '#ff4f86', 'high', { rough: 0.4 })), { px: 48, elev: 0 });
    // 背景件：每個模型三個偏航角，讓擺放有變化
    const sets = [...BG_SETS[wi]];
    sets.forEach((n, si) => { for (let k = 0; k < 3; k++) { const o = D(n); o.rotation.y = k * 2.1 + 0.4; bake(A, `bg${si}_${k}`, o, { px: si === 0 ? 24 : si === 1 ? 32 : 28, elev: 5 }); } });
    if (wi <= 1) { for (let k = 0; k < 2; k++) { const o = D('prop-pad'); o.rotation.y = k * 1.9; o.scale.setScalar(1.4); bake(A, `bgPad${k}`, o, { px: 30, elev: 14 }); } }
    if (wi <= 1) { for (let k = 0; k < 2; k++) { const o = D('bg-cloud'); o.rotation.y = k * 0.4; o.scale.set(3.6, 2.6, 2); bake(A, `cloud${k}`, o, { px: 10, elev: -2 }); } }
    if (wi === 4) { for (let k = 0; k < 2; k++) { const g = new THREE.CylinderGeometry(1, 1.12, 0.42, 7, 1); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const s = 0.84 + ((i * 7 + k * 13) % 10) / 33; pa.setX(i, pa.getX(i) * s); pa.setZ(i, pa.getZ(i) * s); } g.computeVertexNormals(); const f = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, envMap: initEnv(renderer), envMapIntensity: 0.5 })); f.scale.set(1.8, 1, 1.3); f.rotation.y = k; bake(A, `floe${k}`, f, { px: 30, elev: 14 }); } }
    // 遠山：白色球體（執行時上兩種山色），只用上半
    { const g = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); const h = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: HILL[wi][0], roughness: 0.8 })); h.scale.set(22, 15, 8); bake(A, 'hill', h, { px: 8, elev: 2 }); }
    log('world', wi, sprites.filter((s) => s.atlas === A).length);
  }
  return pack();
}

// ---------------- 打包：天際線（skyline bottom-left）——每張圖放在目前最低、放得下的位置；2048 寬，4 像素間距（mipmap 兩層不滲色）
function skyline(list, MAXW, PAD) {
  let sky = [{ x: 0, y: 0, w: MAXW }];
  for (const s of list) {
    const w = s.w + PAD, h = s.h + PAD;
    let best = null;
    for (let i = 0; i < sky.length; i++) {
      if (sky[i].x + w > MAXW) break;
      let y = 0, rem = w, j = i;
      while (rem > 0 && j < sky.length) { y = Math.max(y, sky[j].y); rem -= sky[j].w; j++; }
      if (rem > 0) continue;
      if (!best || y + h < best.y + best.h || (y + h === best.y + best.h && sky[i].x < best.x)) best = { i, x: sky[i].x, y, h };
    }
    s.x = best.x + PAD; s.y = best.y + PAD;
    // 更新天際線：新段 [x, x+w) 高度 y+h，切掉被蓋住的段
    const nx = best.x, ny = best.y + h, out = [];
    for (const seg of sky) {
      const a = seg.x, b = seg.x + seg.w;
      if (b <= nx || a >= nx + w) { out.push(seg); continue; }
      if (a < nx) out.push({ x: a, y: seg.y, w: nx - a });
      if (b > nx + w) out.push({ x: nx + w, y: seg.y, w: b - nx - w });
    }
    out.push({ x: nx, y: ny, w });
    out.sort((p, q) => p.x - q.x);
    // 合併同高相鄰段
    sky = []; for (const seg of out) { const last = sky[sky.length - 1]; if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w; else sky.push({ ...seg }); }
  }
  return Math.max(...list.map((s) => s.y + s.h)) + PAD;
}
function pack() {
  const PAD = 4, atlases = {}, frames = {};
  const by = {}; for (const s of sprites) (by[s.atlas] ??= []).push(s);
  for (const [name, list] of Object.entries(by)) {
    const MAXW = /^w\d$/.test(name) ? 2048 : 512; // 世界圖集寬；角色／共用圖集小，窄一點不浪費顯示記憶體
    list.sort((a, b) => b.h - a.h || b.w - a.w);
    const H = Math.ceil(skyline(list, MAXW, PAD) / 4) * 4, W = MAXW;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    for (const s of list) {
      g.drawImage(s.canvas, s.x, s.y);
      frames[/^w\d$/.test(name) ? `${name}.${s.key}` : s.key] = { a: name, x: s.x, y: s.y, w: s.w, h: s.h, ax: s.ax, ay: s.ay, u: +s.unit.toFixed(6), ...(s.px !== undefined ? { px: s.px, py: s.py } : {}), d: s.depth };
    }
    atlases[name] = { w: W, h: H, webp: c.toDataURL('image/webp', /^w\d$/.test(name) ? 0.86 : 0.9) };
    log('atlas', name, W, H, list.length);
  }
  return { atlases, frames };
}

main().then((r) => { window.__bake = r; }).catch((e) => { console.error(e); window.__bakeError = String(e?.stack ?? e); });

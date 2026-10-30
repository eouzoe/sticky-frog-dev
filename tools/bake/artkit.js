// STICKY FROG art kit runtime（複製自 hook-hero-art d0f791d viewer/kit.js；整合線只加了 softMaterial）。
// - loadModels(): GLTFLoader + meshopt decoder, returns { name: template Object3D }
// - dress(template, palette, quality): clone + assign materials by material name
// - quality 'high' = direction A (soft vinyl: MeshStandard + env + rim); 'low' = direction C path (Lambert + rim, cheap)
// Colour attribute masks (from Blender): R = sec, G = acc, B = pattern. diffuse = mix(mix(mix(base, sec, R), pat, B), acc, G)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MODELS = ['char-frog', 'char-cat', 'char-ape', 'acc-band', 'acc-helmet', 'acc-crown', 'prop-hook', 'prop-pad', 'prop-goal', 'prop-goalWall',
  'prop-mush', 'prop-fan', 'prop-geyser', 'prop-spike', 'prop-saw', 'prop-ring', 'prop-boost', 'prop-coin', 'prop-fly', 'bg-cloud', 'bg-jungle-a', 'bg-jungle-b', 'bg-candy-a', 'bg-candy-b',
  'bg-city-a', 'bg-city-b', 'bg-volcano-a', 'bg-volcano-b', 'bg-frost-a', 'bg-frost-b', 'bg-frost-c', 'bg-dunes-a', 'bg-dunes-b', 'bg-dunes-c'];

// ------------------------------------------------------------------ characters (ids = hook-hero SKINS)
const S = (o) => o;
export const SKINS = {
  tree: S({ model: 'char-frog', body: '#2fd36a', belly: '#e4ff8a', eye: '#ff4a4a', cheek: '#ff7fa8' }),
  dart: S({ model: 'char-frog', body: '#2f6bff', belly: '#9cc4ff', eye: '#16161c', cheek: '#7fd0ff', spots: '#111133' }),
  tomato: S({ model: 'char-frog', body: '#ff5a3c', belly: '#ffc29a', eye: '#ffd23f', cheek: '#ffd0c0' }),
  candy: S({ model: 'char-frog', body: '#ff8fd0', belly: '#b8ffe4', eye: '#7a3cff', cheek: '#ffffff', spots: '#ffffff' }),
  glass: S({ model: 'char-frog', body: '#b6ff6b', belly: '#eaffd0', eye: '#ffe14d', cheek: '#ffffff', glass: true }),
  ninja: S({ model: 'char-frog', body: '#2b2d42', belly: '#555b78', eye: '#ffffff', cheek: '#ff3b3b', band: '#ff2e2e', acc: ['acc-band'] }),
  gold: S({ model: 'char-frog', body: '#ffc93c', belly: '#fff0b0', eye: '#2b2b2b', cheek: '#ff9f43', shiny: true }),
  astro: S({ model: 'char-frog', body: '#7ad151', belly: '#ffffff', eye: '#111111', cheek: '#ff8fb5', acc: ['acc-helmet'] }),
  king: S({ model: 'char-frog', body: '#9c6b3c', belly: '#e8c89a', eye: '#ffcc00', cheek: '#c05a3c', spots: '#6b4422', acc: ['acc-crown'] }),
  cat: S({ model: 'char-cat', body: '#ffa94d', belly: '#fff1d6', eye: '#3cd070', cheek: '#ff9fb2', spots: '#d9772b' }),
  ape: S({ model: 'char-ape', body: '#8a5a3c', belly: '#e8c39e', eye: '#3b2a1a', cheek: '#d98b6a', band: '#3fae4a' }),
  silkfrog: S({ model: 'char-frog', body: '#7d5cff', belly: '#f0eaff', eye: '#ffffff', cheek: '#c9b8ff', spots: '#ffffff', pupil: '#2a1a5e' }),
};

function skinPalette(sk) {
  return {
    skin: { c: [sk.body, sk.belly, sk.cheek, sk.spots ?? sk.body], rough: sk.shiny ? 0.18 : 0.32, metal: sk.shiny ? 0.55 : 0, glass: sk.glass, env: sk.shiny ? 1.1 : sk.glass ? 0.9 : 0.55, rim: sk.glass ? 0.7 : 0.5 },
    eye: { c: ['#ffffff'], rough: 0.08, env: 1 }, iris: { c: [sk.eye], rough: 0.08, env: 1 }, pupil: { c: [sk.pupil ?? '#14131c'], rough: 0.06, env: 1 },
    glint: { basic: '#ffffff' }, mouth: { c: ['#5a1830'], rough: 0.4 }, mouthIn: { c: ['#7a1838'], rough: 0.5 },
    nose: { c: ['#ff8fa8'], rough: 0.25 }, whisker: { c: ['#fff6ea'], rough: 0.5, rim: 0 },
    band: { c: [sk.band ?? '#ff2e2e', '#ffffff'], rough: 0.45, rim: 0.3 },
    glass: { c: ['#cfefff'], glass: true, opacity: 0.28, rough: 0.05, env: 1.2, rim: 0.6 }, metal: { c: ['#e6ecf5'], rough: 0.25, metal: 0.7, env: 1.2 },
    accent: { c: ['#ff4f86'], rough: 0.3 }, gold: { c: ['#ffcf33'], rough: 0.2, metal: 0.6, env: 1.3 }, gem: { c: ['#ff3b6b'], rough: 0.05, env: 1.2 },
  };
}

// ------------------------------------------------------------------ worlds (ids = hook-hero WORLDS order)
// Hazards are re-tuned so they never melt into the world palette: dark glossy core + hot tips / stripes everywhere.
export const WORLD_PAL = [
  { name: 'JUNGLE', petal: '#ff5fa8', petal2: '#ffc2e0', bud: '#ffc929', leaf: '#22b45c', leaf2: '#7be38f', vine: '#28b05a', pad: '#2fcf6c', pad2: '#1a9c50', vein: '#9af0a8',
    cap: '#ff4757', capSpot: '#ffffff', capUnder: '#ffe2c8', stem: '#f5e6c8', wood: '#a0643a', blade: '#f2f2f2',
    hazard: '#3a2a30', hazardTip: '#ff4040', saw: '#cfd6de', sawStripe: '#ffcf33', hub: '#e83a3a',
    trunk: '#a0643a', crown: '#2fbf62', crown2: '#9cf07e', accent: '#ff4f86', cloud: '#ffffff' },
  { name: 'CANDY', petal: '#7be0ff', petal2: '#e6fbff', bud: '#ffffff', leaf: '#ff7eb6', leaf2: '#ffd0e6', vine: '#ff7eb6', pad: '#7ee0a8', pad2: '#4cc489', vein: '#d8ffe9',
    cap: '#9b5de5', capSpot: '#ffe066', capUnder: '#f0e0ff', stem: '#fff7fb', wood: '#c97b4a', blade: '#ffffff',
    hazard: '#3b2340', hazardTip: '#ff2d55', saw: '#d8dde6', sawStripe: '#2b1a33', hub: '#ff2d55',
    stick: '#ffffff', candy: '#ff5fa8', candy2: '#fff0f7', dome: '#7be0ff', dome2: '#e9fbff', accent: '#ff2d55', cloud: '#fff4fb' },
  { name: 'NEON CITY', petal: '#00f0ff', petal2: '#c8ffff', bud: '#ff2bd6', leaf: '#7a5cff', leaf2: '#b9a8ff', vine: '#7a5cff', pad: '#00e0a0', pad2: '#00a37a', vein: '#a8fff0',
    cap: '#00e0a0', capSpot: '#eaffff', capUnder: '#1d3a4a', stem: '#3a2a66', wood: '#3a2a66', blade: '#e0e0ff',
    hazard: '#1a1626', hazardTip: '#ff2bd6', saw: '#c8ccd8', sawStripe: '#ffe600', hub: '#ff2bd6', glow: 1,
    building: '#3d2f6e', building2: '#ff2bd6', window: '#ffe36b', neon: '#ff2bd6', neon2: '#00f0ff', accent: '#00f0ff', cloud: '#5a3a8a' },
  { name: 'VOLCANO', petal: '#ffb020', petal2: '#ffe2a0', bud: '#ff5a1f', leaf: '#56b870', leaf2: '#a8e08a', vine: '#5a3b2b', pad: '#56b870', pad2: '#3a8a52', vein: '#b8f0a0',
    cap: '#ff7a00', capSpot: '#3a2420', capUnder: '#ffd2a0', stem: '#7a5a50', wood: '#4a3030', blade: '#ffcf40',
    hazard: '#1e1416', hazardTip: '#ffdd33', saw: '#ffcf40', sawStripe: '#1e1416', hub: '#ff3a00', glow: 1,
    rock: '#2e2224', rock2: '#55444a', lava: '#ff6a1a', accent: '#ff6a1a', cloud: '#6a3a30' },
  // 冰峰：冰藍、白、莓紅點綴。鉤點是冰藍花瓣＋莓紅花苞；危險物是深藍核心＋莓紅尖（跟冰面分開）
  { name: 'FROSTBITE PEAKS', petal: '#ff4d94', petal2: '#ffc4dc', bud: '#ffd21f', leaf: '#4aa8d8', leaf2: '#e0f6ff', vine: '#3d86c4', pad: '#8ee6e6', pad2: '#4fb8c8', vein: '#f6ffff',
    cap: '#8a5cff', capSpot: '#ffffff', capUnder: '#eaf6ff', stem: '#eaf6ff', wood: '#4d6f9a', blade: '#e8f6ff',
    hazard: '#17233f', hazardTip: '#ff9a14', saw: '#dfeaf5', sawStripe: '#ff9a14', hub: '#ff9a14', glow: 0,
    trunk: '#6a4a3c', crown: '#1f7a78', crown2: '#f4fbff', accent: '#ff4f7a', cloud: '#ffffff',
    rock: '#4f7fb2', rock2: '#e4f1fb', lava: '#ffffff', ice: '#5fd0f8', ice2: '#ffffff', ice3: '#cfeefc' },
  // 夕陽沙丘：青綠鉤點（跟橘紫天空互補）、深靛核心＋緋紅尖的危險物、沙丘金黃（程序網格）；死亡地面是暗酒紅流沙
  { name: 'SUNSET DUNES', petal: '#0fb3ae', petal2: '#9ff0e8', bud: '#fff3b0', leaf: '#37b79a', leaf2: '#b6f5d8', vine: '#1fa59a', pad: '#46dc9a', pad2: '#2aa874', vein: '#d8ffe9',
    cap: '#ff5aa5', capSpot: '#fff3b0', capUnder: '#ffe0ec', stem: '#fff1d6', wood: '#8a4b2a', blade: '#fff3b0',
    hazard: '#2a1346', hazardTip: '#ff2e63', saw: '#dfe8ff', sawStripe: '#ff2e63', hub: '#ff2e63', glow: 0,
    trunk: '#8a5a3a', crown: '#3aa86a', crown2: '#a8e88a', accent: '#ff5aa5', cloud: '#ffc79a',
    rock: '#7c3b3f', rock2: '#cf7f5e', lava: '#ffffff' },
];

function worldPalette(w) {
  return {
    petal: { c: [w.petal, w.petal2], rough: 0.35 }, bud: { c: [w.bud, '#ffffff'], rough: 0.25 }, leaf: { c: [w.leaf, w.leaf2, w.leaf2], rough: 0.4 },
    vine: { c: [w.vine], rough: 0.5 }, pad: { c: [w.pad, w.pad2, w.vein], rough: 0.35 },
    cap: { c: [w.cap, w.capUnder, w.cap, w.capSpot], rough: 0.3 }, stem: { c: [w.stem], rough: 0.45 },
    wood: { c: [w.wood, '#ffffff', '#1a1a1a'], rough: 0.45 }, blade: { c: [w.blade, '#9aa0aa'], rough: 0.3, metal: 0.2 },
    hazard: { c: [w.hazard], rough: 0.2, metal: 0.3, env: 1 }, hazardTip: { c: [w.hazardTip, w.hazardTip], rough: 0.25, emis: w.hazardTip, emisK: 0.35 },
    saw: { c: ['#4a5262', '#f2f6fa'], rough: 0.22, metal: 0.55, env: 1.2 }, hub: { c: [w.hub], rough: 0.25 },
    ring: { c: ['#ffc93c', '#fff3b0'], rough: 0.2, metal: 0.5, env: 1.2, emis: '#ffb300', emisK: 0.15 },
    boost: { c: [w.accent ?? '#ff5fa8', '#ffffff'], rough: 0.25, env: 1, emis: w.accent ?? '#ff5fa8', emisK: 0.3 },
    coin: { c: ['#ffc93c', '#fff0a0'], rough: 0.2, metal: 0.6, env: 1.3 },
    flyBody: { c: ['#3b3a58', '#6a6890'], rough: 0.3 }, eye: { c: ['#ffffff'], rough: 0.08, env: 1 }, pupil: { c: ['#14131c'], rough: 0.06, env: 1 },
    wing: { basic: '#dff6ff', opacity: 0.6 }, cloud: { c: [w.cloud, '#d9ecff'], rough: 0.7, rim: 0 },
    trunk: { c: [w.trunk ?? '#a0643a', '#6e3f22'], rough: 0.5 }, crown: { c: [w.crown ?? '#2fbf62', w.crown2 ?? '#9cf07e'], rough: 0.55 },
    accent: { c: [w.accent], rough: 0.3 }, stick: { c: [w.stick ?? '#ffffff'], rough: 0.3 },
    candyDisc: { c: [w.candy ?? '#ff5fa8', '#ffffff', w.candy2 ?? '#fff'], rough: 0.15, env: 0.9 }, candyDome: { c: [w.dome ?? '#7be0ff', w.dome2 ?? '#fff', '#fff', '#ffffff'], rough: 0.2, env: 0.8 },
    building: { c: [w.building ?? '#2a1f4a', w.building2 ?? '#ff2bd6'], rough: 0.45 },
    neon: { c: [w.neon ?? '#ff2bd6'], emis: w.neon ?? '#ff2bd6', emisK: 1.2, rough: 0.3 }, neon2: { c: [w.neon2 ?? '#00f0ff'], emis: w.neon2 ?? '#00f0ff', emisK: 1.3, rough: 0.3 },
    rock: { c: [w.rock ?? '#4a2c26', w.rock2 ?? '#7a4a3a', w.lava ?? '#ff6a1a'], rough: 0.6, glowAcc: 1.6 },
    ice: { c: [w.ice ?? '#7fe0ff', w.ice2 ?? '#ffffff', w.ice3 ?? '#ffffff'], rough: 0.08, env: 1.3, emis: w.ice ?? '#7fe0ff', emisK: 0.2 },
    window: { c: ['#3a2c10'], emis: w.window ?? '#ffe36b', emisK: 0.9, rough: 0.3 },
    // 霓虹窗戶分三組（同色、不同材質；底色壓暗，亮度幾乎全來自自發光，閃的幅度才不會被光照飽和吃掉）：scene.js 照音樂拍子輪流閃，只動這三個材質的自發光
    window2: { c: ['#3a2c10'], emis: w.window ?? '#ffe36b', emisK: 0.9, rough: 0.3 },
    window3: { c: ['#3a2c10'], emis: w.window ?? '#ffe36b', emisK: 0.9, rough: 0.3 },
  };
}

// ------------------------------------------------------------------ materials
let envTex = null;
export function initEnv(renderer) { if (!envTex) envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; return envTex; }

const cache = new Map();
function material(name, spec, hasMask, quality) {
  const key = `${name}|${JSON.stringify(spec)}|${hasMask}|${quality}`;
  if (cache.has(key)) return cache.get(key);
  let m;
  if (!spec) spec = { c: ['#ff00ff'] };   // unknown name -> magenta so it is obvious
  if (spec.basic) m = new THREE.MeshBasicMaterial({ color: spec.basic, transparent: spec.opacity != null, opacity: spec.opacity ?? 1, depthWrite: spec.opacity == null });
  else {
    const c = spec.c, glass = spec.glass, opacity = spec.opacity ?? (glass ? 0.72 : 1);
    if (quality === 'high') m = new THREE.MeshStandardMaterial({ roughness: spec.rough ?? 0.35, metalness: spec.metal ?? 0, envMap: envTex, envMapIntensity: spec.env ?? 0.55 });
    else m = new THREE.MeshLambertMaterial({ emissive: new THREE.Color(c[0]).multiplyScalar(0.12) });
    m.vertexColors = hasMask;
    if (glass || opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = opacity > 0.5; }
    if (spec.emis) m.emissive = new THREE.Color(spec.emis).multiplyScalar(spec.emisK ?? 1);
    const u = {
      uBase: { value: new THREE.Color(c[0]) }, uSec: { value: new THREE.Color(c[1] ?? c[0]) }, uAcc: { value: new THREE.Color(c[2] ?? c[0]) },
      uPat: { value: new THREE.Color(c[3] ?? c[0]) }, uPatK: { value: c[3] ? 1 : 0 },
      uRim: { value: new THREE.Color('#fffbe8').multiplyScalar(spec.rim ?? (quality === 'high' ? 0.5 : 0.3)) }, uGlow: { value: spec.glowAcc ?? 0 },
    };
    m.userData.uniforms = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = 'uniform vec3 uBase, uSec, uAcc, uPat, uRim; uniform float uPatK, uGlow;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', hasMask
          ? 'vec3 mk = vColor.rgb; diffuseColor.rgb = mix(mix(mix(uBase, uSec, mk.r), uPat, mk.b * uPatK), uAcc, mk.g);'
          : 'diffuseColor.rgb = uBase;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uRim * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);'
          + (hasMask ? '\n totalEmissiveRadiance += uAcc * vColor.g * uGlow;' : ''));
    };
    m.customProgramCacheKey = () => `kit|${hasMask}`;
  }
  m.name = name;
  cache.set(key, m);
  return m;
}

/** hook-hero 整合加的：單色軟膠材質（藤蔓、木樁、旗桿、水面以外的小零件用），與模型材質同一套 shader／快取。 */
export function softMaterial(color, quality = 'high', o = {}) {
  return material('soft', { c: [color], rough: o.rough ?? 0.4, metal: o.metal ?? 0, env: o.env, rim: o.rim, emis: o.emis, emisK: o.emisK, opacity: o.opacity }, false, quality);
}

// ------------------------------------------------------------------ loading / dressing
export async function loadModels(base = '../models/', names = MODELS) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out = {};
  await Promise.all(names.map(async (n) => { out[n] = (await loader.loadAsync(`${base}${n}.glb`)).scene.children[0]; }));
  return out;
}

function dressTree(obj, pal, quality) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material.name;
    o.material = material(name, pal[name], !!o.geometry.attributes.color, quality);
    o.castShadow = name !== 'wing' && name !== 'glass';
    o.receiveShadow = true;
  });
  return obj;
}

/** Character: clone + skin palette + accessories (attached in model space). mouth_open hidden by default. */
export function dressCharacter(models, skinId, quality = 'high') {
  const sk = SKINS[skinId], pal = skinPalette(sk);
  const obj = dressTree(models[sk.model].clone(true), pal, quality);
  for (const a of sk.acc ?? []) obj.add(dressTree(models[a].clone(true), pal, quality));
  const mo = obj.getObjectByName('mouth_open'); if (mo) mo.visible = false;
  return obj;
}

/** World prop / background piece: clone + world palette. */
export function dressProp(models, name, worldIndex, quality = 'high') {
  return dressTree(models[name].clone(true), worldPalette(WORLD_PAL[worldIndex]), quality);
}

export const BG_SETS = [['bg-jungle-a', 'bg-jungle-b'], ['bg-candy-a', 'bg-candy-b'], ['bg-city-a', 'bg-city-b'], ['bg-volcano-a', 'bg-volcano-b'], ['bg-frost-a', 'bg-frost-b', 'bg-frost-c'], ['bg-dunes-a', 'bg-dunes-b', 'bg-dunes-c']];

/** For InstancedMesh: every mesh of a dressed object with its matrix relative to the object's root
 *  (includes meshopt dequantization scale/offset on the mesh node — never assume mesh.matrix is identity).
 *  usage: for (const p of parts(dressProp(models, 'prop-hook', w))) { const im = new THREE.InstancedMesh(p.geometry, p.material, n); ... setMatrixAt(i, inst.multiply(p.matrix)) } */
export function parts(obj) {
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), out = [];
  obj.traverse((o) => { if (o.isMesh) out.push({ name: o.name, node: o.parent?.name, geometry: o.geometry, material: o.material, matrix: inv.clone().multiply(o.matrixWorld) }); });
  return out;
}

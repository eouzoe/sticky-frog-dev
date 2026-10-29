// 美術素材（hook-hero-art 的 GLB，打包成 .pack，見 src/packs-table.js 與 vite.config.js）：核心包開機載，造型與世界背景用到才載。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SKINS as ART_SKINS, dressProp } from './artkit.js';
import { PACKS, packUrl } from './packs-table.js';

export const ART = { models: {}, q: 'high' }; // q：'high'＝A 軟膠（Standard＋環境反光＋邊緣光）、'low'＝C（Lambert＋邊緣光）；models 是已載入的 GLB 範本

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const loading = new Map(); // 包名 → Promise（同一個包只下載一次）
const done = new Set();
const packOf = {}; for (const [k, list] of Object.entries(PACKS)) for (const n of list) packOf[n] = k;

async function fetchPack(name, onProg) {
  const res = await fetch(packUrl(name));
  if (!res.ok) throw new Error(`model pack ${name}: HTTP ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (onProg && total && res.body) { // 串流讀，才有進度可報
    const rd = res.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done: d, value } = await rd.read(); if (d) break; chunks.push(value); got += value.length; onProg(Math.min(1, got / total)); }
    buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
    buf = buf.buffer;
  } else buf = await res.arrayBuffer();
  const hl = new DataView(buf).getUint32(0, true);
  const list = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  let off = 4 + hl;
  await Promise.all(list.map(async ([n, len]) => {
    const part = buf.slice(off, off + len); off += len; // off 在 map 同步段就走完了，每個 part 各自拿到自己的位置
    ART.models[n] = (await loader.parseAsync(part, '')).scene.children[0];
  }));
  done.add(name);
}
// 載一個包（已載或載入中就回同一個 Promise）；失敗時下次可重試
export function loadPack(name, onProg) {
  if (!PACKS[name]) return Promise.resolve();
  if (!loading.has(name)) loading.set(name, fetchPack(name, onProg).catch((e) => { loading.delete(name); throw e; }));
  return loading.get(name);
}
export const packReady = (k) => !PACKS[k] || done.has(k);
export const worldPack = (w) => `world-${w}`;
export const worldReady = (w) => !PACKS[worldPack(w)] || done.has(worldPack(w));
export const ensureWorld = (w, onProg) => loadPack(worldPack(w), onProg);
const skinPacks = (id) => { const sk = ART_SKINS[id] ?? ART_SKINS.tree; return [...new Set([sk.model, ...(sk.acc ?? [])].map((n) => packOf[n]).filter(Boolean))]; };
export const skinReady = (id) => skinPacks(id).every((k) => done.has(k));
export const ensureSkin = (id, onProg) => Promise.all(skinPacks(id).map((k) => loadPack(k, onProg)));

const inv = new THREE.Matrix4(), tmp = new THREE.Matrix4();
// 把一個 dressed 物件拆成「主體」與「要分開動的子節點」（例如風扇的 blades、蒼蠅的 wing_L）。
// 每個 part 的 matrix 都含 meshopt 反量化縮放，絕對不能當成單位矩陣。
export function splitProp(name, w, subs = []) {
  // 模型包還沒載（例如這一關沒有鋸片，所以沒載 props 包）：回空殼，數量是 0 的 PartSet 不會畫任何東西
  if (!ART.models[name]) return { main: [], sub: Object.fromEntries(subs.map((s) => [s, { node: new THREE.Matrix4(), parts: [] }])), obj: new THREE.Group() };
  const obj = dressProp(ART.models, name, w, ART.q);
  obj.updateMatrixWorld(true);
  inv.copy(obj.matrixWorld).invert();
  const out = { main: [], sub: {} };
  for (const s of subs) {
    const n = obj.getObjectByName(s);
    out.sub[s] = { node: inv.clone().multiply(n.matrixWorld), parts: [] };
  }
  obj.traverse((o) => {
    if (!o.isMesh) return;
    let a = o.parent, key = null;
    while (a && a !== obj) { if (subs.includes(a.name)) { key = a.name; break; } a = a.parent; }
    if (key) { const n = obj.getObjectByName(key); out.sub[key].parts.push({ geometry: o.geometry, material: o.material, matrix: n.matrixWorld.clone().invert().multiply(o.matrixWorld), cast: o.castShadow }); }
    else out.main.push({ geometry: o.geometry, material: o.material, matrix: inv.clone().multiply(o.matrixWorld), cast: o.castShadow });
  });
  out.obj = obj;
  return out;
}

// 一組 part 對應一組 InstancedMesh：set(i, 實例矩陣) 會自動乘上每個 part 的矩陣
export class PartSet {
  constructor(group, parts, n, { shadow = true, receive = true } = {}) {
    this.meshes = parts.map((p) => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, Math.max(1, n));
      m.count = n; m.visible = n > 0; m.castShadow = shadow && p.cast; m.receiveShadow = receive; m.frustumCulled = false;
      m.userData.pm = p.matrix; group.add(m); return m;
    });
    this.n = n;
  }
  set(i, mat) { for (const m of this.meshes) { tmp.multiplyMatrices(mat, m.userData.pm); m.setMatrixAt(i, tmp); } }
  commit() { if (this.n) for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; }
  dispose(group) { for (const m of this.meshes) { group.remove(m); m.dispose(); } this.meshes = []; }
}

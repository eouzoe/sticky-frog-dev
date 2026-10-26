// 美術素材（hook-hero-art 的 GLB）：開機載入一次、目前畫質、把一個道具拆成 InstancedMesh 組。
import * as THREE from 'three';
import { initEnv, loadModels, dressProp } from './artkit.js';

export const ART = { models: null, q: 'high' }; // q：'high'＝A 軟膠（Standard＋環境反光＋邊緣光）、'low'＝C（Lambert＋邊緣光）

export async function loadArt(renderer) {
  initEnv(renderer);
  ART.models = await loadModels('./models/');
}

const inv = new THREE.Matrix4(), tmp = new THREE.Matrix4();
// 把一個 dressed 物件拆成「主體」與「要分開動的子節點」（例如風扇的 blades、蒼蠅的 wing_L）。
// 每個 part 的 matrix 都含 meshopt 反量化縮放，絕對不能當成單位矩陣。
export function splitProp(name, w, subs = []) {
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

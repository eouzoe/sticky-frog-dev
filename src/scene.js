// 渲染器、鏡頭、燈光、天空、水面、背景視差、輕量後製（受擊色差脈衝）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TUNE as T } from './config.js';

const lam = (o) => new THREE.MeshLambertMaterial({ flatShading: true, ...o });

// 幾何加上頂點色（拼裝 low-poly 道具用）
export function tint(geo, color, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const j = 1 + (Math.random() - 0.5) * jitter;
    for (let k = 0; k < 3; k++) { arr[(i + k) * 3] = c.r * j; arr[(i + k) * 3 + 1] = c.g * j; arr[(i + k) * 3 + 2] = c.b * j; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
const at = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
};

function propGeo(kind) {
  if (kind === 'jungle') return [
    mergeGeometries([tint(at(new THREE.CylinderGeometry(0.45, 0.8, 12, 6), 0, 6, 0), '#7a4a26', 0.2), tint(at(new THREE.IcosahedronGeometry(3.6, 0), 0, 12.5, 0, 0, 0, 0, 1, 0.8, 1), '#27ae60', 0.25), tint(at(new THREE.IcosahedronGeometry(2.6, 0), 1.8, 14.6, 0.5), '#2ecc71', 0.25), tint(at(new THREE.IcosahedronGeometry(2.2, 0), -2, 13.8, -0.5), '#1e8f4e', 0.25)]),
    mergeGeometries([tint(at(new THREE.IcosahedronGeometry(2, 0), 0, 0.8, 0, 0, 0, 0, 1.4, 0.8, 1), '#2f9e5a', 0.3), tint(at(new THREE.ConeGeometry(0.25, 1, 4), 0.6, 2.3, 0.6), '#ff6fb5'), tint(at(new THREE.IcosahedronGeometry(0.4, 0), 0.6, 2.9, 0.6), '#ff6fb5')]),
  ];
  if (kind === 'candy') {
    const disc = tint(at(new THREE.CylinderGeometry(3, 3, 0.7, 12), 0, 11, 0, Math.PI / 2), '#ff6fb5', 0);
    const col = disc.attributes.color; for (let i = 0; i < col.count; i += 6) for (let k = 0; k < 3 && i + k < col.count; k++) col.setXYZ(i + k, 1, 1, 1);
    return [
      mergeGeometries([tint(at(new THREE.CylinderGeometry(0.25, 0.25, 11, 6), 0, 5.5, 0), '#ffffff', 0.05), disc]),
      mergeGeometries([tint(at(new THREE.CylinderGeometry(1.4, 2.4, 2.6, 8), 0, 1.3, 0), '#7be0ff', 0.2), tint(at(new THREE.IcosahedronGeometry(0.5, 0), 0, 2.8, 0), '#ff3b6b')]),
    ];
  }
  if (kind === 'city') return [
    mergeGeometries([tint(at(new THREE.BoxGeometry(5, 18, 5), 0, 9, 0), '#2a1a50', 0.2), tint(at(new THREE.BoxGeometry(5.2, 0.4, 5.2), 0, 18, 0), '#ff2bd6'), tint(at(new THREE.BoxGeometry(0.15, 3, 0.15), 1.5, 19.5, 0), '#00f0ff')]),
    mergeGeometries([tint(at(new THREE.BoxGeometry(4, 9, 4), 0, 4.5, 0), '#3d2470', 0.2), tint(at(new THREE.BoxGeometry(4.2, 0.3, 4.2), 0, 9, 0), '#00f0ff')]),
  ];
  return [
    mergeGeometries([tint(at(new THREE.ConeGeometry(2.4, 12, 5), 0, 6, 0), '#3b2420', 0.35), tint(at(new THREE.ConeGeometry(0.8, 3, 5), 0.6, 10.5, 0.5), '#ff7a1f')]),
    mergeGeometries([tint(at(new THREE.DodecahedronGeometry(2, 0), 0, 1, 0, 0, 0, 0, 1.3, 0.8, 1), '#4a2c26', 0.35)]),
  ];
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(T.CAM_FOV, 16 / 9, 0.5, 260);
  camera.position.set(0, 8, T.CAM_DIST);

  const hemi = new THREE.HemisphereLight('#ffffff', '#4a8f5a', 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 50 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // 天空漸層
  const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
  const skyTex = new THREE.CanvasTexture(skyCv); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog('#d6f2d8', 45, 150);

  // 水面（CPU 頂點波浪，flatShading 不必重算法線）
  const waterGeo = new THREE.PlaneGeometry(170, 46, 56, 12); waterGeo.rotateX(-Math.PI / 2);
  const waterBase = Float32Array.from(waterGeo.attributes.position.array);
  const waterMat = lam({ color: '#2ec4c4', transparent: true, opacity: 0.93 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.z = -14; water.receiveShadow = true; scene.add(water);

  // 背景視差層
  const bg = new THREE.Group(); scene.add(bg);
  const propMat = lam({ vertexColors: true });
  const hillGeo = new THREE.IcosahedronGeometry(1, 1);
  const hillMat = lam({ color: '#ffffff' });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 0);
  const cloudMat = lam({ color: '#ffffff', emissive: '#bbbbbb' });
  let bgMeshes = [];
  const dummy = new THREE.Object3D();

  function setTheme(w, length) {
    const g = skyCv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, w.sky[0]); gr.addColorStop(1, w.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
    scene.fog.color.set(w.fog);
    hemi.color.set(w.hemi[0]); hemi.groundColor.set(w.hemi[1]);
    waterMat.color.set(w.water); waterMat.emissive.set(w.waterEm);
    for (const m of bgMeshes) { bg.remove(m); m.dispose(); }
    bgMeshes = [];
    const rnd = mulberry(w.name.length * 31 + Math.round(length));
    const span = length + 140;
    const [geoA, geoB] = propGeo(w.props);
    const nA = Math.ceil(span / 7), nB = Math.ceil(span / 9), nH = Math.ceil(span / 20), nC = Math.ceil(span / 16);
    const A = new THREE.InstancedMesh(geoA, propMat, nA), B = new THREE.InstancedMesh(geoB, propMat, nB);
    const H = new THREE.InstancedMesh(hillGeo, hillMat, nH);
    for (let i = 0; i < nA; i++) {
      const s = 0.8 + rnd() * 0.7;
      dummy.position.set(-50 + (i / nA) * span + rnd() * 4, 0, -22 - rnd() * 26); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(s, s * (0.8 + rnd() * 0.5), s);
      dummy.updateMatrix(); A.setMatrixAt(i, dummy.matrix);
    }
    for (let i = 0; i < nB; i++) {
      const s = 0.6 + rnd() * 0.6;
      dummy.position.set(-50 + (i / nB) * span + rnd() * 5, -0.2, -9 - rnd() * 8); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(s, s, s);
      dummy.updateMatrix(); B.setMatrixAt(i, dummy.matrix);
    }
    const hc = [new THREE.Color(w.bgHill), new THREE.Color(w.bgHill2)];
    for (let i = 0; i < nH; i++) {
      dummy.position.set(-60 + (i / nH) * (span + 40) + rnd() * 8, -2, -80 - rnd() * 20); dummy.rotation.set(0, rnd() * 3, 0);
      dummy.scale.set(16 + rnd() * 14, 9 + rnd() * 12, 8); dummy.updateMatrix(); H.setMatrixAt(i, dummy.matrix); H.setColorAt(i, hc[i % 2]);
    }
    bgMeshes.push(A, B, H);
    if (w.props === 'jungle' || w.props === 'candy') {
      const C = new THREE.InstancedMesh(cloudGeo, cloudMat, nC);
      for (let i = 0; i < nC; i++) {
        dummy.position.set(-50 + (i / nC) * span + rnd() * 8, 24 + rnd() * 10, -45 - rnd() * 15); dummy.rotation.set(rnd(), rnd(), rnd());
        dummy.scale.set(4 + rnd() * 4, 1.6 + rnd(), 2.5); dummy.updateMatrix(); C.setMatrixAt(i, dummy.matrix);
      }
      bgMeshes.push(C);
    }
    for (const m of bgMeshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; bg.add(m); }
  }

  // 後製：只有色差脈衝時才多一個 pass（平常 0 成本），低畫質時關掉
  let rt = null;
  const post = { amount: 0, enabled: true };
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, amount: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
      void main(){ vec2 d = (vUv - 0.5) * amount;
        float r = texture2D(tDiffuse, vUv + d).r, g = texture2D(tDiffuse, vUv).g, b = texture2D(tDiffuse, vUv - d).b;
        gl_FragColor = vec4(r, g, b, 1.0); }`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (rt) { rt.dispose(); rt = null; }
  }
  addEventListener('resize', resize); resize();

  function setQuality(high) {
    renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : 1);
    renderer.shadowMap.enabled = high; sun.castShadow = high;
    post.enabled = high; resize();
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  function update(t, focusX, focusY) {
    // 水面波浪
    water.position.x = Math.round(focusX / 3) * 3;
    const p = waterGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const wx = waterBase[i] + water.position.x, wz = waterBase[i + 2];
      p[i + 1] = Math.sin(wx * 0.45 + t * 1.8) * 0.18 + Math.sin(wz * 0.6 + wx * 0.2 + t * 1.3) * 0.14;
    }
    waterGeo.attributes.position.needsUpdate = true;
    sun.position.set(focusX + 6, focusY + 16, 12); sun.target.position.set(focusX, focusY, 0);
    bg.position.x = 0;
  }

  function render() {
    renderer.info.reset();
    if (post.enabled && post.amount > 0.0015) {
      if (!rt) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); rt = new THREE.WebGLRenderTarget(s.x, s.y, { samples: 2 }); }
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
      postMat.uniforms.tDiffuse.value = rt.texture; postMat.uniforms.amount.value = post.amount;
      renderer.render(postScene, postCam);
    } else renderer.render(scene, camera);
  }

  const v3 = new THREE.Vector3();
  function project(x, y, z = 0) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight };
  }

  return { renderer, scene, camera, setTheme, update, render, project, post, setQuality, info: renderer.info };
}

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

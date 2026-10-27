// 渲染器、鏡頭、燈光、天空、水面、背景視差、輕量後製（受擊色差脈衝）。
import * as THREE from 'three';
import { TUNE as T } from './config.js';
import { BG_SETS, initEnv } from './artkit.js';
import { ART, splitProp, PartSet } from './art.js';

const WI = { jungle: 0, candy: 1, city: 2, volcano: 3, frost: 4 };

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
  scene.fog = new THREE.Fog('#d6f2d8', 30, 125);

  // 水面（CPU 頂點波浪＋平滑法線；亮面、帶一點環境反光，像果凍糖漿）
  const waterGeo = new THREE.PlaneGeometry(170, 92, 64, 18); waterGeo.rotateX(-Math.PI / 2);
  const waterBase = Float32Array.from(waterGeo.attributes.position.array);
  const waterHi = new THREE.MeshStandardMaterial({ color: '#2ec4c4', roughness: 0.16, envMap: initEnv(renderer), envMapIntensity: 0.35, transparent: true, opacity: 0.94 });
  const waterLo = new THREE.MeshLambertMaterial({ color: '#2ec4c4', transparent: true, opacity: 0.94 });
  let waterMat = waterHi;
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.z = -6; water.receiveShadow = true; scene.add(water);

  // 岩漿冒泡（火山，純視覺）：軟膠泡泡從岩漿面鼓起來、啵一聲破掉。位置掛在世界座標上、超出鏡頭才換位置，所以不會跟著鏡頭滑
  const BUB_N = 34, BUB_SPAN = 90;
  const bubMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshLambertMaterial({ color: '#ffc861', emissive: '#ff7a1a' }), BUB_N);
  bubMesh.frustumCulled = false; bubMesh.visible = false; scene.add(bubMesh);
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const bubDummy = new THREE.Object3D();
  function updateBubbles(t, focusX) {
    for (let i = 0; i < BUB_N; i++) {
      const per = 1.7 + hash(i, 1) * 1.8, tt = t + hash(i, 2) * per, cyc = Math.floor(tt / per), u = (tt / per) - cyc;
      const bx = hash(i, 10 + cyc) * BUB_SPAN, x = focusX + ((((bx - focusX) % BUB_SPAN) + BUB_SPAN * 1.5) % BUB_SPAN) - BUB_SPAN / 2;
      const r = 0.35 + hash(i, 20 + cyc) * 0.55, z = -2.5 - hash(i, 30 + cyc) * 10;
      const grow = u < 0.78 ? 1 - Math.pow(1 - u / 0.78, 3) : 1;
      const pop = u < 0.78 ? 1 : (u < 0.86 ? 1 + (u - 0.78) / 0.08 * 0.35 : Math.max(0, 1.35 * (1 - (u - 0.86) / 0.06)));
      const k = r * grow * pop, wob = 1 + Math.sin(t * 7 + i) * 0.06 * grow;
      bubDummy.position.set(x, -0.05 + k * 0.3, z); bubDummy.scale.set(k * wob, k * 0.82 / wob, k); bubDummy.updateMatrix();
      bubMesh.setMatrixAt(i, bubDummy.matrix);
    }
    bubMesh.instanceMatrix.needsUpdate = true;
  }

  // 霓虹窗戶（純視覺）：三組同色材質照音樂拍子輪流亮一下，每個四分音符換下一組，小節頭整片微亮。只動這三個材質的自發光，鉤點與危險物是別的材質
  let winMats = [];
  function updateWindows(beat) {
    const b = Math.floor(beat), f = beat - b, hit = 1 - f;
    winMats.forEach((m, g) => {
      const k = 0.45 + (b % 3 === g ? 1.1 * hit * hit : 0) + (b % 4 === 0 ? 0.35 * hit * hit : 0);
      m.emissive.copy(m.userData.eBase).multiplyScalar(k);
    });
  }

  // 冰峰極光帶（純視覺）：遠處一張半透明的簾幕，三色漸層＋慢慢飄的亮暗條紋；整張跟著鏡頭走一點點（視差）
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uX: { value: 0 }, c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT, uX; uniform vec3 c0, c1, c2; varying vec2 vUv;
      void main(){
        float x = vUv.x * 28.0 + uX;
        float v = vUv.y + sin(x * 0.9 + uT * 0.35) * 0.1 + sin(x * 0.37 - uT * 0.22) * 0.12;
        float band = smoothstep(0.0, 0.3, v) * pow(clamp(1.0 - v, 0.0, 1.0), 1.6);
        float rays = 0.65 + 0.35 * sin(x * 7.0 + sin(x * 1.3 + uT * 0.5) * 2.0);
        float drift = 0.6 + 0.4 * sin(x * 0.5 + uT * 0.18);
        vec3 col = v < 0.5 ? mix(c0, c1, v * 2.0) : mix(c1, c2, (v - 0.5) * 2.0);
        gl_FragColor = vec4(col, band * rays * drift * 1.2);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(440, 46, 1, 1), auroraMat);
  aurora.position.set(0, 50, -118); aurora.visible = false; aurora.frustumCulled = false; scene.add(aurora);

  // 冰面浮冰（冰峰）：低多邊形的扁柱，白到淺藍，漂在水上（純視覺）
  const floeGeo = new THREE.CylinderGeometry(1, 1.12, 0.42, 7, 1);
  { const pa = floeGeo.attributes.position, jr = mulberry(7);
    for (let i = 0; i < pa.count; i++) { const k = 0.84 + jr() * 0.3; pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); }
    floeGeo.computeVertexNormals(); }
  const floeHi = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, envMap: initEnv(renderer), envMapIntensity: 0.5 }), floeLo = new THREE.MeshLambertMaterial({ color: '#ffffff' });

  // 背景視差層
  const bg = new THREE.Group(); scene.add(bg);
  const hillGeo = new THREE.SphereGeometry(1, 40, 20);
  const hillHi = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }), hillLo = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  let bgMeshes = [], bgSets = [];
  const dummy = new THREE.Object3D();

  function setTheme(w, length) {
    const g = skyCv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, w.sky[0]); gr.addColorStop(1, w.sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256); skyTex.needsUpdate = true;
    scene.fog.color.set(w.fog);
    hemi.color.set(w.hemi[0]); hemi.groundColor.set(w.hemi[1]);
    waterMat = ART.q === 'high' ? waterHi : waterLo; water.material = waterMat;
    for (const m of [waterHi, waterLo]) { m.color.set(w.water); m.emissive.set(w.waterEm); }
    for (const m of bgMeshes) { bg.remove(m); m.dispose(); }
    for (const p of bgSets) p.dispose(bg);
    bgMeshes = []; bgSets = [];
    const wi = WI[w.props] ?? 0;
    const rnd = mulberry(w.name.length * 31 + Math.round(length));
    const span = length + 140;
    const [nameA, nameB] = BG_SETS[wi];
    const nA = Math.ceil(span / 7), nB = Math.ceil(span / 9), nH = Math.ceil(span / 20), nC = Math.ceil(span / 16), nP = Math.ceil(span / 8);
    // 背景件不投影（陰影圖只照鏡頭附近 22 單位，背景投影只是多畫一次）
    const A = new PartSet(bg, splitProp(nameA, wi).main, nA, { shadow: false, receive: false });
    const B = new PartSet(bg, splitProp(nameB, wi).main, nB, { shadow: false, receive: false });
    bgSets.push(A, B);
    winMats = wi === 2 ? A.meshes.map((m) => m.material).filter((m) => /^window/.test(m.name)) : [];
    for (const m of winMats) m.userData.eBase ??= m.emissive.clone();
    bubMesh.visible = wi === 3;
    aurora.visible = wi === 4;
    if (wi === 4) { const ac = w.aurora; auroraMat.uniforms.c0.value.set(ac[0]); auroraMat.uniforms.c1.value.set(ac[1]); auroraMat.uniforms.c2.value.set(ac[2]); }
    for (let i = 0; i < nA; i++) {
      const s = 0.8 + rnd() * 0.7;
      // 大樓、火山又高又暗：往後推，角色前面不要壓一大塊深色
      dummy.position.set(-50 + (i / nA) * span + rnd() * 4, 0, (wi >= 2 ? -30 : -22) - rnd() * 26); dummy.rotation.set(0, wi === 1 ? (rnd() - 0.5) * 0.6 : rnd() * 6, 0); dummy.scale.set(s, s * (0.8 + rnd() * 0.5), s);
      dummy.updateMatrix(); A.set(i, dummy.matrix);
    }
    for (let i = 0; i < nB; i++) {
      const s = 0.6 + rnd() * 0.6;
      dummy.position.set(-50 + (i / nB) * span + rnd() * 5, -0.2, -9 - rnd() * 8); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(s, s, s);
      dummy.updateMatrix(); B.set(i, dummy.matrix);
    }
    if (wi <= 1) { // 叢林、糖果：水上漂著小荷葉
      const Pd = new PartSet(bg, splitProp('prop-pad', wi).main, nP, { shadow: false, receive: true }); bgSets.push(Pd);
      for (let i = 0; i < nP; i++) {
        dummy.position.set(-46 + (i / nP) * span + rnd() * 4, 0.06, -3.5 - rnd() * 9); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.setScalar(1.1 + rnd() * 1.1);
        dummy.updateMatrix(); Pd.set(i, dummy.matrix);
      }
    }
    if (wi === 4) {
      // 冰峰：浮冰（水面）＋積雪的松樹（中景）。亂數接在其他件之後抽，不影響前四個世界的排法
      const nF = Math.ceil(span / 7), nT = Math.ceil(span / 11);
      const F = new THREE.InstancedMesh(floeGeo, ART.q === 'high' ? floeHi : floeLo, nF);
      const fc = [new THREE.Color('#ffffff'), new THREE.Color('#d8f2ff'), new THREE.Color('#bfe8f8')];
      for (let i = 0; i < nF; i++) {
        dummy.position.set(-46 + (i / nF) * span + rnd() * 5, 0.04, -3.2 - rnd() * 11); dummy.rotation.set((rnd() - 0.5) * 0.12, rnd() * 6, (rnd() - 0.5) * 0.12);
        const fs = 1.0 + rnd() * rnd() * 3.2; dummy.scale.set(fs, 1, fs * (0.7 + rnd() * 0.5)); dummy.updateMatrix(); F.setMatrixAt(i, dummy.matrix); F.setColorAt(i, fc[i % 3]);
      }
      bgMeshes.push(F);
      const Tr = new PartSet(bg, splitProp(BG_SETS[4][2], wi).main, nT, { shadow: false, receive: false }); bgSets.push(Tr);
      for (let i = 0; i < nT; i++) {
        const ts = 0.9 + rnd() * 0.9;
        dummy.position.set(-50 + (i / nT) * span + rnd() * 6, -0.3, -15 - rnd() * 13); dummy.rotation.set(0, rnd() * 6, 0); dummy.scale.set(ts, ts * (0.9 + rnd() * 0.4), ts);
        dummy.updateMatrix(); Tr.set(i, dummy.matrix);
      }
    }
    const H = new THREE.InstancedMesh(hillGeo, ART.q === 'high' ? hillHi : hillLo, nH);
    const hc = [new THREE.Color(w.bgHill), new THREE.Color(w.bgHill2)];
    for (let i = 0; i < nH; i++) {
      dummy.position.set(-60 + (i / nH) * (span + 40) + rnd() * 8, -2, -80 - rnd() * 20); dummy.rotation.set(0, rnd() * 3, 0);
      dummy.scale.set(16 + rnd() * 14, 9 + rnd() * 12, 8); dummy.updateMatrix(); H.setMatrixAt(i, dummy.matrix); H.setColorAt(i, hc[i % 2]);
    }
    bgMeshes.push(H);
    if (w.props === 'jungle' || w.props === 'candy') {
      const C = new PartSet(bg, splitProp('bg-cloud', wi).main, nC, { shadow: false, receive: false }); bgSets.push(C);
      for (let i = 0; i < nC; i++) {
        dummy.position.set(-50 + (i / nC) * span + rnd() * 8, 24 + rnd() * 10, -45 - rnd() * 15); dummy.rotation.set(0, rnd() * 0.6, 0);
        dummy.scale.set(3 + rnd() * 2.5, 2.2 + rnd(), 2); dummy.updateMatrix(); C.set(i, dummy.matrix);
      }
    }
    for (const p of bgSets) p.commit();
    for (const m of bgMeshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.frustumCulled = false; bg.add(m); }
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
    scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  }

  function update(t, focusX, focusY, beat = 0) {
    if (winMats.length) updateWindows(beat);
    if (bubMesh.visible) updateBubbles(t, focusX);
    if (aurora.visible) { auroraMat.uniforms.uT.value = t; auroraMat.uniforms.uX.value = focusX * 0.012; aurora.position.x = focusX * 0.94; }
    // 水面波浪
    water.position.x = Math.round(focusX / 3) * 3;
    const p = waterGeo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const wx = waterBase[i] + water.position.x, wz = waterBase[i + 2];
      p[i + 1] = Math.sin(wx * 0.45 + t * 1.8) * 0.18 + Math.sin(wz * 0.6 + wx * 0.2 + t * 1.3) * 0.14;
    }
    waterGeo.attributes.position.needsUpdate = true; waterGeo.computeVertexNormals();
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

  const v3 = new THREE.Vector3(), scr = { x: 0, y: 0 };
  function project(x, y, z = 0) {
    v3.set(x, y, z).project(camera);
    scr.x = (v3.x * 0.5 + 0.5) * innerWidth; scr.y = (-v3.y * 0.5 + 0.5) * innerHeight;
    return scr;
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

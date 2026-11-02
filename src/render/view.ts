// 畫面主體：精簡 WebGL2 渲染器（gl.ts）＋原版的透視鏡頭。遊戲平面的東西是 2D 精靈（從原版 3D 模型烘焙），每張有自己的深度 z，
// 用同一台鏡頭投影：越遠越小、越慢、越霧。
// 背景是幾條固定深度的捲軸層：載入世界時用烘焙零件合成一條可重複的長條（週期內的擺放用雜湊，內容跟逐件擺放一樣），
// 每幀每層只畫一個四邊形，霧化用頂點顏色、水線裁切用頂點 clip。天空是頂點色漸層，水面是平塗漸層加幾條捲動的高光帶。
// 整個畫面沒有任何全螢幕著色器，每幀背景約 10 個四邊形。
// 水線：每張圖在自己深度的水面高度以下逐像素裁掉，所以立在水裡、掉進水裡不用深度緩衝。
import { WORLDS } from '../config.ts';
import { createGL, rgba, NOCLIP, NOADD } from './gl.ts';
import type { Frame, GL, Tex } from './gl.ts';
import { loadAtlas, decodeAtlas, imageFrame, decode, rawFrame, measure } from './atlas.ts';
import { rippleStrip, starStrip, auroraStrip } from './paint.ts';
import { rgb, mix, lighten } from './palette.ts';
import catUrl from '../art/cat.webp';
import catSpinUrl from '../art/cat-spin.webp';
import catSpin from '../art/cat-spin.json';
import { loadCatStage } from './portraits.ts';

export interface Cam { x: number; y: number; d: number; fov: number; shakeX: number; shakeY: number }
const PITCH = -0.04, FOG_NEAR = 30, FOG_FAR = 125, WATER_EDGE = -52;
// 合成長條時的參考鏡頭（640 高、fov 50）：決定每個世界單位畫幾像素。背景偏軟沒關係（遠處本來就該失焦），記憶體才是重點：
// 六個世界各約 4–6 MB，加上世界圖集約 10 MB 常駐
const CAM_D_REF = 19, F_REF = 320 / Math.tan((50 * Math.PI) / 360);
const STRIP_W = 1536, STRIP_H = 384, PPU_MAX = 20;
const ADD = rgba(0, 1); // add.a=1＝加法混色（光暈、極光）
const hex = (c: string): number => { const [r, g, b] = rgb(c); return (r << 16) | (g << 8) | b; };

// 每個世界的天空／水面參數（太陽、星星、極光、水面種類、霓虹倒影色）
interface Sky { sun: [number, number, number, number]; sunCol: string; stars: number; aurora: boolean; waterKind: number; glow: string; groundY: number }
const SKY: readonly Sky[] = [
  { sun: [0.82, 0.1, 0.07, 1], sunCol: '#fff6d0', stars: 0, aurora: false, waterKind: 0, glow: '#ffffff', groundY: 0 },
  { sun: [0.2, 0.12, 0.08, 1], sunCol: '#fffaf0', stars: 0, aurora: false, waterKind: 0, glow: '#ffffff', groundY: 0 },
  { sun: [0.8, 0.16, 0.035, 2], sunCol: '#ffe9f6', stars: 0.9, aurora: false, waterKind: 1, glow: '#ff2bd6', groundY: 0 },
  { sun: [0.65, 0.5, 0.12, 1], sunCol: '#ff7a3a', stars: 0, aurora: false, waterKind: 2, glow: '#ffd040', groundY: 0 },
  { sun: [0, 0, 0, 0], sunCol: '#ffffff', stars: 0.25, aurora: true, waterKind: 4, glow: '#ffffff', groundY: 0 },
  { sun: [0.7, 0.42, 0.1, 2], sunCol: '#fff0b0', stars: 0, aurora: false, waterKind: 3, glow: '#d47a8a', groundY: 0 },
];
// 水面高光：[遠 z, 近 z, 週期（世界單位）, 透明度]。池塘是靜的：高光固定在世界座標上、不隨時間動，鏡頭移動時只照透視移位、不伸縮；
// 遠的密、近的疏，三段就有透視感
const WATER_ROWS: readonly [number, number, number, number][] = [[WATER_EDGE, -24, 6, 0.1], [-24, -8, 9, 0.15], [-8, 1e9, 14, 0.2]];

/** 背景件一層：keys＝烘焙圖（世界圖集裡的名字）、gap＝平均間距、z＝深度範圍、y＝底部高度、s＝縮放範圍（相對烘焙尺寸） */
interface Layer { keys: string[]; gap: number; z: [number, number]; y: [number, number]; s: [number, number]; sy?: [number, number]; seed: number; tint?: (h: number) => number }
function layersOf(wi: number): Layer[] {
  const L: Layer[] = [];
  const k3 = (p: string) => [`${p}_0`, `${p}_1`, `${p}_2`];
  // 遠山（球的上半，烘焙時已上山色；隔座稍暗一點，層次才分得開）
  L.push({ keys: ['hill'], gap: 20, z: [-80, -100], y: [-2, -2], s: [16 / 22, 30 / 22], sy: [9 / 15, 21 / 15], seed: 7, tint: (h) => (h < 0.5 ? 0xffffff : 0xe2e2e2) });
  if (wi <= 1) L.push({ keys: ['cloud0', 'cloud1'], gap: 16, z: [-45, -60], y: [24, 34], s: [3 / 3.6, 5.5 / 3.6], seed: 3 });
  L.push({ keys: k3('bg0'), gap: wi === 5 ? 12 : 7, z: wi >= 2 ? [-30, -56] : [-22, -48], y: [0, 0], s: [0.8, 1.5], sy: [0.8, 1.3], seed: 11 });
  if (wi === 4) L.push({ keys: k3('bg2'), gap: 26, z: [-24, -36], y: [-0.3, -0.3], s: [0.55, 1.05], seed: 19 });
  if (wi === 5) L.push({ keys: k3('bg2'), gap: 24, z: [-16, -30], y: [0, 0], s: [0.9, 1.6], seed: 23 });
  L.push({ keys: k3('bg1'), gap: 9, z: wi === 5 ? [-13, -21] : [-9, -17], y: [-0.2, -0.2], s: [0.6, 1.2], seed: 29 });
  if (wi <= 1) L.push({ keys: ['bgPad0', 'bgPad1'], gap: 8, z: [-3.5, -12.5], y: [0.06, 0.06], s: [1.1 / 1.4, 2.2 / 1.4], seed: 31 });
  if (wi === 4) L.push({ keys: ['floe0', 'floe1'], gap: 7, z: [-3.2, -14.2], y: [0.04, 0.04], s: [1 / 1.8, 4.2 / 1.8], seed: 37 });
  return L;
}
function hash(i: number, s: number): number { let h = Math.imul(i * 374761393 + s * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---- 一層合成成一條可重複的長條（載入世界時做一次；context 恢復時重做）
interface Strip { cv: HTMLCanvasElement; z: number; P: number; yTop: number; yBot: number }
type Raw = NonNullable<ReturnType<typeof rawFrame>>;
/** 一塊零件乘上單色（遠山隔座稍暗）：乘色會把透明處填滿，再用原圖的 alpha 裁回來 */
function tinted(bmp: ImageBitmap, r: Raw, tint: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  const g = c.getContext('2d')!;
  g.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${(tint >> 16) & 255},${(tint >> 8) & 255},${tint & 255})`; g.fillRect(0, 0, r.w, r.h);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}
function composeStrip(L: Layer, wi: number, bmp: ImageBitmap): Strip | null {
  const raws = L.keys.map((k) => rawFrame(`w${wi}.${k}`)).filter((r): r is Raw => !!r);
  if (!raws.length) return null;
  const z = (L.z[0] + L.z[1]) / 2;
  const syK = L.sy ? L.sy[1] / ((L.sy[0] + L.sy[1]) / 2) : 1, sMax = L.s[1] * Math.max(1, syK);
  let above = L.y[1] - L.y[0], below = 0;
  for (const r of raws) { above = Math.max(above, r.ay * r.u * sMax + (L.y[1] - L.y[0])); below = Math.max(below, (r.h - r.ay) * r.u * sMax); }
  const hU = above + below;
  let ppu = Math.min(PPU_MAX, Math.max(3, F_REF / (CAM_D_REF - z))); // 參考鏡頭下這一層每世界單位幾像素
  if (hU * ppu > STRIP_H) ppu = STRIP_H / hU;
  const n = Math.max(1, Math.min(10, Math.floor(STRIP_W / ppu / L.gap))), P = n * L.gap; // 週期：最多 10 件、gap 的整數倍、寬度不超過 STRIP_W（翻面與縮放的變化夠多，重複看不太出來）
  const cv = document.createElement('canvas'); cv.width = Math.ceil(P * ppu); cv.height = Math.ceil(hU * ppu);
  const g = cv.getContext('2d')!; g.imageSmoothingQuality = 'high';
  const base = above * ppu; // 基準線（y = L.y[0]）在畫布上的列
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, L.seed), r = raws[Math.floor(hash(i, L.seed + 1) * raws.length)];
    const x = (((i * L.gap + (hash(i, L.seed + 2) - 0.5) * L.gap * 0.8) % P) + P) % P;
    const y = (L.y[1] - L.y[0]) * hash(i, L.seed + 4);
    const s = L.s[0] + (L.s[1] - L.s[0]) * h1, flip = hash(i, L.seed + 5) < 0.5;
    const sy = L.sy ? (s * (L.sy[0] + (L.sy[1] - L.sy[0]) * hash(i, L.seed + 6))) / ((L.sy[0] + L.sy[1]) / 2) : s;
    const tint = L.tint ? L.tint(hash(i, L.seed + 8)) : 0xffffff;
    const kx = r.u * s * ppu, ky = r.u * sy * ppu, w = r.w * kx, h = r.h * ky, top = base - y * ppu - r.ay * ky;
    const src = tint === 0xffffff ? bmp : tinted(bmp, r, tint), sx = tint === 0xffffff ? r.x : 0, sy0 = tint === 0xffffff ? r.y : 0;
    for (const dx of [0, -P, P]) { // 跨過週期邊界的零件畫到另一頭
      const left = (x + dx) * ppu - w / 2; if (left + w < 0 || left > cv.width) continue;
      g.save(); g.translate(left, top); if (flip) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(src, sx, sy0, r.w, r.h, 0, 0, w, h); g.restore();
    }
  }
  return { cv, z, P, yTop: L.y[0] + above, yBot: L.y[0] - below };
}

export async function createView(canvas: HTMLCanvasElement, dprCap: number) {
  const tGL = performance.now();
  const R: GL = createGL(canvas);
  measure('view:createGL', tGL);
  const dprOf = () => Math.min(devicePixelRatio || 1, dprCap);
  // 開機要的：共用圖集（蒼蠅、金幣、翻轉圈）與小形狀圖集（粒子、光環、軌道，離線畫好的）。角色造型、貓照片、世界圖集都是用到才載
  const [shared, fxA] = await Promise.all([loadAtlas(R, 'shared'), loadAtlas(R, 'fx')]);
  shared.bitmap.close(); fxA.bitmap.close();
  const frames: Record<string, Frame> = { ...shared.frames, ...fxA.frames };
  const tStrips = performance.now();
  const rippleTex = R.texture(rippleStrip(), { repeat: 'xy', mip: true }), starTex = R.texture(starStrip(), { repeat: 'xy' }), auroraTex = R.texture(auroraStrip(), { repeat: 'xy' });
  measure('view:strips', tStrips);
  const whiteF = frames.white, wu = (whiteF.u0 + whiteF.u1) / 2, wv = (whiteF.v0 + whiteF.v1) / 2; // 純色四邊形：取白色方塊的中心那一格

  // 角色造型：每個造型一張小圖集。skinBitmap＝只解碼（商店頭像用），ensureSkin＝解碼＋上傳（遊戲用）
  const skinBmp = new Map<string, Promise<ImageBitmap>>(), skinNow = new Map<string, ImageBitmap>(), skinGpu = new Map<string, Promise<void>>();
  function skinBitmap(id: string): Promise<ImageBitmap> {
    let p = skinBmp.get(id);
    if (!p) { p = decodeAtlas(`c_${id}`).then((b) => { skinNow.set(id, b); return b; }); skinBmp.set(id, p); }
    return p;
  }
  function ensureSkin(id: string): Promise<void> {
    let p = skinGpu.get(id);
    if (!p) { p = loadAtlas(R, `c_${id}`, skinBitmap(id)).then((a) => { Object.assign(frames, a.frames); dirty = true; }); skinGpu.set(id, p); }
    return p;
  }
  // 旋轉貓：站姿照片＋揣手手 9 個角度（tools/cat 從迷因綠幕範本做的），選了貓才下載
  // 站姿錨點在身體中心、高 2.5 世界單位（角色外觀倍率 1.72 之後）；旋轉格的錨點與高度照影片裡跟站姿的相對位置
  let catP: Promise<void> | null = null;
  // 質感跟選單一致（cat-stage.ts 的 catLook：描邊／調色，跟照片一起動態載）：處理完四周多一圈 p 的邊，錨點與高度跟著換算
  const ensureCat = () => (catP ??= Promise.all([decode(catUrl), decode(catSpinUrl), loadCatStage()]).then(([b, s, { catLook }]) => {
    const hU = 2.5 / 1.72, C = catSpin;
    const a = catLook(b, 0, 0, b.width, b.height, b.width, b.height);
    frames.c_photo = imageFrame(R, a.c, (a.p + 0.5 * b.width) / a.c.width, (a.p + 0.55 * b.height) / a.c.height, (hU * a.c.height) / b.height);
    const cells = Array.from({ length: C.n }, (_, i) => catLook(s, i * C.cw, 0, C.cw, C.ch, C.cw, C.ch));
    const p = cells[0].p, cw = cells[0].c.width, ch = cells[0].c.height, sheet = document.createElement('canvas');
    sheet.width = cw * C.n; sheet.height = ch;
    const g = sheet.getContext('2d')!; cells.forEach((x, i) => g.drawImage(x.c, i * cw, 0));
    const tex = R.texture(sheet, { mip: true });
    for (let i = 0; i < C.n; i++) frames[`c_spin${i}`] = { tex, u0: i / C.n, v0: 0, u1: (i + 1) / C.n, v1: 1, w: cw, h: ch, ax: p + C.ax * C.cw, ay: p + C.ay * C.ch, unit: (hU * C.h) / C.ch };
    dirty = true;
  }));

  // 世界圖集：用到才載；顯示記憶體只留目前的世界。載好時順便把背景層合成長條
  interface Band { tex: Tex; z: number; P: number; yTop: number; yBot: number }
  let bands: Band[] = [];
  function makeBands(wi: number, bmp: ImageBitmap): Band[] {
    const out: Band[] = [];
    for (const L of layersOf(wi)) {
      const t0 = performance.now();
      const s = composeStrip(L, wi, bmp); if (!s) continue;
      measure(`band:${L.keys[0]}:compose ${s.cv.width}x${s.cv.height}`, t0); const t1 = performance.now();
      // context 恢復：重新下載解碼圖集再合成一次（不把長條留在記憶體）
      const tex = R.texture(s.cv, { repeat: true, mip: true, restore: () => decodeAtlas(`w${wi}`).then((b) => { const r = composeStrip(L, wi, b); b.close(); return r!.cv; }) });
      measure(`band:${L.keys[0]}:upload`, t1);
      out.push({ tex, z: s.z, P: s.P, yTop: s.yTop, yBot: s.yBot });
    }
    return out;
  }
  const worlds = new Map<number, Promise<void>>(), loaded: number[] = [];
  function ensureWorld(wi: number): Promise<void> {
    let p = worlds.get(wi);
    if (!p) {
      p = loadAtlas(R, `w${wi}`).then((a) => {
        if (wi !== world) { a.bitmap.close(); R.freeTexture(a.tex); worlds.delete(wi); return; } // 晚到：玩家已經切到別的世界，直接放掉
        const nb = makeBands(wi, a.bitmap);
        a.bitmap.close(); // 合成完就放掉解碼的點陣圖（約 4.7 MB），不等垃圾回收
        for (const [k, f] of Object.entries(a.frames)) frames[k] = f;
        for (const b of bands) R.freeTexture(b.tex); bands = nb;
        loaded.push(wi);
        // 只留目前的世界（新的載好才放掉舊的，切換時不會有空白幀）
        for (const old of loaded.filter((x) => x !== wi)) { loaded.splice(loaded.indexOf(old), 1); dropWorld(old); }
        dirty = true;
      });
      worlds.set(wi, p);
    }
    return p;
  }
  function dropWorld(wi: number): void {
    const pre = `w${wi}.`; let tex: Tex | null = null;
    for (const k of Object.keys(frames)) if (k.startsWith(pre)) { tex = frames[k].tex; delete frames[k]; }
    if (tex) R.freeTexture(tex);
    worlds.delete(wi);
  }

  const cam: Cam = { x: 0, y: 7, d: 19, fov: 50, shakeX: 0, shakeY: 0 };
  let W = innerWidth, H = innerHeight, dirty = true, world = 0, t = 0;
  let f = 1, px = 0, py = 0, pz = 0;
  const cP = Math.cos(PITCH), sP = Math.sin(PITCH);
  const P = { x: 0, y: 0, k: 0, D: 0 };
  /** 世界座標 → 螢幕（CSS 像素）：k＝這個深度每世界單位幾像素，D＝離鏡頭的深度 */
  function proj(x: number, y: number, z = 0): typeof P {
    const X = x - px, Y = y - py, Z = z - pz;
    const yv = Y * cP + Z * sP, D = -(-Y * sP + Z * cP), k = f / D;
    P.x = W / 2 + X * k; P.y = H / 2 - yv * k; P.k = k; P.D = D;
    return P;
  }
  const waterline = (_x: number, z: number) => { const ly = SKY[world].groundY; const Y = ly - py, Z = z - pz; const D = -(-Y * sP + Z * cP); return H / 2 - (Y * cP + Z * sP) * (f / D); };
  const horizon = () => H / 2 + Math.tan(PITCH) * f; // 地平線在螢幕上的高度（跟鏡頭高度無關）
  /** 水面（y=0）上哪個 z 投影到螢幕第 sy 列（waterline 的反函數；畫面底那一列在鏡頭前方） */
  const zAtRow = (sy: number) => { const r = (H / 2 - sy) / f, Y = SKY[world].groundY - py; return pz + (Y * (cP - r * sP)) / (-r * cP - sP); };
  const fogOf = (D: number) => Math.min(0.92, Math.max(0, (D - FOG_NEAR) / (FOG_FAR - FOG_NEAR)));
  let fogRGB = [255, 255, 255];
  const fogAdd = (fg: number) => (fg <= 0 ? NOADD : rgba(((fogRGB[0] * fg) << 16) | ((fogRGB[1] * fg) << 8) | (fogRGB[2] * fg) | 0, 0));
  const fogMul = (fg: number, tint = 0xffffff, a = 1) => { const k = 1 - fg; return rgba((((tint >> 16) & 255) * k << 16) | (((tint >> 8) & 255) * k << 8) | ((tint & 255) * k), a); };

  /** 世界座標精靈：rot＝逆時針（世界角度）、sx/sy＝相對烘焙尺寸的倍率、clip＝在水線下裁掉、fog＝依深度霧化 */
  function spr(fr: Frame | undefined, x: number, y: number, z: number, rot: number, sx: number, sy: number, tint = 0xffffff, alpha = 1, clip = true, fog = false, add = NOADD): void {
    if (!fr || alpha <= 0.003) return;
    const p = proj(x, y, z), kk = p.k * fr.unit;
    const fg = fog ? fogOf(p.D) : 0;
    R.sprite(fr, p.x, p.y, -rot, kk * sx, kk * sy, fg ? fogMul(fg, tint, alpha) : rgba(tint, alpha), fg ? fogAdd(fg) : add, clip ? waterline(x, z) : NOCLIP);
  }

  // ---- 世界的顏色（換世界時算好）
  const C = { skyTop: 0, skyBot: 0, fog: 0, waterFar: 0, waterNear: 0, crest: 0xffffff, sun: 0xffffff, glowA: 0, glowB: 0, aurora: [0, 0, 0] };
  let K: Sky = SKY[0];
  function setWorld(wi: number): void {
    world = Math.max(0, Math.min(WORLDS.length - 1, wi));
    const w = WORLDS[world]; K = SKY[world];
    fogRGB = rgb(w.fog);
    C.skyTop = rgba(hex(w.sky[0])); C.skyBot = rgba(hex(w.sky[1])); C.fog = rgba(hex(w.fog));
    C.waterFar = rgba(hex(mix(w.water, w.fog, 0.8))); C.waterNear = rgba(hex(w.water));
    C.crest = hex(lighten(w.water, 0.75)); C.sun = hex(K.sunCol);
    C.glowA = rgba(hex(K.glow), 0.3); C.glowB = rgba(hex(mix(K.glow, '#40e0ff', 0.7)), 0.3); // 霓虹運河：粉／青倒影
    const a = w.aurora ?? ['#000000', '#000000', '#000000']; C.aurora = a.map((c) => rgba(hex(c), 0.22));
    void ensureWorld(world);
    dirty = true;
  }

  // ---- 天空：漸層、星星、太陽、極光；地平線到水邊是霧色的遠地
  function drawSky(): void {
    const yh = horizon(), T = whiteF.tex;
    R.quadC(T, 0, 0, W, 0, 0, yh, W, yh, wu, wv, wu, wv, C.skyTop, C.skyTop, C.skyBot, C.skyBot, NOADD, NOCLIP);
    if (K.stars > 0) { const u0 = px * 0.002, u1 = u0 + W / 256; R.quadUV(starTex, 0, 0, u0, 0, W, 0, u1, 0, 0, yh, u0, yh / 128, W, yh, u1, yh / 128, rgba(0xffffff, K.stars), NOADD, NOCLIP); }
    if (K.sun[3] > 0) {
      const sx = K.sun[0] * W, sy = K.sun[1] * H, r = K.sun[2] * H, gl = frames.glow;
      R.sprite(gl, sx, sy, 0, (r * 5) / gl.w, (r * 5) / gl.h, rgba(C.sun, 0.45), ADD);
      if (K.sun[3] >= 2) { const d = frames.disc; R.sprite(d, sx, sy, 0, (r * 2.2) / d.w, (r * 2.2) / d.h, rgba(C.sun, 1)); }
    }
    if (K.aurora) {
      const [a0, a1, a2] = C.aurora, y0 = H * 0.02, y1 = H * 0.36, u = t * 0.02;
      R.quadC(auroraTex, 0, y0, W, y0, 0, y1, W, y1, u, 0, u + W / 520, 1, a0, a1, a0, a1, ADD, NOCLIP);
      R.quadC(auroraTex, 0, y0 + H * 0.08, W, y0 + H * 0.08, 0, y1, W, y1, 0.3 - u * 0.7, 0, 0.3 - u * 0.7 + W / 700, 1, a1, a2, a1, a2, ADD, NOCLIP);
    }
    const ye = waterline(0, WATER_EDGE); // 地平線到水邊：霧色漸漸變成遠水色，跟水面接起來沒有線
    if (ye > yh) R.quadC(T, 0, yh, W, yh, 0, ye, W, ye, wu, wv, wu, wv, C.fog, C.fog, C.waterFar, C.waterFar, NOADD, NOCLIP);
  }
  // ---- 水面：水邊到畫面底的漸層（遠處混霧色）＋三段高光帶（遠密近疏、各自的視差）；霓虹運河多一層直條倒影
  function drawWater(): void {
    const ye = Math.max(waterline(0, WATER_EDGE), horizon()), T = whiteF.tex;
    if (ye >= H) return;
    R.quadC(T, 0, ye, W, ye, 0, H, W, H, wu, wv, wu, wv, C.waterFar, C.waterFar, C.waterNear, C.waterNear, NOADD, NOCLIP);
    if (K.waterKind === 1) { const k = f / (pz + 22), u0 = (px - (W / 2) / k) / 40, u1 = (px + (W / 2) / k) / 40; R.quadC(auroraTex, 0, ye, W, ye, 0, H, W, H, u0, 0.1, u1, 0.9, C.glowA, C.glowB, C.glowA, C.glowB, ADD, NOCLIP); }
    const ak = K.waterKind === 4 ? 1.4 : K.waterKind === 3 ? 0.5 : 1; // 冰水高光強、流沙弱
    for (const [za, zb0, Pu, a] of WATER_ROWS) {
      const last = zb0 > pz, zb = last ? zAtRow(H) : zb0; // 最近一段畫到畫面底：底那一列對應的 z 在鏡頭前方
      const ya = Math.max(ye, waterline(0, za)), yb = last ? H : waterline(0, zb); if (yb <= ya) continue;
      // 貼圖座標直接用世界座標除以週期：u 跟著 x、v 跟著 z，鏡頭怎麼動高光都釘在水面上
      const k = f / (pz - (za + zb) / 2), u0 = (px - (W / 2) / k) / Pu, u1 = (px + (W / 2) / k) / Pu, v0 = -za / Pu, v1 = -zb / Pu;
      R.quadUV(rippleTex, 0, ya, u0, v0, W, ya, u1, v0, 0, yb, u0, v1, W, yb, u1, v1, rgba(C.crest, a * ak), NOADD, NOCLIP);
    }
  }
  // ---- 背景層：一個四邊形，貼圖橫向重複；霧化用頂點顏色，水線用頂點 clip
  function drawBand(b: Band): void {
    const k = f / (pz - b.z); if (!(k > 0)) return;
    const fg = fogOf(pz - b.z), mul = fogMul(fg), add = fogAdd(fg);
    const yt = proj(px, b.yTop, b.z).y, yb = proj(px, b.yBot, b.z).y;
    const u0 = (px - (W / 2) / k) / b.P, u1 = (px + (W / 2) / k) / b.P;
    R.quadUV(b.tex, 0, yt, u0, 0, W, yt, u1, 0, 0, yb, u0, 1, W, yb, u1, 1, mul, add, waterline(0, b.z));
  }

  const drawFns: (() => void)[] = [];
  R.onRestore(() => { dirty = true; }); // GL context 恢復：資源由 gl.ts 重建，這裡只要重畫
  const resize = () => { W = innerWidth; H = innerHeight; R.resize(W, H, dprOf()); dirty = true; };
  addEventListener('resize', resize); resize();
  setWorld(0);

  /** 每幀：鏡頭 → 投影參數 */
  function frame(time: number, _beat: number): void {
    t = time;
    f = (H * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    px = cam.x + cam.shakeX; py = cam.y + cam.shakeY; pz = cam.d;
  }
  function render(): void {
    if (R.lost) return; // context 掉了：保持 dirty，恢復後再畫
    dirty = false;
    R.begin();
    drawSky();
    for (const b of bands) if (b.z < WATER_EDGE) drawBand(b); // 水邊以外的（遠山、雲）在水面後面
    drawWater();
    for (const b of bands) if (b.z >= WATER_EDGE) drawBand(b); // 立在水裡的（樹、荷葉、浮冰），由遠到近
    for (const fn of drawFns) fn();
    R.end();
  }
  const out = { x: 0, y: 0 };
  return {
    R, cam, frames, proj, spr, waterline, setWorld, ensureWorld, frame, render,
    /** 遊戲平面的繪製函式（依登記順序畫，在背景之後） */
    layer(fn: () => void) { drawFns.push(fn); },
    /** 目前世界的烘焙圖 */
    wf: (key: string): Frame | undefined => frames[`w${world}.${key}`],
    /** 世界座標（z=0）→ CSS 像素（給 DOM 跳字） */
    project(x: number, y: number) { const p = proj(x, y, 0); out.x = p.x; out.y = p.y; return out; },
    setQuality(cap: number, _d: number) { dprCap = cap; resize(); }, // 背景層已經便宜到不用分級；detail 留給粒子
    /** 遊戲平面（z=0）每世界單位幾個 CSS 像素 */
    get s() { return f / pz; }, get W() { return W; }, get H() { return H; }, get world() { return world; },
    get dirty() { return dirty; }, set dirty(v: boolean) { dirty = v; },
    get atlasBytes() { return R.texBytes; }, get drawCalls() { return R.drawCalls; },
    /** 這個世界的圖集與背景層都已經在顯示記憶體裡（開關卡前要確認，不然道具會等圖集到了才出現） */
    worldReady: (wi: number) => loaded.includes(wi),
    ensureSkin, ensureCat, skinBitmap, skinBitmapNow: (id: string) => skinNow.get(id),
    canvasTexture(cv: HTMLCanvasElement, repeat = false): Tex { return R.texture(cv, { repeat }); },
  };
}
export type View = Awaited<ReturnType<typeof createView>>;

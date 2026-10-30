// 旋轉貓舞台（選單主角、商店展示台）與貓的質感處理。選了貓才動態載入（portraits.ts／view.ts 用 import()），開機不載。
// 迷因的節奏：站著盯你 → 揣手手轉一陣（一格影片一個角度、每秒 3.3 圈，src/art/cat-spin.*）→ 站回來。
// 可點的舞台點一下就立刻轉，這時才唱 oiia（自動轉是安靜的）。大小、站位跟樹蛙一致：腳踩在荷葉上，下面有接觸陰影。
// 質感（網址 ?catlook=，比較用）：sticker＝白色描邊貼紙、scene＝照場景調色＋左上天光輪廓、plain＝原樣
import catPortraitUrl from '../art/cat-portrait.webp';
import catSpinUrl from '../art/cat-spin.webp';
import catSpin from '../art/cat-spin.json';
import { portraitReady } from './portraits.ts';

type Look = 'sticker' | 'scene' | 'plain';
const LOOK = ((/[?&]catlook=(sticker|scene|plain)(&|$)/.exec(location.search) ?? [])[1] ?? 'sticker') as Look;
const STAND_S = 2.4, SPIN_S = 1.8, FPS = 30;
export interface StageOpt { tap?: boolean; feet?: number; height?: number }
interface Sprite { c: HTMLCanvasElement; x: number; y: number }
interface Stage { cv: HTMLCanvasElement; size: number; o: Required<StageOpt>; t0: number; tapAt: number; shown: number; raf: number; stand: Sprite | null; spin: Sprite[] }
const stages = new Map<HTMLCanvasElement, Stage>();
let catSrc: Promise<[HTMLImageElement, HTMLImageElement]> | null = null;
const loadImg = (u: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** 把貓舞台掛到畫布上（size＝畫布像素；feet＝腳的高度、height＝站姿高度，都是畫布的比例） */
export function catStage(cv: HTMLCanvasElement, size: number, opt: StageOpt = {}): void {
  const o = { tap: false, feet: 0.885, height: 0.72, ...opt };
  let st = stages.get(cv);
  if (!st || st.size !== size) {
    st = { cv, size, o, t0: performance.now(), tapAt: 0, shown: -2, raf: 0, stand: null, spin: [] };
    stages.set(cv, st);
    if (cv.width !== size || cv.height !== size) { cv.width = size; cv.height = size; }
    const s = st;
    void (catSrc ??= Promise.all([loadImg(catPortraitUrl), loadImg(catSpinUrl)])).then(([a, b]) => { prepare(s, a, b); s.shown = -2; run(s); portraitReady(); });
  }
  cv.classList.toggle('tap', o.tap);
  if (o.tap && !cv.dataset.catTap) { cv.dataset.catTap = '1'; cv.addEventListener('pointerdown', () => { const s = stages.get(cv); if (s?.o.tap) { s.tapAt = performance.now(); run(s); } }); }
  st.shown = -2; run(st);
}
export function dropStage(cv: HTMLCanvasElement): void { const st = stages.get(cv); if (!st) return; cancelAnimationFrame(st.raf); stages.delete(cv); cv.classList.remove('tap'); }
/** 有舞台正在被點著轉（主迴圈用來決定要不要唱 oiia） */
export function catSinging(): boolean { const now = performance.now(); for (const s of stages.values()) if (s.tapAt && now - s.tapAt < SPIN_S * 1000 && s.cv.offsetParent) return true; return false; }

// 站姿與 9 個旋轉格：先照這個舞台的大小縮好、加上質感，畫的時候只是貼上去
function prepare(st: Stage, stand: HTMLImageElement, sheet: HTMLImageElement): void {
  const S = st.size, SH = S * st.o.height, SW = SH * (stand.width / stand.height), FY = S * st.o.feet;
  const ax = S / 2, ay = FY - SH + 0.55 * SH; // 站姿錨點（身體中心，src/render/view.ts 同一個點）
  st.stand = look(stand, 0, 0, stand.width, stand.height, SW, SH, ax - SW / 2, FY - SH);
  const C = catSpin, LH = SH * C.h, LW = LH * (C.cw / C.ch);
  st.spin = Array.from({ length: C.n }, (_, i) => look(sheet, i * C.cw, 0, C.cw, C.ch, LW, LH, ax - C.ax * LW, ay - C.ay * LH));
}
function look(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number, x: number, y: number): Sprite {
  const { c, p } = catLook(src, sx, sy, sw, sh, w, h);
  return { c, x: x - p, y: y - p };
}
/** 貓的質感處理（選單、商店、遊戲裡的貓共用）：來源的一塊 → 縮到 w×h、四周留 p 的邊（描邊要的空間） */
export function catLook(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number): { c: HTMLCanvasElement; p: number } {
  const r = LOOK === 'sticker' ? Math.max(2, h * 0.03) : 0, p = Math.ceil(r) + 3;
  const c = canvas(Math.ceil(w) + 2 * p, Math.ceil(h) + 2 * p), g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, sx, sy, sw, sh, p, p, w, h);
  // 幾乎透明的雜訊歸零：描邊會把輪廓疊幾十次，一點點 alpha 也會被疊成看得見的方框
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 10) d[i] = 0;
  g.putImageData(im, 0, 0);
  if (LOOK === 'scene') { grade(c); rim(c, Math.max(1.5, h * 0.03)); }
  if (LOOK === 'sticker') outline(c, r);
  return { c, p };
}
/** 只留輪廓、塗成單色 */
function silhouette(c: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const s = canvas(c.width, c.height), g = s.getContext('2d')!;
  g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, s.width, s.height);
  return s;
}
/** 貼紙：外圍一圈白邊（輪廓往 24 個方向推出去疊起來） */
function outline(c: HTMLCanvasElement, r: number): void {
  const sil = silhouette(c, '#ffffff'), o = canvas(c.width, c.height), g = o.getContext('2d')!;
  for (const k of [1, 0.5]) for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.drawImage(sil, Math.cos(a) * r * k, Math.sin(a) * r * k); }
  g.drawImage(c, 0, 0);
  const cg = c.getContext('2d')!; cg.clearRect(0, 0, c.width, c.height); cg.drawImage(o, 0, 0);
}
/** 照場景調色：亮一點、飽和一點、偏暖，暗部稍微提起來（照片原本偏灰暗） */
function grade(c: HTMLCanvasElement): void {
  const g = c.getContext('2d')!, im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2], l = 0.299 * r + 0.587 * gg + 0.114 * b;
    const f = (v: number, warm: number) => { v = (l + (v - l) * 1.2) * 1.08 * warm; return v + (255 - v) * 0.04; };
    d[i] = f(r, 1.03); d[i + 1] = f(gg, 1); d[i + 2] = f(b, 0.95);
  }
  g.putImageData(im, 0, 0);
}
/** 天光輪廓：左上邊緣一道淡藍白的亮邊（場景的光從左上來，樹蛙的高光也在左上） */
function rim(c: HTMLCanvasElement, d: number): void {
  const sil = silhouette(c, '#eef9ff'), edge = canvas(c.width, c.height), g = edge.getContext('2d')!;
  g.drawImage(sil, 0, 0); g.globalCompositeOperation = 'destination-out'; g.drawImage(sil, d, d); // 往右下錯開扣掉 → 剩左上的月牙
  const cg = c.getContext('2d')!; cg.save(); cg.globalCompositeOperation = 'source-atop';
  for (const [ox, oy, a] of [[0, 0, 0.85], [1, 0, 0.35], [0, 1, 0.35]] as const) { cg.globalAlpha = a; cg.drawImage(edge, ox, oy); }
  cg.restore();
}

function run(st: Stage): void { if (!st.raf) st.raf = requestAnimationFrame((t) => tick(st, t)); }
function tick(st: Stage, now: number): void {
  st.raf = 0;
  if (!st.cv.isConnected || !st.cv.offsetParent || !st.stand) return; // 不在畫面上就停，下次掛上來再跑
  let frame = -1; // -1＝站姿
  const n = st.spin.length;
  if (st.tapAt && now - st.tapAt < SPIN_S * 1000) frame = Math.floor(((now - st.tapAt) / 1000) * FPS) % n;
  else {
    if (st.tapAt) { st.tapAt = 0; st.t0 = now; } // 點的那一輪轉完：從頭站一陣
    const c = ((now - st.t0) / 1000) % (STAND_S + SPIN_S);
    if (c >= STAND_S) frame = Math.floor((c - STAND_S) * FPS) % n;
  }
  if (frame !== st.shown) { st.shown = frame; draw(st, frame); }
  st.raf = requestAnimationFrame((t) => tick(st, t));
}
function draw(st: Stage, frame: number): void {
  const S = st.size, g = st.cv.getContext('2d')!, sp = frame < 0 ? st.stand! : st.spin[frame];
  g.clearRect(0, 0, S, S);
  // 接觸陰影：站著貼地；轉起來會浮起來（迷因原片也是），影子變小變淡
  const fy = S * st.o.feet, k = frame < 0 ? 1 : 0.7;
  const sh = g.createRadialGradient(S / 2, fy, 0, S / 2, fy, S * 0.26 * k);
  sh.addColorStop(0, `rgba(0,30,20,${0.32 * k})`); sh.addColorStop(1, 'rgba(0,30,20,0)');
  g.save(); g.translate(S / 2, fy); g.scale(1, 0.2); g.translate(-S / 2, -fy); g.fillStyle = sh; g.fillRect(0, fy - S * 0.3, S, S * 0.6); g.restore();
  g.drawImage(sp.c, sp.x, sp.y);
}

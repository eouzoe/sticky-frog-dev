// 圖集：
// 1) 烘焙圖集（tools/bake 從原版 3D 模型渲染）：src/art/atlas-*.webp＋atlas.json（座標表打包進 JS，省一次請求）。
//    fetch → createImageBitmap（瀏覽器在背景執行緒解碼）→ 上傳成貼圖（兩層 mipmap，縮小時不閃）。
// 2) 執行時繪製的小圖集：粒子、光環、軌道這些小形狀（Canvas 畫一張 256 寬的小圖，幾毫秒）。
import type { Frame, GL, Tex } from './gl.ts';
import type { Def } from './paint.ts';
import { GRAY } from './palette.ts';
import meta from '../art/atlas.json';

const URLS = import.meta.glob('../art/atlas-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (name: string) => URLS[`../art/atlas-${name}.webp`];

interface Raw { a: string; x: number; y: number; w: number; h: number; ax: number; ay: number; u: number; px?: number; py?: number; d?: number }
const RAW = (meta as { frames: Record<string, Raw> }).frames;
const SIZE = (meta as { atlases: Record<string, { w: number; h: number }> }).atlases;

export async function decode(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
}

// 開機時提早開始的下載＋解碼，跟主程式下載、WebGL 初始化同時進行：
// window.__pre＝index.html 的內嵌腳本（建置時注入，第一次來的玩家），prefetch()＝main.ts 依存檔。第一個用到的拿走，不常駐
declare global { interface Window { __pre?: Record<string, Promise<ImageBitmap>> } }
const early = new Map<string, Promise<ImageBitmap>>();
export function prefetch(name: string): void { if (!early.has(name) && !window.__pre?.[name]) early.set(name, decode(urlOf(name))); }
function take(name: string): Promise<ImageBitmap> {
  const pre = window.__pre?.[name]?.catch(() => decode(urlOf(name))), p = pre ?? early.get(name) ?? decode(urlOf(name));
  if (window.__pre) delete window.__pre[name];
  early.delete(name);
  return p;
}
/** 開機猜錯、沒用到的提早解碼：放掉 */
export function dropPrefetch(): void {
  for (const p of [...early.values(), ...Object.values(window.__pre ?? {})]) p.then((b) => b.close(), () => {});
  early.clear(); window.__pre = {};
}

/** 只解碼一張烘焙圖集（商店頭像用，不上傳 GPU） */
export const decodeAtlas = (name: string): Promise<ImageBitmap> => take(name);
/** 載入一張烘焙圖集：回傳貼圖、這張圖集的所有格、解碼後的點陣圖 */
export async function loadAtlas(R: GL, name: string, pre?: Promise<ImageBitmap>): Promise<{ tex: Tex; frames: Record<string, Frame>; bitmap: ImageBitmap }> {
  const bitmap = await (pre ?? take(name));
  const tex = R.texture(bitmap, { mip: true, restore: () => decode(urlOf(name)) }); // context 掉了再恢復時重新下載解碼（不留點陣圖在記憶體）
  const { w: W, h: H } = SIZE[name];
  const frames: Record<string, Frame> = {};
  for (const [key, r] of Object.entries(RAW)) {
    if (r.a !== name) continue;
    frames[key] = { tex, u0: r.x / W, v0: r.y / H, u1: (r.x + r.w) / W, v1: (r.y + r.h) / H, w: r.w, h: r.h, ax: r.ax, ay: r.ay, unit: r.u, px: r.px, py: r.py, d: r.d };
  }
  return { tex, frames, bitmap };
}
/** 頭像合成用：某張圖集的原始座標（像素） */
export const rawFrame = (key: string): Raw | undefined => RAW[key];
export const rawKeys = (prefix: string): string[] => Object.keys(RAW).filter((k) => k.startsWith(prefix));

/** 執行時繪製的小圖集（灰階＋執行時上色）：def.b＝邊界（區域單位）、px＝每單位像素 */
export function paintedAtlas(R: GL, defs: Record<string, Def>, maxW = 512): Record<string, Frame> {
  const PAD = 3;
  const items = Object.entries(defs).map(([key, d]) => { const [x0, x1, y0, y1] = d.b; return { key, d, w: Math.ceil((x1 - x0) * d.px), h: Math.ceil((y1 - y0) * d.px), x: 0, y: 0 }; }).sort((a, b) => b.h - a.h);
  let x = PAD, y = PAD, rowH = 0;
  for (const it of items) { if (x + it.w + PAD > maxW) { x = PAD; y += rowH + PAD; rowH = 0; } it.x = x; it.y = y; x += it.w + PAD; rowH = Math.max(rowH, it.h); }
  const H = Math.ceil((y + rowH + PAD) / 4) * 4;
  const cv = document.createElement('canvas'); cv.width = maxW; cv.height = H;
  const g = cv.getContext('2d')!;
  for (const it of items) {
    const [x0, , , y1] = it.d.b;
    g.save(); g.beginPath(); g.rect(it.x, it.y, it.w, it.h); g.clip();
    g.translate(it.x - x0 * it.d.px, it.y + y1 * it.d.px); g.scale(it.d.px, -it.d.px);
    g.lineJoin = 'round'; g.lineCap = 'round';
    it.d.paint(g, GRAY);
    g.restore();
  }
  const tex = R.texture(cv, { mip: true });
  const out: Record<string, Frame> = {};
  for (const it of items) {
    const [x0, x1, y0, y1] = it.d.b;
    out[it.key] = { tex, u0: it.x / maxW, v0: it.y / H, u1: (it.x + it.w) / maxW, v1: (it.y + it.h) / H, w: it.w, h: it.h, ax: (-x0 / (x1 - x0)) * it.w, ay: (y1 / (y1 - y0)) * it.h, unit: 1 / it.d.px };
  }
  return out;
}
/** 單張圖片當一格（旋轉貓照片）：錨點比例 ax/ay、高度 hU 世界單位 */
export function imageFrame(R: GL, img: TexImageSource & { width: number; height: number }, ax: number, ay: number, hU: number): Frame {
  const tex = R.texture(img, { mip: true });
  return { tex, u0: 0, v0: 0, u1: 1, v1: 1, w: img.width, h: img.height, ax: ax * img.width, ay: ay * img.height, unit: hU / img.height };
}

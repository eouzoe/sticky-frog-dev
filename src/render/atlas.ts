// 圖集：tools/bake 烘焙出來的 src/art/atlas-<name>.webp＋atlas-<name>.json（座標表跟圖一起、用到才抓，不打進 JS）。
// fetch → createImageBitmap（瀏覽器在背景執行緒解碼）→ 上傳成貼圖（兩層 mipmap，縮小時不閃）。
// fx 圖集（粒子、光環、軌道這些小形狀）也是離線畫好的：tools/bake/paint.js 用 paint.ts 的定義畫，執行時不再花時間畫。
import type { Frame, GL, Tex } from './gl.ts';

const URLS = import.meta.glob('../art/atlas-*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const META_URLS = import.meta.glob('../art/atlas-*.json', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const urlOf = (name: string) => URLS[`../art/atlas-${name}.webp`];
const metaUrlOf = (name: string) => META_URLS[`../art/atlas-${name}.json`];

export interface Raw { x: number; y: number; w: number; h: number; ax: number; ay: number; u: number; px?: number; py?: number; d?: number }
export interface AtlasMeta { w: number; h: number; frames: Record<string, Raw> }
const RAW: Record<string, Raw> = {}; // 已載入圖集的原始座標（頭像合成用）
const metas = new Map<string, Promise<AtlasMeta>>();
const fetchMeta = (name: string) => fetch(metaUrlOf(name)).then((r) => r.json() as Promise<AtlasMeta>);
function loadMeta(name: string): Promise<AtlasMeta> {
  let p = metas.get(name);
  if (!p) {
    const pre = window.__preMeta?.[name]?.catch(() => fetchMeta(name));
    if (window.__preMeta) delete window.__preMeta[name];
    p = (pre ?? fetchMeta(name)).then((m) => { Object.assign(RAW, m.frames); return m; });
    metas.set(name, p);
  }
  return p;
}

export async function decode(url: string): Promise<ImageBitmap> {
  const blob = await (await fetch(url)).blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
}

// 開機時提早開始的下載＋解碼，跟主程式下載、WebGL 初始化同時進行：
// window.__pre／__preMeta＝index.html 的內嵌腳本（建置時注入），prefetch()＝main.ts 依存檔。第一個用到的拿走，不常駐
declare global { interface Window { __pre?: Record<string, Promise<ImageBitmap>>; __preMeta?: Record<string, Promise<AtlasMeta>> } }
const early = new Map<string, Promise<ImageBitmap>>();
export function prefetch(name: string): void { void loadMeta(name); if (!early.has(name) && !window.__pre?.[name]) early.set(name, decode(urlOf(name))); }
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

/** 只解碼一張烘焙圖集（商店頭像用，不上傳 GPU）；座標表一併載好，rawFrame／rawKeys 才查得到 */
export const decodeAtlas = (name: string): Promise<ImageBitmap> => Promise.all([take(name), loadMeta(name)]).then(([b]) => b);
/** 開機路徑的量測點（開發者工具效能面板看得到；scratchpad 的 bootmarks 腳本會列出來） */
export const measure = (name: string, start: number) => performance.measure(name, { start, end: performance.now() });
/** 載入一張烘焙圖集：回傳貼圖、這張圖集的所有格、解碼後的點陣圖 */
export async function loadAtlas(R: GL, name: string, pre?: Promise<ImageBitmap>): Promise<{ tex: Tex; frames: Record<string, Frame>; bitmap: ImageBitmap }> {
  const t0 = performance.now();
  const [bitmap, m] = await Promise.all([pre ?? take(name), loadMeta(name)]);
  measure(`atlas:${name}:wait`, t0);
  const t1 = performance.now();
  const tex = R.texture(bitmap, { mip: true, restore: () => decode(urlOf(name)) }); // context 掉了再恢復時重新下載解碼（不留點陣圖在記憶體）
  measure(`atlas:${name}:upload`, t1);
  const { w: W, h: H } = m;
  const frames: Record<string, Frame> = {};
  for (const [key, r] of Object.entries(m.frames)) frames[key] = { tex, u0: r.x / W, v0: r.y / H, u1: (r.x + r.w) / W, v1: (r.y + r.h) / H, w: r.w, h: r.h, ax: r.ax, ay: r.ay, unit: r.u, px: r.px, py: r.py, d: r.d };
  return { tex, frames, bitmap };
}
/** 頭像合成用：某張（已載入的）圖集的原始座標（像素） */
export const rawFrame = (key: string): Raw | undefined => RAW[key];
export const rawKeys = (prefix: string): string[] => Object.keys(RAW).filter((k) => k.startsWith(prefix));

/** 單張圖片當一格（旋轉貓照片）：錨點比例 ax/ay、高度 hU 世界單位 */
export function imageFrame(R: GL, img: TexImageSource & { width: number; height: number }, ax: number, ay: number, hU: number): Frame {
  const tex = R.texture(img, { mip: true });
  return { tex, u0: 0, v0: 0, u1: 1, v1: 1, w: img.width, h: img.height, ax: ax * img.width, ay: ay * img.height, unit: hU / img.height };
}

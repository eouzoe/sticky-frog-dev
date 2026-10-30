// 商店與選單的角色頭像：從該造型的烘焙圖集（3D 零件）依深度疊到小畫布上，跟遊戲裡長得一模一樣。
// 造型圖集用到才下載：還沒到的先回透明佔位圖並開始載，載好呼叫 onReady 讓畫面重畫一次。
// 旋轉貓用迷因照片的頭像版（src/art/cat-portrait.webp）；選單主角與商店展示台是會照迷因節奏轉的舞台（cat-stage.ts，選了貓才載）。
import { SKINS } from '../config.ts';
import { rawFrame, rawKeys } from './atlas.ts';
import catPortraitUrl from '../art/cat-portrait.webp';

export { catPortraitUrl };
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const cache = new Map<string, string>(), asked = new Set<string>();
interface Source { now(id: string): ImageBitmap | undefined; load(id: string): Promise<ImageBitmap> }
let src: Source | null = null, onReady = () => {};
/** 開機時設：造型圖集的點陣圖來源、載好時要做的事（重畫商店／選單頭像） */
export function setPortraitSource(s: Source, ready: () => void): void { src = s; onReady = ready; cache.clear(); }
/** 素材晚到時要重畫（cat-stage.ts 也用） */
export const portraitReady = () => onReady();

// 貓舞台模組：選了貓才載（約 8 KB）；載好之前 catSinging 回 false
type CatMod = typeof import('./cat-stage.ts');
let catMod: CatMod | null = null, catLoading: Promise<CatMod> | null = null;
export const loadCatStage = (): Promise<CatMod> => (catLoading ??= import('./cat-stage.ts').then((m) => (catMod = m)));
/** 有貓舞台正在被點著轉（主迴圈用來決定要不要唱 oiia） */
export const catSinging = (): boolean => catMod?.catSinging() ?? false;

/** 把造型的零件疊到 2D 畫布上（size×size）；圖集還沒到就開始載、回 false */
function paint(id: string, g: CanvasRenderingContext2D, size: number): boolean {
  const bmp = src?.now(id);
  if (!bmp) { if (src && !asked.has(id)) { asked.add(id); void src.load(id).then(() => onReady()); } return false; }
  const layers = rawKeys(`${id}.`).filter((k) => !k.endsWith('.open')).map((k) => rawFrame(k)!).sort((a, b) => (a.d ?? 0) - (b.d ?? 0));
  if (!layers.length) return true;
  // 所有層的聯集外框（相對原點）→ 置中縮放
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of layers) { x0 = Math.min(x0, -f.ax); y0 = Math.min(y0, -f.ay); x1 = Math.max(x1, f.w - f.ax); y1 = Math.max(y1, f.h - f.ay); }
  const k = (size * 0.86) / Math.max(x1 - x0, y1 - y0), ox = size / 2 - ((x0 + x1) / 2) * k, oy = size / 2 - ((y0 + y1) / 2) * k + size * 0.02;
  g.imageSmoothingQuality = 'high';
  for (const f of layers) g.drawImage(bmp, f.x, f.y, f.w, f.h, ox - f.ax * k, oy - f.ay * k, f.w * k, f.h * k);
  return true;
}

/** 直接畫進頁面上的畫布（選單主角）：不編碼 PNG，開機時省掉一大段主執行緒時間；貓是會動的舞台 */
export function drawPortrait(id: string, cv: HTMLCanvasElement, size: number): void {
  const sk = SKINS.find((s) => s.id === id) ?? SKINS[1];
  if (sk.kind === 'cat') { void loadCatStage().then((m) => m.catStage(cv, size, { tap: true })); return; }
  catMod?.dropStage(cv);
  if (cv.width !== size || cv.height !== size) { cv.width = size; cv.height = size; }
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, size, size);
  paint(sk.id, g, size);
}

/** 角色頭像（正方形 PNG data URL；商店卡片、通知用） */
export function portraitURL(id: string, size = 192): string {
  const sk = SKINS.find((s) => s.id === id) ?? SKINS[1];
  if (sk.kind === 'cat') return catPortraitUrl;
  const key = `${sk.id}@${size}`;
  const hit = cache.get(key); if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  if (!paint(sk.id, cv.getContext('2d')!, size)) return BLANK;
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

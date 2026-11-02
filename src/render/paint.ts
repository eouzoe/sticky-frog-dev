// Canvas 2D 小形狀：粒子、光環、軌道、氣流柱、光暈，以及舌頭／拖尾的長條貼圖。
// 角色、道具、背景改用 tools/bake 從原版 3D 模型烘焙的圖集（src/art/），這裡只剩執行時才畫、又小又便宜的東西。
import { GRAY, INK, inkOf, darken, rgba } from './palette.ts';

export type Ctx = CanvasRenderingContext2D;
export type Painter = (g: Ctx, c: string) => void;
/** 一張圖：b＝[左, 右, 下, 上] 區域範圍（單位），px＝每單位幾像素，tint＝是否用灰階基底（執行時上色），paint＝畫法 */
export interface Def { b: readonly [number, number, number, number]; px: number; tint: boolean; paint: Painter }

const TAU = Math.PI * 2;
export const OUT = 0.07; // 外框粗細（單位）
export function ell(g: Ctx, x: number, y: number, rx: number, ry: number, rot = 0): void { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); }
function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void { g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, r); }

/** 軟膠塗色：填色、裁切內打上下亮暗、外框。path 每次呼叫都要重建同一個路徑；box＝形狀大約的中心與半徑（決定亮暗面的位置） */
function vinyl(g: Ctx, path: () => void, c: string, box: [number, number, number, number], o: { lw?: number; hi?: number; lo?: number; outline?: boolean } = {}): void {
  const [cx, cy, rx, ry] = box;
  path(); g.fillStyle = c; g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = rgba(INK, o.lo ?? 0.2); ell(g, cx + rx * 0.15, cy - ry * 1.15, rx * 1.4, ry * 0.75); g.fill(); // 下暗
  g.fillStyle = rgba('#ffffff', o.hi ?? 0.3); ell(g, cx - rx * 0.18, cy + ry * 0.42, rx * 0.72, ry * 0.42); g.fill(); // 上亮
  g.restore();
  if (o.outline !== false) { path(); g.lineWidth = o.lw ?? OUT; g.strokeStyle = inkOf(c); g.stroke(); }
}
function blob(g: Ctx, x: number, y: number, rx: number, ry: number, c: string, o: { lw?: number; hi?: number; lo?: number; outline?: boolean; glint?: boolean; rot?: number } = {}): void {
  const rot = o.rot ?? 0;
  vinyl(g, () => ell(g, x, y, rx, ry, rot), c, [x, y, rx, ry], o);
  if (o.glint !== false) { g.fillStyle = rgba('#ffffff', 0.85); ell(g, x - rx * 0.4, y + ry * 0.45, Math.max(0.04, rx * 0.17), Math.max(0.03, ry * 0.11), 0.6); g.fill(); }
}

// ============================================================ 關卡小形狀（白色，執行時上色）
export const FX: Record<string, Def> = {
  shadow: { b: [-1, 1, -1, 1], px: 32, tint: false, paint: (g) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); } },
  halo: { b: [-1.7, 1.7, -1.7, 1.7], px: 64, tint: false, paint: (g) => { g.lineWidth = 0.16; g.strokeStyle = '#ffffff'; ell(g, 0, 0, 1.55, 1.55); g.stroke(); } },
  track: { b: [-0.5, 0.5, -0.5, 0.5], px: 32, tint: false, paint: (g) => { g.fillStyle = '#000000'; rrect(g, 0, 0, 1, 1, 0.45); g.fill(); } },
  column: { b: [-0.5, 0.5, -0.5, 0.5], px: 32, tint: false, paint: (g) => { const gr = g.createLinearGradient(-0.5, 0, 0.5, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-0.5, -0.5, 1, 1); } },
  glow: { b: [-1, 1, -1, 1], px: 32, tint: false, paint: (g) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-1, -1, 2, 2); } },
  white: { b: [-1, 1, -1, 1], px: 8, tint: false, paint: (g) => { g.fillStyle = '#ffffff'; g.fillRect(-1, -1, 2, 2); } }, // 純色四邊形用（取中心那一格）
  disc: { b: [-1, 1, -1, 1], px: 32, tint: false, paint: (g) => { g.fillStyle = '#ffffff'; ell(g, 0, 0, 0.94, 0.94); g.fill(); } }, // 太陽日輪
};

// ============================================================ 粒子（白色形狀，每顆粒子各自 tint）
const PP = 40;
export const PARTICLE: Record<string, Def> = {
  p_candy: { b: [-0.5, 0.5, -0.5, 0.5], px: PP, tint: true, paint: (g, c) => blob(g, 0, 0, 0.46, 0.46, c, { lw: 0.06, hi: 0.4 }) },
  p_confetti: { b: [-0.5, 0.5, -0.32, 0.32], px: PP, tint: true, paint: (g, c) => { g.fillStyle = c; rrect(g, 0, 0, 0.92, 0.56, 0.14); g.fill(); g.fillStyle = rgba('#ffffff', 0.4); rrect(g, -0.1, 0.12, 0.6, 0.18, 0.08); g.fill(); } },
  p_spark: { b: [-0.5, 0.5, -0.22, 0.22], px: PP, tint: true, paint: (g, c) => { g.fillStyle = c; ell(g, 0, 0, 0.48, 0.2); g.fill(); g.fillStyle = rgba('#ffffff', 0.7); ell(g, -0.05, 0.04, 0.3, 0.08); g.fill(); } },
  p_bubble: { b: [-0.5, 0.5, -0.5, 0.5], px: PP, tint: true, paint: (g, c) => { g.lineWidth = 0.08; g.strokeStyle = c; ell(g, 0, 0, 0.42, 0.42); g.stroke(); g.fillStyle = rgba('#ffffff', 0.18); g.fill(); g.fillStyle = '#ffffff'; ell(g, -0.16, 0.16, 0.1, 0.06, -0.6); g.fill(); } },
  p_star: { b: [-0.5, 0.5, -0.5, 0.5], px: PP, tint: true, paint: (g, c) => { const s = () => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 0.22 : 0.48; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }; vinyl(g, s, c, [0, 0, 0.4, 0.4], { lw: 0.05, hi: 0.4 }); } },
  p_coin: { b: [-0.5, 0.5, -0.5, 0.5], px: PP, tint: false, paint: (g) => { blob(g, 0, 0, 0.45, 0.45, '#ffc93c', { lw: 0.06, hi: 0.4 }); g.lineWidth = 0.06; g.strokeStyle = 'rgba(224,154,0,0.9)'; ell(g, 0, 0, 0.28, 0.28); g.stroke(); } },
  p_steam: { b: [-0.5, 0.5, -0.5, 0.5], px: PP, tint: true, paint: (g, c) => blob(g, 0, 0, 0.47, 0.43, c, { outline: false, glint: false, hi: 0.35, lo: 0.08 }) },
  shock: { b: [-1.05, 1.05, -1.05, 1.05], px: 64, tint: true, paint: (g, c) => { g.lineWidth = 0.09; g.strokeStyle = c; ell(g, 0, 0, 0.98, 0.98); g.stroke(); } },
  speedLine: { b: [-0.5, 0.5, -0.06, 0.06], px: 64, tint: false, paint: (g) => { g.fillStyle = 'rgba(255,255,255,0.6)'; rrect(g, 0, 0, 1, 0.08, 0.04); g.fill(); } },
};

// 舌頭與拖尾的長條（各自一張小貼圖：繩索網格要沿長度重複或拉伸，不能放在圖集裡）
export function stripCanvas(w: number, h: number, paint: (g: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d')!, w, h);
  return cv;
}
/** 舌頭花紋（沿長度重複）：一般舌頭、毛線、藤蔓、蛛絲。白色為主，執行時 tint 成舌頭色 */
export function tongueStrip(kind: string | null): HTMLCanvasElement {
  return stripCanvas(64, 32, (g, w, h) => {
    const band = (y: number, hh: number, col: string) => { g.fillStyle = col; g.fillRect(0, y, w, hh); };
    if (kind === 'yarn') { band(4, 24, '#ff7ab8'); g.strokeStyle = '#ffd0e8'; g.lineWidth = 5; for (let x = -32; x < 96; x += 12) { g.beginPath(); g.moveTo(x, 28); g.lineTo(x + 14, 4); g.stroke(); } }
    else if (kind === 'vine') { band(6, 20, '#3d8f3a'); band(11, 10, '#5fbf4a'); g.fillStyle = '#9be36b'; for (const x of [8, 40]) { ell(g, x, 7, 9, 4, -0.5); g.fill(); ell(g, x + 16, 25, 9, 4, 0.5); g.fill(); } }
    else if (kind === 'silk') { band(12, 8, '#d9e0ff'); band(14, 4, '#ffffff'); }
    else { band(4, 24, GRAY); band(9, 5, '#ffffff'); band(22, 5, darken(GRAY, 0.2)); }
    // 上下兩緣柔邊（沒有 MSAA 也不會鋸齒）
    g.globalCompositeOperation = 'destination-out'; const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.14, 'rgba(0,0,0,0)'); gr.addColorStop(0.86, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
// 背景用的小貼圖（兩個方向都重複）。固定種子的偽隨機，每次畫出來都一樣
const lcg = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
/** 水面高光：幾道柔邊的波紋亮線，白色，執行時 tint 成水面亮色；超出右邊的畫回左邊讓接縫對得上 */
export function rippleStrip(): HTMLCanvasElement {
  return stripCanvas(256, 64, (g, w) => {
    const rnd = lcg(7); g.lineCap = 'round';
    for (const [y, a, lw] of [[10, 0.9, 3.2], [26, 0.6, 2.4], [41, 0.8, 2.8], [55, 0.5, 2.0]]) {
      let x = rnd() * 40;
      while (x < w + 40) {
        const len = 24 + rnd() * 60, bow = 2 + rnd() * 3;
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = lw;
        for (const dx of [0, -w]) { g.beginPath(); g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx + len / 2, y - bow, x + dx + len, y); g.stroke(); }
        x += len + 16 + rnd() * 50;
      }
    }
  });
}
/** 星星：大小、亮度不一的點 */
export function starStrip(): HTMLCanvasElement {
  return stripCanvas(256, 128, (g, w, h) => {
    const rnd = lcg(3);
    for (let i = 0; i < 70; i++) { const r = 0.6 + rnd() * 1.3; g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.65})`; ell(g, rnd() * w, rnd() * h, r, r); g.fill(); }
  });
}
/** 極光／霓虹倒影：直條柔光，上下淡出，橫向可重複；執行時 tint 成極光色或霓虹色 */
export function auroraStrip(): HTMLCanvasElement {
  return stripCanvas(256, 64, (g, w, h) => {
    const rnd = lcg(11);
    for (let i = 0; i < 14; i++) {
      const x = rnd() * w, ww = 8 + rnd() * 22, a = 0.25 + rnd() * 0.45;
      for (const dx of [0, -w]) { const gr = g.createLinearGradient(x + dx, 0, x + dx + ww, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + dx, 0, ww, h); }
    }
    g.globalCompositeOperation = 'destination-in';
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,1)'); v.addColorStop(0.75, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}
/** 拖尾（從頭到尾淡出、上下柔邊）：colors 沿長度排列，單色就是一般拖尾 */
export function trailStrip(colors: readonly string[]): HTMLCanvasElement {
  return stripCanvas(128, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    colors.forEach((c, i) => gr.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, w, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fade; g.fillRect(0, 0, w, h);
    const edge = g.createLinearGradient(0, 0, 0, h); edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(0.3, 'rgba(0,0,0,1)'); edge.addColorStop(0.7, 'rgba(0,0,0,1)'); edge.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = edge; g.fillRect(0, 0, w, h);
  });
}


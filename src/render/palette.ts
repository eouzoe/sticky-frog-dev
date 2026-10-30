// 色彩工具與世界細色盤。
// 換色的做法：圖集裡的物件畫成灰階（基底 GRAY＝0.82 的灰，亮面往白、暗面往墨色），執行時用 tint 乘上世界或角色的顏色。
// tint 是相乘，所以要讓「基底灰 × tint」等於想要的顏色：tint = 顏色 / 0.82（超過 1 的通道夾住）。
export const INK = '#2a2340'; // 外框與陰影的墨色，跟 index.html 的 --ink-soft 同色
export const BASE = 0.82;
export const GRAY = '#d1d1d1'; // 0.82 × 255 ≈ 209

type RGB = [number, number, number];
export function rgb(hex: string): RGB {
  const v = parseInt(hex.slice(1), 16);
  return hex.length === 4 ? [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17] : [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
export function mix(a: string, b: string, k: number): string { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return hex(r1 + (r2 - r1) * k, g1 + (g2 - g1) * k, b1 + (b2 - b1) * k); }
export const lighten = (c: string, k: number) => mix(c, '#ffffff', k);
export const darken = (c: string, k: number) => mix(c, '#000000', k);
export const inkOf = (c: string, k = 0.62) => mix(c, INK, k);
export const rgba = (c: string, a: number) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
export const num = (c: string) => parseInt(c.slice(1), 16);
/** 讓灰階貼圖乘出 c 這個顏色的 tint */
export function tintOf(c: string): number { const [r, g, b] = rgb(c); const f = (x: number) => Math.min(255, Math.round(x / BASE)); return (f(r) << 16) | (f(g) << 8) | f(b); }
/** 0..1 的 RGB（給 shader uniform） */
export function vec3(c: string, out: Float32Array = new Float32Array(3)): Float32Array { const [r, g, b] = rgb(c); out[0] = r / 255; out[1] = g / 255; out[2] = b / 255; return out; }

/** 世界細色盤（美術線調過的，跟 config.ts 的 WORLDS 同一個索引）：玩法層的 WORLDS 管天空、水、主色，這裡管物件細節與背景件 */
export interface WorldPal {
  petal: string; petal2: string; bud: string; leaf: string; vine: string; pad: string; vein: string;
  cap: string; capSpot: string; capUnder: string; stem: string; wood: string;
  hazard: string; hazardTip: string; saw: string; sawStripe: string; hub: string; accent: string;
  /** 背景件兩個顏色（主體、點綴）與遠景剪影色 */
  bgA: string; bgB: string;
}
export const WORLD_PAL: readonly WorldPal[] = [
  { petal: '#ff5fa8', petal2: '#ffc2e0', bud: '#ffc929', leaf: '#22b45c', vine: '#28b05a', pad: '#2fcf6c', vein: '#9af0a8',
    cap: '#ff4757', capSpot: '#ffffff', capUnder: '#ffe2c8', stem: '#f5e6c8', wood: '#a0643a',
    hazard: '#3a2a30', hazardTip: '#ff4040', saw: '#cfd6de', sawStripe: '#ffcf33', hub: '#e83a3a', accent: '#ff4f86', bgA: '#2fbf62', bgB: '#a0643a' },
  { petal: '#7be0ff', petal2: '#e6fbff', bud: '#ffffff', leaf: '#ff7eb6', vine: '#ff7eb6', pad: '#7ee0a8', vein: '#d8ffe9',
    cap: '#9b5de5', capSpot: '#ffe066', capUnder: '#f0e0ff', stem: '#fff7fb', wood: '#c97b4a',
    hazard: '#3b2340', hazardTip: '#ff2d55', saw: '#d8dde6', sawStripe: '#2b1a33', hub: '#ff2d55', accent: '#ff2d55', bgA: '#ff5fa8', bgB: '#7be0ff' },
  { petal: '#00f0ff', petal2: '#c8ffff', bud: '#ff2bd6', leaf: '#7a5cff', vine: '#7a5cff', pad: '#00e0a0', vein: '#a8fff0',
    cap: '#00e0a0', capSpot: '#eaffff', capUnder: '#1d3a4a', stem: '#3a2a66', wood: '#3a2a66',
    hazard: '#1a1626', hazardTip: '#ff2bd6', saw: '#c8ccd8', sawStripe: '#ffe600', hub: '#ff2bd6', accent: '#00f0ff', bgA: '#3d2f6e', bgB: '#ffe36b' },
  { petal: '#ffb020', petal2: '#ffe2a0', bud: '#ff5a1f', leaf: '#56b870', vine: '#5a3b2b', pad: '#56b870', vein: '#b8f0a0',
    cap: '#ff7a00', capSpot: '#3a2420', capUnder: '#ffd2a0', stem: '#7a5a50', wood: '#4a3030',
    hazard: '#1e1416', hazardTip: '#ffdd33', saw: '#ffcf40', sawStripe: '#1e1416', hub: '#ff3a00', accent: '#ff6a1a', bgA: '#3a2a2c', bgB: '#ff6a1a' },
  { petal: '#ff4d94', petal2: '#ffc4dc', bud: '#ffd21f', leaf: '#4aa8d8', vine: '#3d86c4', pad: '#8ee6e6', vein: '#f6ffff',
    cap: '#8a5cff', capSpot: '#ffffff', capUnder: '#eaf6ff', stem: '#eaf6ff', wood: '#4d6f9a',
    hazard: '#17233f', hazardTip: '#ff9a14', saw: '#dfeaf5', sawStripe: '#ff9a14', hub: '#ff9a14', accent: '#ff4f7a', bgA: '#1f7a78', bgB: '#f4fbff' },
  { petal: '#0fb3ae', petal2: '#9ff0e8', bud: '#fff3b0', leaf: '#37b79a', vine: '#1fa59a', pad: '#46dc9a', vein: '#d8ffe9',
    cap: '#ff5aa5', capSpot: '#fff3b0', capUnder: '#ffe0ec', stem: '#fff1d6', wood: '#8a4b2a',
    hazard: '#2a1346', hazardTip: '#ff2e63', saw: '#dfe8ff', sawStripe: '#ff2e63', hub: '#ff2e63', accent: '#ff5aa5', bgA: '#b0503f', bgB: '#3aa86a' },
];

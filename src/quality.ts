// 畫質三級＋自動調整（2D 版）。2D 渲染本身很便宜，分級只動兩個真正吃 GPU／CPU 的東西：
//   dpr     像素比上限（實際 = min(devicePixelRatio, dpr)）：填充率是低階手機的主要成本
//   fx      粒子池上限
//   detail  背景細節：2＝全部背景層與水面細節、1＝少一層背景、0＝只留天空與遠山
export interface Tier { dpr: number; fx: number; detail: 0 | 1 | 2 }
export type TierName = 'low' | 'mid' | 'high';
export const TIERS: Record<TierName, Tier> = {
  high: { dpr: 2, fx: 220, detail: 2 },
  mid: { dpr: 1.5, fx: 160, detail: 2 },
  low: { dpr: 1, fx: 90, detail: 1 },
};
export const ORDER: readonly TierName[] = ['low', 'mid', 'high'];
const isTier = (v: unknown): v is TierName => typeof v === 'string' && v in TIERS;

export interface TierPick { tier: TierName; max: TierName; forced?: boolean }
// 開局用裝置訊號猜一級：觸控裝置從 mid 或 low 開始，桌機從 high 或 mid 開始；?q=high|mid|low 強制指定
// index.html 在 <canvas> 後面的內嵌腳本照同一條規則先配畫面緩衝：這裡改了那邊要跟著改（不改只會開機多重配一次）
export function pickTier(env: { search?: string; coarse?: boolean; cores?: number; mem?: number } = {}): TierPick {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  const {
    search = typeof location === 'undefined' ? '' : location.search,
    coarse = typeof matchMedia === 'undefined' ? false : matchMedia('(pointer: coarse)').matches,
    cores = nav?.hardwareConcurrency || 4,
    mem = nav?.deviceMemory || 0,
  } = env;
  const forced = new URLSearchParams(search).get('q');
  if (isTier(forced)) return { tier: forced, max: forced, forced: true };
  const weak = cores <= 4 || (mem > 0 && mem <= 4); // deviceMemory 只有 Chrome 給；iOS 沒有，只看核心數
  if (coarse) return { tier: weak ? 'low' : 'mid', max: 'mid' }; // 手機最高自動升到 mid
  return { tier: weak ? 'mid' : 'high', max: 'high' };
}

// 執行中依實際幀率雙向調整（每秒餵一次 fps）：
//   降：單秒 < 36 fps 或連續 2 秒 < 48 fps → 立刻降一級
//   升：連續 20 秒 ≥ 57 fps 且距離上次換級 ≥ 30 秒 → 升一級；升上去 25 秒內又掉下來 → 那一級這次遊玩不再試
export function createGovernor({ tier, max = 'high', forced = false }: TierPick) {
  let slow = 0, fast = 0, since = 0, upAt = -1e9, t = 0;
  const banned = new Set<TierName>();
  return {
    get tier() { return tier; },
    tick(fps: number): TierName | null {
      t++; since++;
      if (forced) return null;
      const i = ORDER.indexOf(tier);
      if (fps < 36) slow += 2; else if (fps < 48) slow += 1; else slow = 0;
      fast = fps >= 57 ? fast + 1 : 0;
      if (slow >= 2 && i > 0) {
        if (t - upAt < 25) banned.add(tier);
        slow = fast = 0; since = 0; tier = ORDER[i - 1]; return tier;
      }
      if (fast >= 20 && since >= 30 && i < ORDER.indexOf(max) && !banned.has(ORDER[i + 1])) {
        slow = fast = 0; since = 0; upAt = t; tier = ORDER[i + 1]; return tier;
      }
      return null;
    },
  };
}
export type Governor = ReturnType<typeof createGovernor>;

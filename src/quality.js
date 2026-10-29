// 畫質三級＋自動調整。表裡每一欄都是「這一級跟上一級差在哪」；high 就是改版前唯一的高畫質，low 就是改版前降級後的畫質。
//   dpr     像素比上限（實際 = min(devicePixelRatio, dpr)）
//   mats    材質：'high' = A 軟膠（Standard＋環境反光＋邊緣光）、'low' = Lambert＋較淡的邊緣光
//   shadow  陰影圖邊長（0 = 關陰影）
//   post    受擊色差後製（開時打擊瞬間多一個 2× MSAA 的離屏 pass）
//   fx      粒子池上限（高 900，大爆發疊在一起時超過七成會自動減半）
export const TIERS = {
  high: { dpr: 1.5, mats: 'high', shadow: 1024, post: true, fx: 900 },
  mid: { dpr: 1.25, mats: 'high', shadow: 512, post: false, fx: 540 },
  low: { dpr: 1, mats: 'low', shadow: 0, post: false, fx: 300 },
};
export const ORDER = ['low', 'mid', 'high'];

// 開局用裝置訊號猜一級：觸控裝置從 mid 或 low 開始，桌機從 high 或 mid 開始；?q=high|mid|low 強制指定（不自動調整，截圖與測試用）
export function pickTier(env = {}) {
  const { search = location.search, coarse = matchMedia?.('(pointer: coarse)').matches ?? false, cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 0 } = env;
  const forced = new URLSearchParams(search).get('q');
  if (TIERS[forced]) return { tier: forced, max: forced, forced: true };
  const weak = cores <= 4 || (mem > 0 && mem <= 4); // deviceMemory 只有 Chrome 給（最大回報 8）；iOS 沒有，只看核心數
  if (coarse) return { tier: weak ? 'low' : 'mid', max: 'mid' }; // 手機最高自動升到 mid（高畫質的 1.5× 像素比在 3× 螢幕上很重）
  return { tier: weak ? 'mid' : 'high', max: 'high' };
}

// 執行中依實際幀率雙向調整（每秒餵一次 fps）：
//   降：單秒 < 36 fps 或連續 2 秒 < 48 fps → 立刻降一級（慢就快點降）
//   升：連續 20 秒 ≥ 57 fps 且距離上次換級 ≥ 30 秒 → 升一級（保守）；升上去 25 秒內又掉下來 → 那一級這次遊玩不再試
export function createGovernor({ tier, max = 'high', forced = false }) {
  let slow = 0, fast = 0, since = 0, upAt = -1e9, t = 0;
  const banned = new Set();
  return {
    get tier() { return tier; },
    // 回傳要換成的新級別，不換就 null
    tick(fps) {
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

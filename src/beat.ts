// 一局結束的固定節拍（秒）。時間寫死不看幀率，剪影片時每一關的結尾長度才一致；任何點擊在 skipAfter 之後可以提前結束。
// 這裡只有時間表，沒有畫面：main.ts 每幀用 fired() 取出這一幀跨過的提示點，去播對應的畫面與聲音。
export type Cue =
  | 'star1' | 'star2' | 'star3' // 星星一顆顆亮（沒拿到的那顆留暗）
  | 'coinsOut' // 金幣從角色身上噴出、懸空
  | 'coinsFly' // 金幣飛向 HUD 計數器（到達那一刻數字才跳）
  | 'best' // NEW BEST 貼紙
  | 'dist' | 'score' // 無盡：距離、分數浮出
  | 'countdown'; // 無盡：倒數條開始跑，跑完自動新一局
export interface Beat { total: number; skipAfter: number; cues: readonly { at: number; cue: Cue }[] }

const STAR_GAP = 0.18, COIN_FLY = 0.5, OVER_COUNT = 1.5;
// 過關。豪爽（3 星或新紀錄）：定格 → 三顆星 → 金幣噴出、懸空、飛入 → 停一下，約 2.0 s。
// 可惜（1–2 星）：定格 → 星星（缺的留暗）→ 金幣直接飛入 → 短停，約 1.4 s。
export function clearBeat(stars: number, newBest: boolean): Beat {
  const big = stars === 3 || newBest, t0 = big ? 0.25 : 0.2;
  const cues: { at: number; cue: Cue }[] = [];
  for (let i = 0; i < 3; i++) cues.push({ at: t0 + i * STAR_GAP, cue: `star${i + 1}` as Cue });
  const t3 = t0 + 2 * STAR_GAP;
  if (big) {
    const fly = t3 + 0.18 + 0.25;
    cues.push({ at: t3 + 0.18, cue: 'coinsOut' }, { at: fly, cue: 'coinsFly' });
    if (newBest) cues.push({ at: fly + COIN_FLY, cue: 'best' });
    return { total: fly + COIN_FLY + 0.5, skipAfter: t3, cues };
  }
  const fly = t3 + 0.15;
  cues.push({ at: fly, cue: 'coinsFly' });
  return { total: fly + 0.4 + 0.3, skipAfter: t3, cues };
}
// 無盡死亡：定格 → 距離、分數浮出 → 倒數 1.5 s 自動新一局
export function overBeat(): Beat {
  return { total: 0.8 + OVER_COUNT, skipAfter: 0.5, cues: [{ at: 0.25, cue: 'dist' }, { at: 0.5, cue: 'score' }, { at: 0.8, cue: 'countdown' }] };
}
// 主線死亡：短短定格就從荷葉重生（可以點擊提前，但太早會讓人沒看到自己怎麼死的）
export function dyingBeat(delay: number): Beat { return { total: delay, skipAfter: Math.min(delay, 0.25), cues: [] }; }
export const COUNTDOWN = OVER_COUNT;
// 這一幀跨過的提示點：t0 ≤ at < t1（t1 給 Infinity＝剩下全部，提前結束時用）
export function fired(b: Beat, t0: number, t1: number): Cue[] {
  const out: Cue[] = [];
  for (const c of b.cues) if (c.at >= t0 && c.at < t1) out.push(c.cue);
  return out;
}

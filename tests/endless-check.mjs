// 無盡模式：自動玩家（12 組參數）接力在 N 個種子上跑，每個種子都要接力到 TARGET 單位才 exit 0。
// 證明產生器隨距離升難度時不會吐出不可能的段落（至少到 TARGET；難度上限＝第 60 關，sim-check 已驗過同一個段落產生器）。
// 方法見下面「接力」註解。
// 用法：node tests/endless-check.mjs [種子數]
import { TUNE as T } from '../src/config.js';
import { createEndless, extendEndless, endlessDiff, endlessWorld, ENDLESS_WORLD_LEN } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { makeBot } from '../src/bot.js';

export const TARGET = 4 * ENDLESS_WORLD_LEN; // 跑完四個世界（1800 單位，難度 0.12 → 0.81）
const SEEDS = Number(process.argv[2] ?? 12);
const PARAMS = [];
for (const rel of [0.25, 0.4, 0.55, 0.7]) for (const gv of [-2, 2, 6]) PARAMS.push([rel, gv]);

// 接力：從「前線」狀態讓 12 組參數各跑一段（直到死或再前進 LEG 單位），取最遠且活著的狀態當新前線。
// 前線保留 6 個不同狀態；全部前線 × 12 組參數都死在同一段＝那裡可能是不可能段落 → 失敗。單一參數一路跑到底太嚴（等於連破好幾關不換手），接力等於「存在一條每段都有人走得過的路」。
const LEG = 60, BEAM = 6;
const clone = (s) => ({ ...structuredClone({ ...s, level: null }), level: s.level });
let fails = 0, soloBest = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const L = createEndless(seed);
  let beam = [createSim(L)], legs = 0, stuck = null;
  while (beam[0].maxX < TARGET) {
    const next = [];
    for (const front of beam) for (const p of PARAMS) {
      const s = clone(front), bot = makeBot(...p), goal = front.maxX + LEG, t0 = s.t;
      while (s.mode !== 'dead' && s.maxX < goal && s.t - t0 < 30) {
        if (L.gen.x < s.x + 120) extendEndless(L, s.x + 250); // 遊戲端同一個規則
        step(s, T.DT, bot(s)); s.events.length = 0;
      }
      // 只收「黏在鉤點上、正在擺」的狀態當新前線（下一段的玩家從可控的狀態接手）
      if (s.mode !== 'dead' && s.maxX >= goal) {
        while (s.mode !== 'dead' && s.tongue.state !== 'stuck' && s.t - t0 < 40) { step(s, T.DT, bot(s)); s.events.length = 0; }
        if (s.mode !== 'dead') next.push(s);
      }
    }
    if (!next.length) { stuck = beam[0].maxX; break; }
    // 保留 BEAM 個不同鉤點上的狀態（貪心只留最遠的一個會走進死胡同）
    next.sort((a, b) => b.maxX - a.maxX);
    beam = [];
    for (const s of next) if (beam.length < BEAM && !beam.some((o) => o.tongue.hook === s.tongue.hook && Math.abs(o.x - s.x) < 1)) beam.push(s);
    legs++;
  }
  const front = beam[0];
  // 參考：單一參數一路不換手能跑多遠
  for (const p of PARAMS) {
    const L2 = createEndless(seed), s = createSim(L2), bot = makeBot(...p);
    while (s.mode !== 'dead' && s.maxX < TARGET && s.t < 600) { if (L2.gen.x < s.x + 120) extendEndless(L2, s.x + 250); step(s, T.DT, bot(s)); s.events.length = 0; }
    soloBest = Math.max(soloBest, s.maxX);
  }
  const ok = stuck === null;
  if (!ok) fails++;
  console.log(`seed ${String(seed).padStart(2)} ${ok ? `OK reached ${front.maxX.toFixed(0)} in ${legs} legs` : `FAIL all 12 bots die after x=${stuck.toFixed(0)} (diff ${endlessDiff(stuck).toFixed(2)})`}`);
}
// 輪替：預設前四個世界；count=5（打過第 60 關）冰峰（世界 4）要出現，而且四個世界時不會出現
{
  const seq = (c) => Array.from({ length: c * 3 }, (_, i) => endlessWorld(i * ENDLESS_WORLD_LEN + 10, c));
  const ok4 = seq(4).every((w) => w >= 0 && w <= 3) && new Set(seq(4)).size === 4, ok5 = new Set(seq(5)).size === 5 && seq(5).includes(4);
  if (!ok4 || !ok5) { fails++; console.log(`FAIL 世界輪替 4 個=${ok4} 5 個=${ok5}`); } else console.log('OK 世界輪替：4 個世界不含冰峰、5 個世界含冰峰');
}
console.log(`target=${TARGET} failed=${fails}/${SEEDS}  (single-param best run reached ${soloBest.toFixed(0)})`);
process.exit(fails ? 1 : 0);

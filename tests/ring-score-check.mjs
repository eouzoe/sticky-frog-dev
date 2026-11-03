// 金圈分數：沙丘軌跡圈（ring.trail）＝SCORE_RING_TRAIL（30），一般金圈＝SCORE_RING（150）；另量 76–90 兩種 bot 的整局分數與金幣對照第 5 世界。
// 用法：node tests/ring-score-check.mjs（exit 1＝單元級失敗或滑沙 bot 金幣 > 第 5 世界平均的 1.5 倍）
import { TUNE as T } from '../src/config.ts';
import { generateLevel } from '../src/level.ts';
import { createSim, step, ringPoints } from '../src/sim.ts';
import { makeBot, makeSurfBot } from '../src/bot.ts';
import { PARAMS } from './sim-check.mjs';
let fail = 0;
const ck = (n, ok) => {
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}`);
};
const L = generateLevel(76),
  ti = L.rings.findIndex((r) => r.trail !== undefined),
  L5 = generateLevel(63),
  gi = L5.rings.findIndex((r) => r.trail === undefined);
ck(`trail 圈 +30（得 ${ringPoints(L, ti)}）`, ringPoints(L, ti) === 30);
ck(`一般金圈 +150（得 ${ringPoints(L5, gi)}）`, ringPoints(L5, gi) === 150);
// 照 main.js 的算法重現整局分數：每個事件加分（翻滾 100×圈數、蒼蠅 50、金圈 ringPoints、蘑菇 25、黏住 10、擦身 50），combo 倍率 1+min(3, floor(combo/5)×0.5)，2.8 秒沒動作 combo 歸零；金幣＝分數/100
function runScore(lv, bot) {
  const s = createSim(lv);
  let score = 0,
    combo = 0,
    last = -99;
  const add = (v) => {
    score += Math.round(v * (1 + Math.min(3, Math.floor(combo / 5) * 0.5)));
  };
  const hit = (v) => {
    if (s.t - last > T.COMBO_WINDOW) combo = 0;
    combo++;
    last = s.t;
    add(v);
  };
  while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
    step(s, T.DT, bot(s));
    for (const e of s.events) {
      if (e.type === 'attach') hit(T.SCORE_GRAB);
      else if (e.type === 'flip') hit(T.SCORE_FLIP * e.n);
      else if (e.type === 'fly') hit(T.SCORE_FLY);
      else if (e.type === 'ring') hit(ringPoints(lv, e.i));
      else if (e.type === 'bounce') hit(T.SCORE_BOUNCE);
      else if (e.type === 'close') hit(50);
    }
    s.events.length = 0;
  }
  return s.mode === 'won' ? score : null;
}
function avg(lvs, mk) {
  let pts = 0,
    n = 0;
  for (const lv of lvs)
    for (const [rel, gv] of PARAMS) {
      const p = runScore(lv, mk(rel, gv));
      if (p !== null) {
        pts += p;
        n++;
      }
    }
  return pts / n;
}
const w6 = [],
  w5 = [];
for (let n = 76; n <= 90; n++) w6.push(generateLevel(n));
for (let n = 61; n <= 75; n++) w5.push(generateLevel(n));
const r5 = avg(w5, makeBot),
  rn = avg(w6, makeBot),
  rs = avg(w6, makeSurfBot);
console.log(
  `破關局平均整局分數（金幣＝分數/100，不含過關獎勵）：第5世界(一般bot)=${r5.toFixed(0)}（金幣 ${(r5 / 100).toFixed(1)}） 76–90 一般bot=${rn.toFixed(0)}（${(rn / 100).toFixed(1)}） 滑沙bot=${rs.toFixed(0)}（${(rs / 100).toFixed(1)}） 滑沙/第5世界=${(rs / r5).toFixed(2)}倍`,
);
ck('滑沙 bot 金幣 ≤ 第 5 世界平均 1.5 倍', rs <= 1.5 * r5);
process.exit(fail ? 1 : 0);

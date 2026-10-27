// 掃 BURST_SHIFT：每個有噴泉的關卡找一個讓 burst-check 指標為 0 的相位偏移（0–15）。輸出可貼進 level.js。
import { TUNE as T } from '../src/config.js';
import { generateLevel, BURST_SHIFT } from '../src/level.js';
import { createSim, step, burstOn } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { PARAMS } from './sim-check.mjs';
function bad(n) {
  const lv = generateLevel(n); let d = 0;
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv), bot = makeBot(rel, gv); let last = -99;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      if (s.fanIn >= 0 && lv.fans[s.fanIn].burst && burstOn(lv.fans[s.fanIn].burst, s.t)) last = s.t;
    }
    if (s.mode === 'dead' && s.t - last <= 1.5) d++;
  }
  return d;
}
const out = {};
for (let n = 46; n <= 60; n++) {
  if (!generateLevel(n).fans.some((f) => f.burst)) continue;
  for (let sh = 0; sh < 16; sh++) { BURST_SHIFT[n] = sh; if (bad(n) === 0) { out[n] = sh; break; } }
  if (!(n in out)) console.log(`L${n} 掃不到`);
}
console.log('BURST_SHIFT =', JSON.stringify(out));

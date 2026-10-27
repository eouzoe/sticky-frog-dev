// 噴泉安全量尺：12 組 bot 參數 × 46–60 關，統計「被噴發中的噴泉推過之後 1.5 秒內死亡」的次數，必須 0。
// 用法：node tests/burst-check.mjs            正式（exit 1＝有）
//       node tests/burst-check.mjs --plant    自我驗證：在每座噴泉正上方故意放尖刺，量尺必須報 >0（exit 0＝抓得到）
import { TUNE as T } from '../src/config.js';
import { generateLevel } from '../src/level.js';
import { createSim, step, burstOn } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { PARAMS } from './sim-check.mjs';

const plant = process.argv.includes('--plant');
let pushes = 0, deaths = 0, bursts = 0;
const rows = [];
for (let n = 46; n <= 60; n++) {
  const lv = generateLevel(n);
  bursts += lv.fans.filter((f) => f.burst).length;
  if (plant) for (const f of lv.fans) if (f.burst) for (let k = 0; k < 4; k++) lv.spikes.push({ x: f.x, y: f.y0 + 3 + k * 2.4, r: 0.95, hang: true });
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv), bot = makeBot(rel, gv);
    let last = -99, pushed = false;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      if (s.fanIn >= 0 && lv.fans[s.fanIn].burst && burstOn(lv.fans[s.fanIn].burst, s.t)) { last = s.t; if (!pushed) { pushed = true; pushes++; } }
    }
    if (s.mode === 'dead' && s.t - last <= 1.5) { deaths++; rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - last).toFixed(2)}`); }
  }
}
console.log(`burst fans=${bursts} runs-pushed=${pushes} deaths-within-1.5s=${deaths}`);
for (const r of rows.slice(0, 20)) console.log(r);
process.exit(plant ? (deaths > 0 ? 0 : 1) : (deaths ? 1 : 0));

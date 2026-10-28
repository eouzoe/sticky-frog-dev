// 加速圈安全量尺：12 組 bot × 61–75 關，統計「被加速圈推過之後 1.5 秒內死亡」的次數，必須 0（比照 tests/burst-check.mjs）；同時印 bot 實際穿過加速圈的次數，必須 > 0（證明有接上）。
// 用法：node tests/boost-check.mjs             正式（exit 1＝有死亡、或沒有任何 bot 穿過）
//       node tests/boost-check.mjs --plant     自我驗證：在每顆加速圈的出口路徑上故意放尖刺，量尺必須報 >0（exit 0＝抓得到）
//       node tests/boost-check.mjs --noboost   拿掉所有加速圈，61–75 每關仍然要破得了（unsolved=0）
import { TUNE as T } from '../src/config.js';
import { generateLevel } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { PARAMS } from './sim-check.mjs';

const plant = process.argv.includes('--plant'), noboost = process.argv.includes('--noboost');
let passes = 0, deaths = 0, boosts = 0, unsolved = 0;
const rows = [];
for (let n = 61; n <= 75; n++) {
  const lv = generateLevel(n);
  boosts += lv.boosts.filter((b) => !b.off).length;
  if (noboost) lv.boosts.length = 0;
  if (plant) for (const b of lv.boosts) if (!b.off) for (let k = 3; k <= 11; k += 2) lv.spikes.push({ x: b.x + b.dx * k, y: b.y + b.dy * k, r: 0.95, hang: true });
  let wins = 0;
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv), bot = makeBot(rel, gv);
    let last = -99;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      for (const e of s.events) if (e.type === 'boost') { last = s.t; passes++; }
      s.events.length = 0;
    }
    if (s.mode === 'won') wins++;
    if (s.mode === 'dead' && s.t - last <= 1.5) { deaths++; rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - last).toFixed(2)}`); }
  }
  if (wins === 0) unsolved++;
  if (noboost) console.log(`L${n} WIN ${wins}/${PARAMS.length}`);
}
console.log(`boosts=${boosts} bot-passes=${passes} deaths-within-1.5s=${deaths}${noboost ? ` unsolved=${unsolved}` : ''}`);
for (const r of rows.slice(0, 20)) console.log(r);
if (noboost) process.exit(unsolved ? 1 : 0);
if (plant) process.exit(deaths > 0 ? 0 : 1);
process.exit(deaths || passes === 0 ? 1 : 0);

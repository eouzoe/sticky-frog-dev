// 滑沙安全量尺：12 組 bot × 76–90 關，統計
//   碰到沙丘的次數（landings，事件 'dune'）、被 lip 拋起的次數（launches）、
//   碰到沙丘後 1.5 秒內死亡（任何死因）——必須 0（比照 tests/boost-check.mjs）、
//   卡住（貼著沙面連續 STUCK_T 秒、前進不到 STUCK_DX 單位）——必須 0。
// 用法：node tests/dune-check.mjs             正式（exit 1＝有死亡、有卡住、或沒有任何 bot 碰到沙丘／被拋起）
//       node tests/dune-check.mjs --plant     自我驗證：在每片沙丘的拋起路徑上故意放尖刺，量尺必須報死亡 > 0（exit 0＝抓得到）
//       node tests/dune-check.mjs --nodune    拿掉所有沙丘，76–90 每關仍然要破得了（unsolved=0）
// 「拿掉往前速度下限」的突變驗證：tests/mutate-dune-floor.sh（把 sim.js 的下限改成 0，本量尺必須報卡住 > 0，再寫回原文）
import { TUNE as T } from '../src/config.js';
import { generateLevel } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { PARAMS } from './sim-check.mjs';

const plant = process.argv.includes('--plant'), nodune = process.argv.includes('--nodune');
const STUCK_T = 2.0, STUCK_DX = 1.5, WINDOW = 1.5;
let touched = 0, landings = 0, launches = 0, deaths = 0, stuck = 0, unsolved = 0, fields = 0;
const rows = [];
for (let n = 76; n <= 90; n++) {
  const lv = generateLevel(n);
  fields += lv.dunes.filter((d) => d.lip && !d.off).length;
  if (nodune) lv.dunes.length = 0;
  if (plant) for (const d of lv.dunes) if (d.lip && !d.off) for (const [dx, dy] of [[3, 3], [5, 5], [7, 7], [9, 6], [11, 4]]) lv.spikes.push({ x: d.x1 + dx, y: d.H + dy, r: 0.95, hang: true });
  let wins = 0, lan = 0, lau = 0, dth = 0, stk = 0, tch = 0;
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv), bot = makeBot(rel, gv);
    let touchedHere = false, cT = 0, cX = 0, inC = false, gapT = 0, stuckHere = false;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      for (const e of s.events) { if (e.type === 'dune') { lan++; touchedHere = true; } else if (e.type === 'launch') lau++; }
      s.events.length = 0;
      if (s.onDune >= 0) {
        if (!inC) { inC = true; cT = s.t; cX = s.x; } gapT = 0;
        if (s.t - cT >= STUCK_T) { if (s.x - cX < STUCK_DX && !stuckHere) { stuckHere = true; stk++; rows.push(`L${n} rel=${rel} gv=${gv} 卡住 x=${s.x.toFixed(1)} t=${s.t.toFixed(1)}`); } cT = s.t; cX = s.x; }
      } else if (inC) { gapT += T.DT; if (gapT > 0.3) inC = false; }
    }
    if (touchedHere) tch++;
    if (s.mode === 'won') wins++;
    if (s.mode === 'dead' && touchedHere && s.t - s.duneT <= WINDOW) { dth++; rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - s.duneT).toFixed(2)} x=${s.x.toFixed(1)}`); }
  }
  if (wins === 0) unsolved++;
  touched += tch; landings += lan; launches += lau; deaths += dth; stuck += stk;
  console.log(`L${n} fields=${lv.dunes.filter((d) => d.lip && !d.off).length} bots-touch=${String(tch).padStart(2)}/12 landings=${String(lan).padStart(2)} launches=${String(lau).padStart(2)} deaths-within-1.5s=${dth} stuck=${stk} WIN ${wins}/${PARAMS.length}`);
}
console.log(`fields=${fields} bots-touch=${touched} landings=${landings} launches=${launches} deaths-within-1.5s=${deaths} stuck=${stuck}${nodune ? ` unsolved=${unsolved}` : ''}`);
for (const r of rows.slice(0, 30)) console.log(r);
if (nodune) process.exit(unsolved ? 1 : 0);
if (plant) process.exit(deaths > 0 ? 0 : 1);
process.exit(deaths || stuck || landings === 0 || launches === 0 ? 1 : 0);

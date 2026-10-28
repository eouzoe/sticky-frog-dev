// 滑沙安全量尺：12 組 bot × 76–90 關，統計
//   碰到沙丘的 bot 數與次數、被 lip／背坡拋起的次數、
//   每次「落地」的滑行時間（落地＝空中（舌頭沒黏住）掉到沙面；滑行時間＝這次落地到離開沙面超過 0.6 秒為止，貼著沙面的累計秒數）、
//   碰到沙丘後 1.5 秒內死亡（任何死因）——必須 0、卡住（貼著沙面連續 STUCK_T 秒、前進不到 STUCK_DX 單位）——必須 0。
// 正式模式還要滿足：6-1（第 76 關）落地滑行時間中位數 ≥ 2.0 秒、76–90 全部落地中位數 ≥ 1.5 秒、76–90 每關至少 6/12 組 bot 碰到沙丘。
// 用法：node tests/dune-check.mjs             正式（exit 1＝任何一條不成立）
//       node tests/dune-check.mjs --plant     自我驗證：在每片沙丘的拋起路徑上故意放尖刺，量尺必須報死亡 > 0（exit 0＝抓得到）
//       node tests/dune-check.mjs --nodune    拿掉所有沙丘，76–90 每關仍然要破得了（unsolved=0）
//       node tests/dune-check.mjs --back      背面量尺：讓青蛙（12 組 bot 控制）從 lip 後面的背坡上方落下，1.5 秒內死亡必須 0（exit 1＝有死亡）
//       node tests/dune-check.mjs --times     每關最快的 bot 時間 vs 3 星門檻（par），必須每關都拿得到
// 突變驗證（_out/hook-hero/round2/w6/mutate-*.py）：拿掉速度下限 → 卡住 > 0；出口淨空守衛拿掉＋放尖刺 → 死亡 > 0；拿掉背坡拋起 → --back 死亡 > 0
import { TUNE as T } from '../src/config.js';
import { generateLevel } from '../src/level.js';
import { createSim, step, duneH } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { PARAMS } from './sim-check.mjs';

const has = (f) => process.argv.includes(f), plant = has('--plant'), nodune = has('--nodune'), back = has('--back'), times = has('--times');
const STUCK_T = 2.0, STUCK_DX = 1.5, WINDOW = 1.5, GAP = 0.6;
const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

if (back) {
  let runs = 0, deaths = 0, kicks = 0; const rows = [];
  for (let n = 76; n <= 90; n++) {
    const lv = generateLevel(n);
    for (const d of lv.dunes) {
      if (!d.lip || d.off) continue;
      for (const dx of [0.4, 1.4, 2.6, 3.8, 5.0]) for (const vx of [2, 7, 12]) for (const [rel, gv] of PARAMS) {
        const s = createSim(lv), bot = makeBot(rel, gv);
        s.mode = 'air'; s.started = true; s.tongue.state = 'idle'; s.x = d.x1 + dx; s.vx = vx; s.vy = 0; s.y = duneH(d, s.x) + 3;
        runs++; let died = false;
        while (s.t < 12 && s.mode !== 'dead' && s.mode !== 'won' && !(s.duneT > -90 && s.t - s.duneT > 2.2)) {
          step(s, T.DT, bot(s)); for (const e of s.events) if (e.type === 'launch' && e.back) kicks++; s.events.length = 0;
        }
        if (s.mode === 'dead' && s.duneT > -90 && s.t - s.duneT <= WINDOW) { died = true; deaths++; if (rows.length < 20) rows.push(`L${n} dx=${dx} vx=${vx} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - s.duneT).toFixed(2)}`); }
      }
    }
  }
  console.log(`back-runs=${runs} back-kicks=${kicks} deaths-within-1.5s=${deaths}`);
  for (const r of rows) console.log(r);
  process.exit(deaths || kicks === 0 ? 1 : 0);
}

let touched = 0, landings = 0, launches = 0, deaths = 0, stuck = 0, unsolved = 0, fields = 0, lowTouch = 0;
const rows = [], allEp = [], ep1 = [];
for (let n = 76; n <= 90; n++) {
  const lv = generateLevel(n);
  fields += lv.dunes.filter((d) => d.lip && !d.off).length;
  if (nodune) lv.dunes.length = 0;
  if (plant) for (const d of lv.dunes) if (d.lip && !d.off) for (const [dx, dy] of [[3, 3], [5, 5], [7, 7], [9, 6], [11, 4]]) lv.spikes.push({ x: d.x1 + dx, y: d.H + dy, r: 0.95, hang: true });
  let wins = 0, lan = 0, lau = 0, dth = 0, stk = 0, tch = 0, best = Infinity; const eps = [];
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv), bot = makeBot(rel, gv);
    let touchedHere = false, cT = 0, cX = 0, inC = false, gapT = 0, stuckHere = false, acc = 0, inEp = false, lastC = 0;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      for (const e of s.events) {
        if (e.type === 'dune') { touchedHere = true; if (s.tongue.state !== 'stuck') { lan++; if (inEp) eps.push(acc); inEp = true; acc = 0; lastC = s.t; } }
        else if (e.type === 'launch') lau++;
      }
      s.events.length = 0;
      if (s.onDune >= 0) {
        if (inEp) { acc += T.DT; lastC = s.t; }
        if (!inC) { inC = true; cT = s.t; cX = s.x; } gapT = 0;
        if (s.t - cT >= STUCK_T) { if (s.x - cX < STUCK_DX && !stuckHere) { stuckHere = true; stk++; rows.push(`L${n} rel=${rel} gv=${gv} 卡住 x=${s.x.toFixed(1)} t=${s.t.toFixed(1)}`); } cT = s.t; cX = s.x; }
      } else if (inC) { gapT += T.DT; if (gapT > GAP) inC = false; }
      if (inEp && s.t - lastC > GAP) { eps.push(acc); inEp = false; }
    }
    if (inEp) eps.push(acc);
    if (touchedHere || s.duneT > -90) tch++;
    if (s.mode === 'won') { wins++; best = Math.min(best, s.time); }
    if (s.mode === 'dead' && s.duneT > -90 && s.t - s.duneT <= WINDOW) { dth++; rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - s.duneT).toFixed(2)} x=${s.x.toFixed(1)}`); }
  }
  if (wins === 0) unsolved++;
  if (!nodune && !plant && tch < 6) lowTouch++;
  touched += tch; landings += lan; launches += lau; deaths += dth; stuck += stk; allEp.push(...eps); if (n === 76) ep1.push(...eps);
  if (times) console.log(`L${n} par=${lv.par}s 最快 bot=${best.toFixed(1)}s ${best <= lv.par ? 'ok' : 'FAIL（沒有 bot 拿得到 3 星時間）'}`);
  else console.log(`L${n} fields=${lv.dunes.filter((d) => d.lip && !d.off).length} bots-touch=${String(tch).padStart(2)}/12 landings=${String(lan).padStart(3)} launches=${String(lau).padStart(3)} slide-median=${med(eps).toFixed(2)}s deaths-within-1.5s=${dth} stuck=${stk} WIN ${wins}/${PARAMS.length}`);
  if (times && !(best <= lv.par)) unsolved++;
}
const m1 = med(ep1), mAll = med(allEp);
console.log(`fields=${fields} bots-touch=${touched} landings=${landings} launches=${launches} slides=${allEp.length} slide-median(6-1)=${m1.toFixed(2)}s slide-median(76-90)=${mAll.toFixed(2)}s levels-with-<6-bots=${lowTouch} deaths-within-1.5s=${deaths} stuck=${stuck}${nodune ? ` unsolved=${unsolved}` : ''}`);
for (const r of rows.slice(0, 30)) console.log(r);
if (times) process.exit(unsolved ? 1 : 0);
if (nodune) process.exit(unsolved ? 1 : 0);
if (plant) process.exit(deaths > 0 ? 0 : 1);
process.exit(deaths || stuck || lowTouch || landings === 0 || launches === 0 || !(m1 >= 2.0) || !(mAll >= 1.5) ? 1 : 0);

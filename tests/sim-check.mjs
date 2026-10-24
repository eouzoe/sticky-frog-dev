// 自動玩家：驗證 60 關都破得了（只要有一組參數能破就算可破），順便量完成時間校正 3 星門檻。
// 用法：node tests/sim-check.mjs [關卡號…]
import { TUNE as T } from '../src/config.js';
import { generateLevel, LEVEL_COUNT } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { makeBot } from '../src/bot.js';

export { makeBot };

export function run(n, bot, maxT = 90) {
  const s = createSim(generateLevel(n));
  while (s.t < maxT && s.mode !== 'dead' && s.mode !== 'won') step(s, T.DT, bot(s));
  return s;
}

const PARAMS = [];
for (const rel of [0.25, 0.4, 0.55, 0.7]) for (const gv of [-2, 2, 6]) PARAMS.push([rel, gv]);

if (import.meta.url !== `file://${process.argv[1]}`) { } else main();
function main() {
const only = process.argv.slice(2).map(Number);
const list = only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
let fails = 0;
for (const n of list) {
  const lv = generateLevel(n);
  let best = null, wins = 0, causes = {};
  for (const [rel, gv] of PARAMS) {
    const s = run(n, makeBot(rel, gv));
    if (s.mode === 'won') { wins++; if (!best || s.time < best.time) best = { time: s.time, rel, gv, flips: s.flipsTotal, flies: s.fliesGot }; }
    else causes[s.cause ?? 'timeout'] = (causes[s.cause ?? 'timeout'] ?? 0) + 1;
  }
  if (!best) fails++;
  console.log(`L${String(n).padStart(2)} len=${lv.length.toFixed(0).padStart(3)} hooks=${lv.hooks.length} par=${lv.par} flies=${lv.flies.length} ` +
    (best ? `WIN ${wins}/${PARAMS.length} best=${best.time.toFixed(1)}s rel=${best.rel} gv=${best.gv} flips=${best.flips} flies=${best.flies}` : `FAIL`) +
    ` ${JSON.stringify(causes)}`);
}
console.log(`unsolved=${fails}`);
process.exit(fails ? 1 : 0);
}

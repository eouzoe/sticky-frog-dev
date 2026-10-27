// 難度閘門：每關新版 12 組參數的破關數 ≥ 基準那關 − 1，且 unsolved=0；否則 exit 1。不准用調門檻解決，先降 diff 或換 SALT。
// 基準＝tests/baseline-sim.log（P0 動工前 5b0ba3d 的 sim-check 輸出）。
// 用法：node tests/diff-gate.mjs [--base 檔] [關卡號…]
import { readFileSync } from 'node:fs';
import { generateLevel, LEVEL_COUNT } from '../src/level.js';
import { makeBot } from '../src/bot.js';
import { run, PARAMS } from './sim-check.mjs';

const argv = process.argv.slice(2), bi = argv.indexOf('--base');
const baseFile = bi >= 0 ? argv.splice(bi, 2)[1] : new URL('./baseline-sim.log', import.meta.url).pathname;
const base = {};
for (const line of readFileSync(baseFile, 'utf8').split('\n')) {
  const m = line.match(/^L\s*(\d+) .*?(?:WIN (\d+)\/\d+|FAIL)/);
  if (m) base[+m[1]] = +(m[2] ?? 0);
}
const list = argv.length ? argv.map(Number) : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
let bad = 0, unsolved = 0;
for (const n of list) {
  if (!(n in base)) { console.log(`L${n} 基準缺這關`); bad++; continue; }
  let wins = 0;
  generateLevel(n); // 先確保能產生
  for (const [rel, gv] of PARAMS) if (run(n, makeBot(rel, gv)).mode === 'won') wins++;
  if (wins === 0) unsolved++;
  const ok = wins >= base[n] - 1 && wins > 0;
  if (!ok) bad++;
  console.log(`L${String(n).padStart(2)} base=${String(base[n]).padStart(2)} new=${String(wins).padStart(2)} ${ok ? 'ok' : 'FAIL'}`);
}
console.log(`levels=${list.length} violations=${bad} unsolved=${unsolved}`);
process.exit(bad || unsolved ? 1 : 0);

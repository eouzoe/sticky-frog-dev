// 61 關以後的種子篩選（第 5 世界對第 4 世界、第 6 世界對第 5 世界，都是 n−15）：每關掃 salt 0..MAX，挑「12 組 bot 的 WIN 數 ≥ 第 4 世界同位置（n−15）關 − 1」的第一個 salt（跟 SALT 同一套做法）。
// 用法：node tests/salt-search.mjs [--max 60] [關卡號…]（預設 76–90）。印出每關每個 salt 的 WIN，最後印建議的 SALT 片段。
// 第 4 世界的 WIN 數取自目前 generateLevel(n−15)，不是讀舊 log，所以第 1–60 關變動時門檻會跟著動。
import { generateLevel } from '../src/level.ts';
import { makeBot } from '../src/bot.ts';
import { PARAMS } from './sim-check.mjs';

const argv = process.argv.slice(2), mi = argv.indexOf('--max');
const MAX = mi >= 0 ? +argv.splice(mi, 2)[1] : 60;
const list = argv.length ? argv.map(Number) : Array.from({ length: 15 }, (_, i) => 76 + i);
const wins = (n, salt) => {
  const mk = () => generateLevel(n, salt);
  let w = 0;
  for (const [rel, gv] of PARAMS) { const lv = mk(); if (runLv(lv, makeBot(rel, gv)).mode === 'won') w++; }
  return w;
};
import { TUNE as T } from '../src/config.ts';
import { createSim, step } from '../src/sim.ts';
function runLv(lv, bot, maxT = 90) {
  const s = createSim(lv);
  while (s.t < maxT && s.mode !== 'dead' && s.mode !== 'won') step(s, T.DT, bot(s));
  return s;
}
const pick = {};
for (const n of list) {
  const need = Math.max(1, wins(n - 15, undefined) - 1);
  const row = [];
  let chosen = null;
  for (let salt = 0; salt <= MAX; salt++) {
    const w = wins(n, salt); row.push(w);
    if (w >= need && chosen === null) { chosen = salt; break; }
  }
  pick[n] = chosen;
  console.log(`L${n} need>=${need} salts: ${row.join(' ')} -> ${chosen === null ? 'NONE' : chosen}`);
}
console.log('SALT 片段：' + Object.entries(pick).filter(([, s]) => s).map(([n, s]) => `${n}: ${s}`).join(', '));

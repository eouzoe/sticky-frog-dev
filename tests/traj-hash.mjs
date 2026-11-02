// 軌跡雜湊閘門：固定 bot 參數（12 組）在指定關卡跑完整軌跡，逐步把狀態與事件做 sha256；跟存下來的基準逐位元比對。
// 用途：改核心（sim.js／bot.js／addSegment）時，「不該受影響的關卡」雜湊必須相同；不同＝行為變了，exit 1。
// 用法：node tests/traj-hash.mjs --levels 1-6,31-60 --save 檔.json   存基準
//       node tests/traj-hash.mjs --levels 1-6,31-60 --check 檔.json  比對（不同或基準缺關卡 → exit 1）
// --levels 省略＝全部關卡。只看軌跡（bot 實際走到的世界），不看沒被走到的幾何。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TUNE as T } from '../src/config.ts';
import { generateLevel, LEVEL_COUNT } from '../src/level.ts';
import { createSim, step } from '../src/sim.ts';
import { makeBot } from '../src/bot.ts';
import { PARAMS } from './sim-check.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
function parseLevels(s) {
  if (!s) return Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
  return s.split(',').flatMap((p) => { const [a, b = a] = p.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); });
}
const MODE = { perch: 0, air: 1, swing: 2, dead: 3, won: 4 };
const TS = { idle: 0, shoot: 1, stuck: 2, retract: 3, miss: 4 };

export function trajHash(n, maxT = 90) {
  const out = createHash('sha256');
  for (const [rel, gv] of PARAMS) {
    const h = createHash('sha256'), buf = new Float64Array(9 * 2048); let k = 0;
    const s = createSim(generateLevel(n)), bot = makeBot(rel, gv);
    while (s.t < maxT && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      buf.set([s.t, s.x, s.y, s.vx, s.vy, s.angle, s.omega, MODE[s.mode] * 8 + TS[s.tongue.state], s.tongue.L], k); k += 9;
      if (s.events.length) { h.update(JSON.stringify(s.events)); s.events.length = 0; }
      if (k === buf.length) { h.update(buf); k = 0; }
    }
    h.update(buf.subarray(0, k)); h.update(`${s.mode}|${s.cause}|${s.fliesGot}|${s.flipsTotal}`);
    out.update(h.digest('hex'));
  }
  return out.digest('hex').slice(0, 24);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levels = parseLevels(arg('--levels')), save = arg('--save'), check = arg('--check');
  if (!save && !check) { console.error('需要 --save 或 --check'); process.exit(2); }
  const cur = {};
  for (const n of levels) cur[n] = trajHash(n);
  if (save) { writeFileSync(save, JSON.stringify(cur, null, 1) + '\n'); console.log(`saved ${levels.length} levels -> ${save}`); process.exit(0); }
  const base = JSON.parse(readFileSync(check, 'utf8')); let bad = 0;
  for (const n of levels) {
    const ok = base[n] === cur[n];
    if (!ok) bad++;
    console.log(`L${String(n).padStart(3)} ${cur[n]} ${ok ? 'SAME' : `DIFF (base ${base[n] ?? 'missing'})`}`);
  }
  console.log(`levels=${levels.length} diff=${bad}`);
  process.exit(bad ? 1 : 0);
}

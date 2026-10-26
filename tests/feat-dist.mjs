// 成就門檻校正：自動玩家（12 組參數 × 60 關）量每種成就原始量的分布，印出「每局觸發比例」給訂門檻用。
// 用法：node tests/feat-dist.mjs
import { TUNE as T } from '../src/config.js';
import { generateLevel, LEVEL_COUNT } from '../src/level.js';
import { createSim, step } from '../src/sim.js';
import { makeBot } from '../src/bot.js';
import { FEAT_T, createFeatTracker } from '../src/feats.js';

const PARAMS = [];
for (const rel of [0.25, 0.4, 0.55, 0.7]) for (const gv of [-2, 2, 6]) PARAMS.push([rel, gv]);
const WATER = T.WATER_Y + 0.15;
const runs = [];
for (let n = 1; n <= LEVEL_COUNT; n++) for (const [rel, gv] of PARAMS) {
  const lv = generateLevel(n), s = createSim(lv), bot = makeBot(rel, gv);
  const ft = createFeatTracker();
  const r = { n, flipsMax: 0, stall: 0, won: false, speed: 0, dips: [], gaps: [], clutch: [], got: {} };
  let dip = Infinity, pend = null;
  while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
    step(s, T.DT, bot(s));
    for (const f of ft.tick(s, T.DT)) r.got[f.id] = (r.got[f.id] ?? 0) + 1;
    for (const e of s.events) {
      for (const f of ft.event(e, s)) if (!f.silent) r.got[f.id] = (r.got[f.id] ?? 0) + 1;
      if (e.type === 'flip') r.flipsMax = Math.max(r.flipsMax, e.n);
      if (e.type === 'close') r.gaps.push(e.gap);
      if (e.type === 'attach' && e.fvy < -4) pend = { h: e.fy - WATER, vy: e.fvy };
    }
    s.events.length = 0;
    if (s.mode === 'air' || s.mode === 'swing') {
      const h = s.y - WATER;
      if (h < 3) dip = Math.min(dip, h); else if (h > FEAT_T.SKIM_BACK && dip < Infinity) { r.dips.push(dip); dip = Infinity; }
      if (pend && h > FEAT_T.CLUTCH_BACK) { r.clutch.push(pend); pend = null; }
    }
  }
  r.stall = ft.st.stall;
  if (s.mode === 'won') { r.won = true; r.speed = (lv.goal.x - lv.start.x) / s.time; r.len = lv.goal.x - lv.start.x; }
  runs.push(r);
}
const N = runs.length, W = runs.filter((r) => r.won);
const pct = (k) => `${((k / N) * 100).toFixed(1)}%`;
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
console.log(`runs=${N} wins=${W.length}`);
console.log('spin  max flips per run:', [3, 4, 5, 6, 7, 8].map((k) => `>=${k}:${pct(runs.filter((r) => r.flipsMax >= k).length)}`).join(' '));
const ws = W.filter((r) => r.len >= FEAT_T.FLOW_MIN_LEN);
console.log(`flow  stall seconds (wins len>=${FEAT_T.FLOW_MIN_LEN}, n=${ws.length}): p5=${q(ws.map((r) => r.stall), 0.05).toFixed(2)} p10=${q(ws.map((r) => r.stall), 0.1).toFixed(2)} p50=${q(ws.map((r) => r.stall), 0.5).toFixed(2)}`,
  [0.1, 0.2, 0.3, 0.5].map((k) => `<=${k}:${pct(ws.filter((r) => r.stall <= k).length)}`).join(' '));
console.log(`speed avg m/s (wins): p50=${q(W.map((r) => r.speed), 0.5).toFixed(2)} p90=${q(W.map((r) => r.speed), 0.9).toFixed(2)} p95=${q(W.map((r) => r.speed), 0.95).toFixed(2)} max=${q(W.map((r) => r.speed), 1).toFixed(2)}`,
  [14, 15, 15.5, 16, 17].map((k) => `>=${k}:${pct(W.filter((r) => r.speed >= k).length)}`).join(' '));
const allDips = runs.flatMap((r) => r.dips);
console.log(`skim  survived dips (n=${allDips.length}) p1=${q(allDips, 0.01).toFixed(2)} p5=${q(allDips, 0.05).toFixed(2)} p25=${q(allDips, 0.25).toFixed(2)}`,
  [0.3, 0.5, 0.8, 1.2].map((k) => `runs with dip<=${k}:${pct(runs.filter((r) => r.dips.some((d) => d <= k)).length)}`).join(' '));
const allGaps = runs.flatMap((r) => r.gaps);
console.log(`shave close gaps (n=${allGaps.length}) p5=${q(allGaps, 0.05).toFixed(2)} p10=${q(allGaps, 0.1).toFixed(2)} p50=${q(allGaps, 0.5).toFixed(2)}`,
  [0.08, 0.12, 0.2, 0.3].map((k) => `runs<=${k}:${pct(runs.filter((r) => r.gaps.some((g) => g <= k)).length)}`).join(' '));
const allC = runs.flatMap((r) => r.clutch);
console.log(`clutch survived falling attaches (vy<-4, n=${allC.length}) h p5=${q(allC.map((c) => c.h), 0.05).toFixed(2)} p25=${q(allC.map((c) => c.h), 0.25).toFixed(2)}`,
  [[2.4, -6], [3, -6], [3.5, -6], [3, -4]].map(([h, v]) => `runs h<${h}&vy<${v}:${pct(runs.filter((r) => r.clutch.some((c) => c.h < h && c.vy < v)).length)}`).join(' '));
const tot = {};
for (const r of runs) for (const k in r.got) tot[k] = (tot[k] ?? 0) + 1;
console.log('with current FEAT_T, runs that got each feat:', Object.entries(tot).map(([k, v]) => `${k}:${pct(v)}`).join(' '),
  `| runs with >=1 feat: ${pct(runs.filter((r) => Object.keys(r.got).length).length)}`);

// 中途荷葉量尺（E1）：
//   1. 從每一座荷葉重生（createSim(level, 存檔)）：站在荷葉上、checkpoint 對、12 組 bot 至少一組破得了。
//   2. 沒接住鉤點的 bot 真的會落在荷葉上（事件 'pad'）；落地當下存檔，再從那份存檔重生，同樣要破得了（死了從荷葉重來）。
//   3. 荷葉範圍內沒有尖刺／鋸片／蘑菇（落上去不會立刻被刺）。
// 量測在收集測試時就跑完（約 2 秒），這樣每座荷葉、每一關各自是一條測試。
import { describe, expect, it } from 'vitest';
import { TUNE as T } from '../src/config.ts';
import { generateLevel } from '../src/level.ts';
import { createSim, step, padSnapshot } from '../src/sim.ts';
import { makeBot, type Bot } from '../src/bot.ts';
import type { Level, PadSnapshot, Sim } from '../src/types.ts';
import { PARAMS } from './helpers/sim.ts';

const fresh = (lv: Level, i: number): PadSnapshot => ({ pad: i, flies: lv.flies.map(() => false), rings: lv.rings.map(() => false), boostUsed: lv.boosts.map(() => false), fliesGot: 0, time: 0 });
const play = (lv: Level, from: PadSnapshot, bot: Bot, maxT = 90): Sim => {
  const s = createSim(lv, from);
  while (s.t < maxT && s.mode !== 'dead' && s.mode !== 'won') {
    step(s, T.DT, bot(s));
    s.events.length = 0;
  }
  return s;
};

interface Row {
  name: string;
  ok: boolean;
  line: string;
}
let padsTotal = 0,
  landed = 0,
  resumed = 0,
  resumeTries = 0;
const padRows: Row[] = [],
  levelRows: Row[] = [];
for (let n = 61; n <= 75; n++) {
  const lv = generateLevel(n);
  if (!lv.pads.length) continue;
  lv.pads.forEach((p, i) => {
    padsTotal++;
    const s0 = createSim(lv, fresh(lv, i));
    const placed = s0.mode === 'perch' && s0.checkpoint === i && Math.abs(s0.x - p.x) < 1e-9 && Math.abs(s0.y - (p.y + T.FROG_R)) < 1e-9;
    let wins = 0;
    for (const [rel, gv] of PARAMS) if (play(lv, fresh(lv, i), makeBot(rel, gv)).mode === 'won') wins++;
    const clear =
      !lv.spikes.some((q) => Math.abs(q.x - p.x) < p.w / 2 + q.r + 1) &&
      !lv.saws.some((q) => Math.abs(q.x - p.x) < p.w / 2 + q.r + q.move.ax + 1) &&
      !lv.mush.some((q) => Math.abs(q.x - p.x) < p.w / 2 + q.r + 1);
    const ok = placed && wins > 0 && clear;
    padRows.push({
      name: `L${n} 荷葉 ${i + 1}/${lv.pads.length}`,
      ok,
      line: `L${n} 荷葉 ${i + 1}/${lv.pads.length} x=${p.x.toFixed(1)} 重生站在荷葉上=${placed} 從這裡破關 ${wins}/${PARAMS.length} 周圍乾淨=${clear}`,
    });
  });
  let lvLanded = 0,
    lvResumed = 0;
  // 笨拙玩家：在荷葉上方（pad.x ± 5）不伸舌頭、也不放開，等於沒接住鉤點掉下來。落在荷葉上 → 存檔 → 從存檔重生
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv),
      base = makeBot(rel, gv);
    const bot: Bot = (q) => (q.mode !== 'perch' && lv.pads.some((p) => Math.abs(q.x - p.x) < 5) ? false : base(q));
    let snap: PadSnapshot | null = null;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      for (const e of s.events)
        if (e.type === 'pad') {
          snap = padSnapshot(s);
          landed++;
          lvLanded++;
        }
      s.events.length = 0;
    }
    if (snap) {
      resumeTries++;
      const from: PadSnapshot = snap;
      if (PARAMS.some(([a2, b2]) => play(lv, from, makeBot(a2, b2)).mode === 'won')) {
        resumed++;
        lvResumed++;
      }
    }
  }
  const okL = lvLanded === 0 || lvResumed > 0;
  levelRows.push({ name: `L${n} 落在荷葉後從存檔重生能破關`, ok: okL, line: `L${n} 落在荷葉 ${lvLanded} 次，從存檔重生後破關 ${lvResumed} 次` });
}
const summary = `pads=${padsTotal} bot-landings=${landed} resumed=${resumeTries} resumed-and-won(12 組 bot 任一組破)=${resumed}`;

describe('1／3. 從每一座荷葉重生：站在荷葉上、破得了、周圍乾淨', () => {
  it('61–75 有荷葉', () => {
    expect(padsTotal > 0, `FAIL 61–75 沒有任何荷葉 ${summary}`).toBe(true);
  });
  for (const r of padRows)
    it(r.name, () => {
      expect(r.ok, r.line).toBe(true);
    });
});

describe('2. 笨拙玩家落在荷葉上 → 存檔 → 從存檔重生', () => {
  it('有 bot 落在荷葉上（有接上）', () => {
    expect(landed > 0, `FAIL 沒有任何 bot 落在荷葉上（沒接上） ${summary}`).toBe(true);
  });
  for (const r of levelRows)
    it(r.name, () => {
      expect(r.ok, r.line).toBe(true);
    });
});

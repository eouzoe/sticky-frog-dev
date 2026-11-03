// 加速圈安全量尺：12 組 bot × 61–75 關，統計「被加速圈推過之後 1.5 秒內死亡」的次數，必須 0（比照 tests/burst.test.ts）；同時印 bot 實際穿過加速圈的次數，必須 > 0（證明有接上）。
// 原腳本的三種模式都跑：
//   正式      有死亡、或沒有任何 bot 穿過 → 失敗
//   --plant   自我驗證：在每顆加速圈的出口路徑上故意放尖刺，量尺必須報 >0（抓得到）
//   --noboost 拿掉所有加速圈，61–75 每關仍然要破得了（unsolved=0）
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNE as T } from '../src/config.ts';
import { generateLevel } from '../src/level.ts';
import { createSim, step } from '../src/sim.ts';
import { makeBot } from '../src/bot.ts';
import { PARAMS } from './helpers/sim.ts';

const LONG = 600_000;

function measure({ plant = false, noboost = false } = {}) {
  let passes = 0,
    deaths = 0,
    boosts = 0,
    unsolved = 0;
  const rows: string[] = [],
    winLines: string[] = [];
  for (let n = 61; n <= 75; n++) {
    const lv = generateLevel(n);
    boosts += lv.boosts.filter((b) => !b.off).length;
    if (noboost) lv.boosts.length = 0;
    if (plant) for (const b of lv.boosts) if (!b.off) for (let k = 3; k <= 11; k += 2) lv.spikes.push({ x: b.x + b.dx * k, y: b.y + b.dy * k, r: 0.95, hang: true });
    let wins = 0;
    for (const [rel, gv] of PARAMS) {
      const s = createSim(lv),
        bot = makeBot(rel, gv);
      let last = -99;
      while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
        step(s, T.DT, bot(s));
        for (const e of s.events)
          if (e.type === 'boost') {
            last = s.t;
            passes++;
          }
        s.events.length = 0;
      }
      if (s.mode === 'won') wins++;
      if (s.mode === 'dead' && s.t - last <= 1.5) {
        deaths++;
        rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - last).toFixed(2)}`);
      }
    }
    if (wins === 0) unsolved++;
    if (noboost) winLines.push(`L${n} WIN ${wins}/${PARAMS.length}`);
  }
  const summary = `boosts=${boosts} bot-passes=${passes} deaths-within-1.5s=${deaths}${noboost ? ` unsolved=${unsolved}` : ''}\n${rows.slice(0, 20).join('\n')}`;
  return { passes, deaths, boosts, unsolved, summary, winLines };
}

describe('正式：被加速圈推過之後 1.5 秒內不會死', () => {
  let r: ReturnType<typeof measure>;
  beforeAll(() => {
    r = measure();
  }, LONG);
  it('bot 有實際穿過加速圈（passes > 0）', () => {
    expect(r.passes > 0, r.summary).toBe(true);
  });
  it('推過之後 1.5 秒內死亡 = 0', () => {
    expect(r.deaths === 0, r.summary).toBe(true);
  });
});

describe('--plant 自我驗證：出口路徑放尖刺，量尺要抓得到', () => {
  it('deaths > 0', { timeout: LONG }, () => {
    const r = measure({ plant: true });
    expect(r.deaths > 0, r.summary).toBe(true);
  });
});

describe('--noboost：拿掉所有加速圈，61–75 每關仍然破得了', () => {
  it('unsolved = 0', { timeout: LONG }, () => {
    const r = measure({ noboost: true });
    expect(r.unsolved === 0, `${r.summary}\n${r.winLines.join('\n')}`).toBe(true);
  });
});

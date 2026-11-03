// 噴泉安全量尺：12 組 bot 參數 × 46–60 關，統計「被噴發中的噴泉推過之後 1.5 秒內死亡」的次數，必須 0。
// 原腳本的兩種模式都跑：
//   正式     有死亡 → 失敗
//   --plant  自我驗證：在每座噴泉正上方故意放尖刺，量尺必須報 >0（抓得到）
import { describe, expect, it } from 'vitest';
import { TUNE as T } from '../src/config.ts';
import { generateLevel } from '../src/level.ts';
import { createSim, step, burstOn } from '../src/sim.ts';
import { makeBot } from '../src/bot.ts';
import { PARAMS } from './helpers/sim.ts';

const LONG = 600_000;

function measure(plant: boolean) {
  let pushes = 0,
    deaths = 0,
    bursts = 0;
  const rows: string[] = [];
  for (let n = 46; n <= 60; n++) {
    const lv = generateLevel(n);
    bursts += lv.fans.filter((f) => f.burst).length;
    if (plant) for (const f of lv.fans) if (f.burst) for (let k = 0; k < 4; k++) lv.spikes.push({ x: f.x, y: f.y0 + 3 + k * 2.4, r: 0.95, hang: true });
    for (const [rel, gv] of PARAMS) {
      const s = createSim(lv),
        bot = makeBot(rel, gv);
      let last = -99,
        pushed = false;
      while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
        step(s, T.DT, bot(s));
        const burst = s.fanIn >= 0 ? lv.fans[s.fanIn].burst : undefined;
        if (burst && burstOn(burst, s.t)) {
          last = s.t;
          if (!pushed) {
            pushed = true;
            pushes++;
          }
        }
      }
      if (s.mode === 'dead' && s.t - last <= 1.5) {
        deaths++;
        rows.push(`L${n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - last).toFixed(2)}`);
      }
    }
  }
  const summary = `burst fans=${bursts} runs-pushed=${pushes} deaths-within-1.5s=${deaths}\n${rows.slice(0, 20).join('\n')}`;
  return { pushes, deaths, bursts, summary };
}

describe('正式：被噴發中的噴泉推過之後 1.5 秒內不會死', () => {
  it('deaths = 0', { timeout: LONG }, () => {
    const r = measure(false);
    expect(r.deaths === 0, r.summary).toBe(true);
  });
});

describe('--plant 自我驗證：噴泉正上方放尖刺，量尺要抓得到', () => {
  it('deaths > 0', { timeout: LONG }, () => {
    const r = measure(true);
    expect(r.deaths > 0, r.summary).toBe(true);
  });
});

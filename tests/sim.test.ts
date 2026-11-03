// 自動玩家：驗證 60 關都破得了（只要有一組參數能破就算可破），順便量完成時間校正 3 星門檻。
// 用法：bun x vitest run tests/sim.test.ts；只跑幾關：SIM_LEVELS="3 17" bun x vitest run tests/sim.test.ts
// run／PARAMS／makeBot 搬到 tests/helpers/sim.ts（boost／burst／dune／pad／ring-score 共用）。
import { describe, expect, it, vi } from 'vitest';
import { generateLevel, LEVEL_COUNT } from '../src/level.ts';
import { makeBot, PARAMS, run } from './helpers/sim.ts';
declare const process: { env: Record<string, string | undefined> }; // 測試在 Node 跑；不為這一行裝 @types/node

vi.setConfig({ testTimeout: 600_000 });

const only = (process.env.SIM_LEVELS ?? '').split(/\s+/).filter(Boolean).map(Number);
const list = only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);

describe('每一關至少有一組 bot 參數破得了', () => {
  for (const n of list) {
    it(`L${n}`, () => {
      const lv = generateLevel(n);
      let best: { time: number; rel: number; gv: number; flips: number; flies: number } | null = null,
        wins = 0;
      const causes: Record<string, number> = {};
      for (const [rel, gv] of PARAMS) {
        const s = run(n, makeBot(rel, gv));
        if (s.mode === 'won') {
          wins++;
          if (!best || s.time < best.time) best = { time: s.time, rel, gv, flips: s.flipsTotal, flies: s.fliesGot };
        } else causes[s.cause ?? 'timeout'] = (causes[s.cause ?? 'timeout'] ?? 0) + 1;
      }
      const line =
        `L${String(n).padStart(2)} len=${lv.length.toFixed(0).padStart(3)} hooks=${lv.hooks.length} par=${lv.par} flies=${lv.flies.length} ` +
        (best ? `WIN ${wins}/${PARAMS.length} best=${best.time.toFixed(1)}s rel=${best.rel} gv=${best.gv} flips=${best.flips} flies=${best.flies}` : `FAIL`) +
        ` ${JSON.stringify(causes)}`;
      expect(best !== null, line).toBe(true);
    });
  }
});

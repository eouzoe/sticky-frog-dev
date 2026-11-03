// 自動玩家共用：跑一關、12 組 bot 參數（原 tests/sim-check.mjs 的匯出，給 boost／burst／dune／pad／ring-score 共用）。
import { TUNE as T } from '../../src/config.ts';
import { generateLevel } from '../../src/level.ts';
import { createSim, step } from '../../src/sim.ts';
import { makeBot, type Bot } from '../../src/bot.ts';
import type { Sim } from '../../src/types.ts';

export { makeBot };

export function run(n: number, bot: Bot, maxT = 90): Sim {
  const s = createSim(generateLevel(n));
  while (s.t < maxT && s.mode !== 'dead' && s.mode !== 'won') step(s, T.DT, bot(s));
  return s;
}

export type BotParam = readonly [rel: number, gv: number];
export const PARAMS: BotParam[] = [];
for (const rel of [0.25, 0.4, 0.55, 0.7]) for (const gv of [-2, 2, 6]) PARAMS.push([rel, gv]);

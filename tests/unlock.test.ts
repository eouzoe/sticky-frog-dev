// 掃 generateLevel：每個基本元素第一次出現的關卡必須等於 UNLOCK 表（NEW 字卡的依據）。
import { describe, expect, it } from 'vitest';
import { generateLevel, LEVEL_COUNT, NEW_AT, type ElementId } from '../src/level.ts';
import type { Level } from '../src/types.ts';

// 只有用幾何能辨識的元素才掃；mushChain／ringArc／tunnel 用特徵：連續蘑菇＝同 y=2 的相鄰蘑菇、雙圈＝同段兩圈 x 差 <4、夾擊＝同 x 的 pole＋hang
function seen(L: Level): Record<ElementId, boolean> {
  return {
    mush: L.mush.some((m) => m.y > 2.01 || m.y < 1.99),
    swarm: false, // 蒼蠅串與一般蒼蠅幾何上分不開，靠 UNLOCK 表（下面跳過不比）
    ring: L.rings.length > 0,
    move: L.hooks.some((h) => h.move),
    fan: L.fans.length > 0,
    saw: L.saws.length > 0,
    tunnel: L.spikes.some((a) => a.pole && L.spikes.some((b) => b.hang && Math.abs(a.x - b.x) < 1e-9)),
    spikeLow: L.spikes.some((a) => a.pole && !L.spikes.some((b) => b.hang && Math.abs(a.x - b.x) < 1e-9)),
    spikeHigh: L.spikes.some((a) => a.hang && !L.spikes.some((b) => b.pole && Math.abs(a.x - b.x) < 1e-9)),
    mushChain: L.mush.filter((m) => m.y === 2).length >= 2,
    ringArc: L.rings.some((a) => L.rings.some((b) => a !== b && Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) > 1.5 && Math.abs(a.y - b.y) < 2.5)),
    pad: L.pads.length > 0,
    boost: L.boosts.some((b) => !b.off),
    dune: L.dunes.some((d) => !d.off),
  };
}
const first: Partial<Record<ElementId, number>> = {};
for (let n = 1; n <= LEVEL_COUNT; n++) {
  const o = seen(generateLevel(n));
  for (const k of Object.keys(o) as ElementId[]) if (o[k] && first[k] === undefined) first[k] = n;
}

describe('元素第一次出現的關卡 = NEW_AT 表', () => {
  for (const k of Object.keys(NEW_AT) as ElementId[]) {
    if (k === 'swarm') continue; // 蒼蠅串與一般蒼蠅幾何上分不開，靠 UNLOCK 表
    it(`${k.padEnd(9)} 表=${NEW_AT[k]}`, () => {
      expect(first[k] === NEW_AT[k], `${k.padEnd(9)} 表=${NEW_AT[k]} 掃到第一次=${first[k]}`).toBe(true);
    });
  }
});

// 畫質分級的純邏輯檢查：開局訊號 → 級別、自動調整的降／升／禁止反覆。
import { describe, expect, it } from 'vitest';
import { pickTier, createGovernor, TIERS, ORDER, type Governor, type TierName, type TierPick } from '../src/quality.ts';

const pick = (o: { coarse: boolean; cores: number; mem: number }) => pickTier({ search: '', ...o }).tier;
// createGovernor 的參數型別要 max，但它自己有 max='high' 的預設值；原腳本就是省略 max，這裡照舊省略
const gov = (p: Partial<TierPick> & Pick<TierPick, 'tier'>) => createGovernor(p as TierPick);

describe('開局訊號 → 級別', () => {
  it('強桌機 → high', () => {
    expect(pick({ coarse: false, cores: 12, mem: 8 })).toBe('high');
  });
  it('4 核桌機 → mid', () => {
    expect(pick({ coarse: false, cores: 4, mem: 8 })).toBe('mid');
  });
  it('iPhone 類（沒有 deviceMemory）→ mid', () => {
    expect(pick({ coarse: true, cores: 8, mem: 0 })).toBe('mid');
  });
  it('4GB 安卓 → low', () => {
    expect(pick({ coarse: true, cores: 8, mem: 4 })).toBe('low');
  });
  it('4 核手機 → low', () => {
    expect(pick({ coarse: true, cores: 4, mem: 8 })).toBe('low');
  });
  it('?q= 強制', () => {
    expect(pickTier({ search: '?q=mid', coarse: false, cores: 12, mem: 8 }).forced).toBe(true);
  });
  it('手機最高 mid', () => {
    expect(pickTier({ coarse: true, cores: 8, mem: 8, search: '' }).max).toBe('mid');
  });
  for (const k of ORDER)
    it(`${k} 欄位齊全`, () => {
      expect(TIERS[k].dpr > 0 && TIERS[k].fx > 0).toBe(true);
    });
});

const run = (g: Governor, fpsList: number[]) => fpsList.map((f) => g.tick(f));
const nulls = (xs: (TierName | null)[]) => xs.every((x) => x === null);

describe('降：單秒 20 fps 立刻降；連續 2 秒 45 fps 降；單秒 45 fps 不降', () => {
  it('單秒 < 36 立刻降', () => {
    const g = gov({ tier: 'high' });
    expect(g.tick(20)).toBe('mid');
  });
  it('45 不連續 → 不降', () => {
    const g = gov({ tier: 'high' });
    expect(run(g, [45, 60, 45])).toEqual([null, null, null]);
  });
  it('連續 2 秒 < 48 → 降', () => {
    const g = gov({ tier: 'high' });
    expect(run(g, [45, 45])).toEqual([null, 'mid']);
  });
  it('low 不會再降', () => {
    expect(gov({ tier: 'low' }).tick(10)).toBe(null);
  });
});

describe('升：19 秒好不升，第 20 秒好且距離上次換級 ≥ 30 才升', () => {
  it('30 秒內不升；開局 30 秒後且連續 20 秒好 → 升', () => {
    const g = gov({ tier: 'mid', max: 'high' });
    const seq = Array(29).fill(60);
    expect(nulls(run(g, seq)), '30 秒內不升').toBe(true);
    expect(g.tick(60), '開局 30 秒後且連續 20 秒好 → 升').toBe('high');
  });
  it('到達 max 不再升', () => {
    const g = gov({ tier: 'mid', max: 'mid' });
    expect(nulls(run(g, Array(100).fill(60)))).toBe(true);
  });
});

describe('升上去 25 秒內又掉 → 禁止，之後再怎麼好都不升回去', () => {
  it('升上去馬上掉 → 降；high 被禁止，不再升回', () => {
    const g = gov({ tier: 'mid', max: 'high' });
    run(g, Array(30).fill(60)); // 第 30 秒升到 high
    expect(g.tier).toBe('high');
    expect(g.tick(20), '升上去馬上掉 → 降').toBe('mid');
    expect(nulls(run(g, Array(200).fill(60))), 'high 被禁止，不再升回').toBe(true);
  });
});

describe('forced 不動', () => {
  it('強制級別不自動調整', () => {
    const g = gov({ tier: 'high', forced: true });
    expect(nulls(run(g, Array(10).fill(5)))).toBe(true);
  });
});

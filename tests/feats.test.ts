// 成就偵測模組：每種成就各餵一段「達成」與「差一點沒達成」的事件序列。
import { describe, expect, it } from 'vitest';
import { FEAT_T as K, FEATS, createFeatTracker, recordFeat, type FeatHit, type FeatRecord } from '../src/feats.ts';
import { TUNE as T } from '../src/config.ts';
import type { Sim, SimEvent } from '../src/types.ts';

const W = T.WATER_Y + 0.15;
// 測試只餵成就模組會看的欄位，手寫的關卡／狀態物件用 Partial 再斷言成 Sim（createFeatTracker 只碰 mode/x/y/vx/vy/attaches/time/onDune/level）
type FakeLevel = { endless: boolean; start: { x: number }; goal: { x: number }; dunes?: { x0: number; x1: number; H: number; lip: boolean }[] };
type FakeSim = { mode: string; x: number; y: number; vx: number; vy: number; attaches: number; time: number; level: FakeLevel; onDune?: number };
type Patch = Partial<FakeSim>;
type Step = [Patch, SimEvent | null];
const lv = (len = 100): FakeLevel => ({ endless: false, start: { x: 0 }, goal: { x: len } });
const sim = (o: Patch = {}): FakeSim => ({ mode: 'air', x: 0, y: 8, vx: 20, vy: 0, attaches: 3, time: 5, level: lv(), ...o });

const ids = (arr: FeatHit[]) => arr.filter((f) => !f.silent).map((f) => f.id);
// 跑一段：steps＝[[sim 欄位, 事件|null], …]，回傳全部達成的 id
function play(steps: Step[], s0: FakeSim = sim()): string[] {
  const ft = createFeatTracker(),
    got: string[] = [],
    s = { ...s0 };
  for (const [patch, e] of steps) {
    Object.assign(s, patch);
    got.push(...ids(ft.tick(s as unknown as Sim, 1 / 120)));
    if (e) got.push(...ids(ft.event(e, s as unknown as Sim)));
  }
  return got;
}
// 原腳本的 check(name, want, got)：JSON 字串相等
const same = (want: unknown, got: unknown) => JSON.stringify(want) === JSON.stringify(got);
const msg = (want: unknown, got: unknown) => `→ ${JSON.stringify(got)} (want ${JSON.stringify(want)})`;

describe('spin／tornado', () => {
  const flips = (n: number) => play(Array.from({ length: n }, (_, i): Step => [{}, { type: 'flip', n: i + 1, x: 0, y: 0 }]));
  it('spin 達成（K.SPIN 圈）', () => {
    const got = flips(K.SPIN);
    expect(same(['spin'], got), msg(['spin'], got)).toBe(true);
  });
  it('spin 差一點', () => {
    const got = flips(K.SPIN - 1);
    expect(same([], got), msg([], got)).toBe(true);
  });
  it('tornado 達成（K.TORNADO 圈，spin 只跳一次）', () => {
    const got = flips(K.TORNADO);
    expect(same(['spin', 'tornado'], got), msg(['spin', 'tornado'], got)).toBe(true);
  });
  it('tornado 差一點', () => {
    const got = flips(K.TORNADO - 1);
    expect(same(['spin'], got), msg(['spin'], got)).toBe(true);
  });
});

// flow：停滯總秒數
const fast: Step[] = Array.from({ length: 600 }, (): Step => [{ vx: 20 }, null]);
const slow = (sec: number): Step[] => Array.from({ length: Math.round(sec * 120) }, (): Step => [{ vx: 3 }, null]);
const win: Step[] = [[{}, { type: 'win', x: 0, y: 0, vx: 0, vy: 0 }]];

describe('flow：停滯總秒數', () => {
  it('flow 達成（停滯 0.05 秒）', () => {
    const got = play([...fast, ...slow(0.05), ...fast, ...win], sim({ time: 99 }));
    expect(same(['flow'], got), msg(['flow'], got)).toBe(true);
  });
  it('flow 差一點（停滯 0.15 秒）', () => {
    const got = play([...fast, ...slow(0.15), ...fast, ...win], sim({ time: 99 }));
    expect(same([], got), msg([], got)).toBe(true);
  });
});

describe('speed：平均速度＝長度／時間', () => {
  it('speed 達成', () => {
    const got = play(win, sim({ time: 100 / (K.SPEED + 0.2) })).filter((id) => id === 'speed');
    expect(same(['speed'], got), msg(['speed'], got)).toBe(true);
  });
  it('speed 差一點', () => {
    const got = play(win, sim({ time: 100 / (K.SPEED - 0.2) })).filter((id) => id === 'speed');
    expect(same([], got), msg([], got)).toBe(true);
  });
});

// skim：掉到離落水線 SKIM_Y 以內又飛回去
const dip = (low: number): Step[] => [
  [{ y: W + 2.5, vx: 3 }, null],
  [{ y: W + low }, null],
  [{ y: W + 2 }, null],
  [{ y: W + K.SKIM_BACK + 0.5 }, null],
];

describe('skim：掉到離落水線 SKIM_Y 以內又飛回去', () => {
  it('skim 達成', () => {
    const got = play(dip(K.SKIM_Y - 0.1));
    expect(same(['skim'], got), msg(['skim'], got)).toBe(true);
  });
  // 沙丘上方不是水：同樣的低飛，level 有沙丘蓋住那個 x 就不算，沒有就照算
  it('skim：低飛在沙丘上方不算 WAVE KISSER', () => {
    const sandLv: FakeLevel = { ...lv(), dunes: [{ x0: -5, x1: 5, H: 2, lip: false }] };
    const got = play(dip(K.SKIM_Y - 0.1).map(([p, e]): Step => [{ ...p, level: sandLv }, e]));
    expect(same([], got), msg([], got)).toBe(true);
  });
  it('skim 差一點（太高）', () => {
    const got = play(dip(K.SKIM_Y + 0.1));
    expect(same([], got), msg([], got)).toBe(true);
  });
  it('skim 沒救回來（落水）', () => {
    const got = play([
      [{ y: W + 2.5 }, null],
      [{ y: W + 0.1 }, null],
      [{ mode: 'dead' }, { type: 'die', cause: 'water', x: 0, y: 0, vx: 0, vy: 0 }],
      [{ mode: 'air', y: 9 }, null],
    ]);
    expect(same([], got), msg([], got)).toBe(true);
  });
});

describe('shave：擦過危險物的最近距離', () => {
  it('shave 達成', () => {
    const got = play([[{}, { type: 'close', gap: K.SHAVE - 0.02, x: 0, y: 0 }]]);
    expect(same(['shave'], got), msg(['shave'], got)).toBe(true);
  });
  it('shave 差一點', () => {
    const got = play([[{}, { type: 'close', gap: K.SHAVE + 0.02, x: 0, y: 0 }]]);
    expect(same([], got), msg([], got)).toBe(true);
  });
});

describe('紀錄、滑沙不算停下、涵蓋', () => {
  // 紀錄：第一次日期、最佳值、次數
  it('紀錄：首次日期本地、最佳取小、次數', () => {
    const rec: Record<string, FeatRecord> = {};
    recordFeat(rec, 'shave', 0.1, new Date(2026, 9, 26));
    recordFeat(rec, 'shave', 0.05);
    recordFeat(rec, 'shave', 0.2);
    const want = { first: '2026-10-26', best: 0.05, count: 3 };
    expect(same(want, rec.shave), msg(want, rec.shave)).toBe(true);
  });
  // 滑沙不算停下：同樣停滯 0.2 秒的速度（< STALL_V），貼著沙面（onDune ≥ 0）不計、離開沙面照算
  it('NONSTOP：滑沙中速度低於門檻不算停滯', () => {
    const got = play([...fast, ...slow(0.2).map(([p, e]): Step => [{ ...p, onDune: 0 }, e]), ...fast, ...win], sim({ time: 99 }));
    expect(same(['flow'], got), msg(['flow'], got)).toBe(true);
  });
  it('NONSTOP：同樣的低速離開沙面就算停滯', () => {
    const got = play([...fast, ...slow(0.2).map(([p, e]): Step => [{ ...p, onDune: -1 }, e]), ...fast, ...win], sim({ time: 99 }));
    expect(same([], got), msg([], got)).toBe(true);
  });
  it('每種成就都有測到', () => {
    const got = FEATS.every((f) => ['spin', 'tornado', 'flow', 'speed', 'skim', 'shave'].includes(f.id)) && FEATS.length === 6;
    expect(same(true, got), msg(true, got)).toBe(true);
  });
});

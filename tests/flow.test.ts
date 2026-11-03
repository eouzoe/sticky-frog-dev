// 流程狀態機：一局之內的轉移、非法動作被忽略、暫停回到原來的節拍。
import { describe, expect, it } from 'vitest';
import { transition, BOOT_FLOW, RUN, type Action, type Flow, type Phase } from '../src/flow.ts';

// 連續動作：每一步都要合法，回最後的狀態
const run = (f: Flow, ...acts: Action[]): Flow => {
  for (const a of acts) {
    const n = transition(f, a);
    if (!n) throw new Error(`${f.phase} + ${a} 不合法`);
    f = n;
  }
  return f;
};
const phases = (f0: Flow, ...acts: Action[]): string[] => {
  const out: string[] = [];
  let f: Flow | null = f0;
  for (const a of acts) {
    f = transition(f, a);
    if (!f) return out.concat('null');
    out.push(f.phase);
  }
  return out;
};
const at = (phase: Phase, extra: Partial<Flow> = {}): Flow => ({ ...BOOT_FLOW, phase, ...extra });

describe('流程狀態機', () => {
  it('開機 → 選單 → 開關 → 死亡 → 重生 → 過關 → 下一關', () => {
    expect(phases(BOOT_FLOW, 'ready', 'start', 'die', 'beatEnd', 'win', 'beatEnd').join()).toBe('menu,playing,dying,playing,cleared,playing');
  });
  it('最後一關過關 → 回選單', () => {
    expect(run(BOOT_FLOW, 'ready', 'startLast', 'win', 'beatEnd').phase).toBe('menu');
  });
  it('不是最後一關 → 下一關仍在遊玩', () => {
    expect(run(BOOT_FLOW, 'ready', 'start', 'win', 'beatEnd').phase).toBe('playing');
  });
  it('無盡：死亡直接進結算（不是 dying）、倒數完新一局仍是無盡', () => {
    const f = run(BOOT_FLOW, 'ready', 'startEndless', 'die');
    const g = transition(f, 'beatEnd');
    expect(f.phase === 'over' && f.endless && g?.phase === 'playing' && g.endless).toBe(true);
  });
  it('無盡沒有過關', () => {
    expect(transition(run(BOOT_FLOW, 'ready', 'startEndless'), 'win')).toBe(null);
  });
  it('死亡中再死、過關中再撞：忽略', () => {
    expect((['dying', 'cleared', 'over'] as const).every((p) => transition(at(p), 'die') === null && transition(at(p), 'win') === null)).toBe(true);
  });
  it('遊玩中沒有節拍可以結束', () => {
    expect(transition(at('playing'), 'beatEnd')).toBe(null);
  });
  it('開機前不能開關、開機後不能再 ready', () => {
    expect(transition(BOOT_FLOW, 'start') === null && transition(at('menu'), 'ready') === null).toBe(true);
  });
  it('暫停只在一局之內；繼續回到暫停前的節拍', () => {
    expect(
      [...RUN].every((p) => {
        const f = transition(at(p), 'pause');
        return f?.phase === 'paused' && f.prev === p && transition(f, 'resume')?.phase === p;
      }) && (['menu', 'levels', 'shop', 'paused'] as const).every((p) => transition(at(p), 'pause') === null),
    ).toBe(true);
  });
  it('過關節拍中暫停、繼續、節拍播完 → 下一關', () => {
    expect(phases(at('playing'), 'win', 'pause', 'resume', 'beatEnd').join()).toBe('cleared,paused,cleared,playing');
  });
  it('結算提前：節拍中直接開一關（從選關／重來）', () => {
    expect((['cleared', 'over', 'dying', 'paused'] as const).every((p) => transition(at(p, { endless: true }), 'start')?.endless === false)).toBe(true);
  });
  it('任何畫面都能回選單、開機中不行', () => {
    expect((['menu', 'playing', 'paused', 'cleared', 'over', 'levels'] as const).every((p) => transition(at(p), 'menu')?.phase === 'menu') && transition(BOOT_FLOW, 'menu') === null).toBe(true);
  });
  it('transition 不改輸入', () => {
    const f = at('playing');
    transition(f, 'die');
    expect(f.phase).toBe('playing');
  });
});

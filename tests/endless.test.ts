// 無盡模式：自動玩家（12 組參數）接力在 N 個種子上跑，每個種子都要接力到 TARGET 單位才算過。
// 證明產生器隨距離升難度時不會吐出不可能的段落（至少到 TARGET；難度上限＝第 60 關，sim.test 已驗過同一個段落產生器）。
// 方法見下面「接力」註解。
// 環境變數：ENDLESS_SEEDS（種子數，預設 12）、ENDLESS_TARGET、ENDLESS_CAP。
import { describe, expect, it, vi } from 'vitest';
import { TUNE as T } from '../src/config.ts';
import { createEndless, extendEndless, endlessDiff, endlessWorld, ENDLESS_WORLD_LEN } from '../src/level.ts';
import { createSim, step } from '../src/sim.ts';
import { makeBot } from '../src/bot.ts';
import type { Sim } from '../src/types.ts';
declare const process: { env: Record<string, string | undefined> }; // 測試在 Node 跑；不為這一行裝 @types/node

vi.setConfig({ testTimeout: 600_000 });

const TARGET = Number(process.env.ENDLESS_TARGET ?? 4 * ENDLESS_WORLD_LEN); // 預設跑完四個世界（1800 單位，難度 0.12 → 0.81）；ENDLESS_TARGET=2800 ENDLESS_CAP=90 會一路接力穿過沙丘世界那一段（2250–2700）
const CAP = Number(process.env.ENDLESS_CAP ?? 75);
const SEEDS = Number(process.env.ENDLESS_SEEDS ?? 12);
const PARAMS: [number, number][] = [];
for (const rel of [0.25, 0.4, 0.55, 0.7]) for (const gv of [-2, 2, 6]) PARAMS.push([rel, gv]);

// 接力：從「前線」狀態讓 12 組參數各跑一段（直到死或再前進 LEG 單位），取最遠且活著的狀態當新前線。
// 前線保留 6 個不同狀態；全部前線 × 12 組參數都死在同一段＝那裡可能是不可能段落 → 失敗。單一參數一路跑到底太嚴（等於連破好幾關不換手），接力等於「存在一條每段都有人走得過的路」。
const LEG = 60,
  BEAM = 6;
const clone = (s: Sim): Sim => ({ ...structuredClone({ ...s, level: null }), level: s.level });
const alive = (s: Sim) => s.mode !== 'dead'; // 用函式而不是直接比較：step() 會改 s.mode，直接比較會被 TS 的流程分析窄化而報錯

describe('接力：每個種子都要接力到 TARGET', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    it(`seed ${String(seed).padStart(2)}`, () => {
      const L = createEndless(seed, CAP); // 預設打過第 75 關：荷葉（63）、加速圈（69）都學過了；CAP=90 連沙丘（76）也學過
      let beam = [createSim(L)],
        legs = 0,
        stuck: number | null = null;
      while (beam[0].maxX < TARGET) {
        const next: Sim[] = [];
        for (const front of beam)
          for (const p of PARAMS) {
            const s = clone(front),
              bot = makeBot(...p),
              goal = front.maxX + LEG,
              t0 = s.t;
            while (s.mode !== 'dead' && s.maxX < goal && s.t - t0 < 30) {
              if (L.gen!.x < s.x + 120) extendEndless(L, s.x + 250); // 遊戲端同一個規則
              step(s, T.DT, bot(s));
              s.events.length = 0;
            }
            // 只收「黏在鉤點上、正在擺」的狀態當新前線（下一段的玩家從可控的狀態接手）
            if (alive(s) && s.maxX >= goal) {
              while (alive(s) && s.tongue.state !== 'stuck' && s.t - t0 < 40) {
                step(s, T.DT, bot(s));
                s.events.length = 0;
              }
              if (alive(s)) next.push(s);
            }
          }
        if (!next.length) {
          stuck = beam[0].maxX;
          break;
        }
        // 保留 BEAM 個不同鉤點上的狀態（貪心只留最遠的一個會走進死胡同）
        next.sort((a, b) => b.maxX - a.maxX);
        beam = [];
        for (const s of next) if (beam.length < BEAM && !beam.some((o) => o.tongue.hook === s.tongue.hook && Math.abs(o.x - s.x) < 1)) beam.push(s);
        legs++;
      }
      const front = beam[0];
      // 參考：單一參數一路不換手能跑多遠
      let soloBest = 0;
      for (const p of PARAMS) {
        const L2 = createEndless(seed, 75),
          s = createSim(L2),
          bot = makeBot(...p);
        while (s.mode !== 'dead' && s.maxX < TARGET && s.t < 600) {
          if (L2.gen!.x < s.x + 120) extendEndless(L2, s.x + 250);
          step(s, T.DT, bot(s));
          s.events.length = 0;
        }
        soloBest = Math.max(soloBest, s.maxX);
      }
      const ok = stuck === null;
      const line = `seed ${String(seed).padStart(2)} ${ok ? `OK reached ${front.maxX.toFixed(0)} in ${legs} legs` : `FAIL all 12 bots die after x=${stuck!.toFixed(0)} (diff ${endlessDiff(stuck!).toFixed(2)})`} target=${TARGET} (single-param best run reached ${soloBest.toFixed(0)})`;
      expect(ok, line).toBe(true);
    });
  }
});

describe('元素上限、沙丘段落、世界輪替', () => {
  // 元素上限：cap=60 不出現荷葉／加速圈（沒在主線學過），cap=75 兩個都要出現（否則就是沒接上）
  it('無盡元素上限：cap60 荷葉＋加速圈=0、cap75 荷葉與加速圈都 >0（12 個種子）', () => {
    let lo = 0,
      p75 = 0,
      b75 = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const A = createEndless(seed, 60);
      extendEndless(A, TARGET);
      lo += A.pads.length + A.boosts.length;
      const B = createEndless(seed, 75);
      extendEndless(B, TARGET);
      p75 += B.pads.length;
      b75 += B.boosts.filter((b) => !b.off).length;
    }
    expect(lo === 0 && p75 > 0 && b75 > 0, `無盡元素上限 cap60 荷葉＋加速圈=${lo}（要 0）cap75 荷葉=${p75} 加速圈=${b75}（都要 >0）（12 個種子、到 ${TARGET}）`).toBe(true);
  });
  // 沙丘（76 關）：cap=75 的無盡不出現；cap=90 的無盡在第 6 個世界那一段（x 2250–2700）出現，而且只出現在那一段
  it('無盡沙丘：cap75=0、cap90 >0 且全部在沙丘世界那一段（12 個種子、到 3000）', () => {
    let d75 = 0,
      d90 = 0,
      outside = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const A = createEndless(seed, 75);
      extendEndless(A, 3000);
      d75 += A.dunes.length;
      const B = createEndless(seed, 90);
      extendEndless(B, 3000);
      d90 += B.dunes.filter((d) => !d.off).length;
      outside += B.dunes.filter((d) => endlessWorld(d.x0, 6) !== 5).length;
    }
    expect(d75 === 0 && d90 > 0 && outside === 0, `無盡沙丘 cap75=${d75}（要 0）cap90=${d90}（要 >0）不在沙丘世界段=${outside}（要 0）`).toBe(true);
  });
  // 輪替：預設前四個世界；count=5（打過第 60 關）冰峰（世界 4）要出現，而且四個世界時不會出現
  it('世界輪替：4 個世界不含冰峰、5 個世界含冰峰、6 個世界含沙丘', () => {
    const seq = (c: number) => Array.from({ length: c * 3 }, (_, i) => endlessWorld(i * ENDLESS_WORLD_LEN + 10, c));
    const ok4 = seq(4).every((w) => w >= 0 && w <= 3) && new Set(seq(4)).size === 4,
      ok5 = new Set(seq(5)).size === 5 && seq(5).includes(4),
      ok6 = new Set(seq(6)).size === 6 && seq(6).includes(5);
    expect(ok4 && ok5 && ok6, `世界輪替 4 個=${ok4} 5 個=${ok5} 6 個=${ok6}`).toBe(true);
  });
});

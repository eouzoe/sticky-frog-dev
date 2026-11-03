// 滑沙安全量尺：12 組 bot × 76–90 關，統計
//   碰到沙丘的 bot 數與次數、被 lip／背坡拋起的次數、
//   每次「落地」的滑行時間（落地＝空中（舌頭沒黏住）掉到沙面；滑行時間＝這次落地到離開沙面超過 0.6 秒為止，貼著沙面的累計秒數）、
//   碰到沙丘後 1.5 秒內死亡（任何死因）——必須 0、卡住（貼著沙面連續 STUCK_T 秒、前進不到 STUCK_DX 單位）——必須 0。
// 兩種 bot：一般 bot（makeBot，fbc7662 原版，看到鉤點就出舌）與滑沙 bot（makeSurfBot，追軌跡、在沙丘上方不出舌）。滑行量測用滑沙 bot；WIN 對照兩種都跑；--nodune、--times、--back 用一般 bot（較嚴）。
// 正式模式還要滿足（滑沙 bot）：6-1 落地滑行時間中位數 ≥ 2.0 秒、76–90 全部落地中位數 ≥ 1.5 秒、每關至少 9/12 組 bot 碰到沙丘、每關吃到軌跡拾取物的中位數 ≥ 該關軌跡總數的 70%、滑沙 bot 的 WIN ≥ 一般 bot 的 WIN −1。
// 原腳本的五種模式都跑：
//   正式       任何一條不成立 → 失敗
//   --plant    自我驗證：在每片沙丘的拋起路徑上故意放尖刺，量尺必須報死亡 > 0（抓得到）
//   --nodune   拿掉所有沙丘，76–90 每關仍然要破得了（unsolved=0）
//   --back     背面量尺：讓青蛙（12 組 bot 控制）從 lip 後面的背坡上方落下，1.5 秒內死亡必須 0
//   --times    每關最快的 bot 時間 vs 3 星門檻（par），必須每關都拿得到
// 突變驗證（_out/hook-hero/round2/w6/mutate-*.py）：拿掉速度下限 → 卡住 > 0；出口淨空守衛拿掉＋放尖刺 → 死亡 > 0；拿掉背坡拋起 → --back 死亡 > 0
import { beforeAll, describe, expect, it } from 'vitest';
import { TUNE as T } from '../src/config.ts';
import { generateLevel } from '../src/level.ts';
import { createSim, step, duneH } from '../src/sim.ts';
import { makeBot, makeSurfBot, type Bot } from '../src/bot.ts';
import type { Level } from '../src/types.ts';
import { PARAMS } from './helpers/sim.ts';

const LONG = 600_000;
const STUCK_T = 2.0,
  STUCK_DX = 1.5,
  WINDOW = 1.5,
  GAP = 0.6;
const med = (a: number[]) => {
  if (!a.length) return NaN;
  const b = [...a].sort((x, y) => x - y),
    m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};

// --back：從 lip 後面的背坡上方落下
function measureBack() {
  let runs = 0,
    deaths = 0,
    kicks = 0;
  const rows: string[] = [];
  for (let n = 76; n <= 90; n++) {
    const lv = generateLevel(n);
    for (const d of lv.dunes) {
      if (!d.lip || d.off) continue;
      for (const dx of [0.4, 1.4, 2.6, 3.8, 5.0])
        for (const vx of [2, 7, 12])
          for (const [rel, gv] of PARAMS) {
            const s = createSim(lv),
              bot = makeBot(rel, gv);
            Object.assign(s, { mode: 'air', started: true }); // 不用 s.mode = 'air'：TS 會把 s.mode 窄化成 'air'，下面的 !== 'dead' 就報錯
            s.tongue.state = 'idle';
            s.x = d.x1 + dx;
            s.vx = vx;
            s.vy = 0;
            s.y = duneH(d, s.x) + 3;
            runs++;
            while (s.t < 12 && s.mode !== 'dead' && s.mode !== 'won' && !(s.duneT > -90 && s.t - s.duneT > 2.2)) {
              step(s, T.DT, bot(s));
              for (const e of s.events) if (e.type === 'launch' && e.back) kicks++;
              s.events.length = 0;
            }
            if (s.mode === 'dead' && s.duneT > -90 && s.t - s.duneT <= WINDOW) {
              deaths++;
              if (rows.length < 20) rows.push(`L${n} dx=${dx} vx=${vx} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - s.duneT).toFixed(2)}`);
            }
          }
    }
  }
  const summary = `back-runs=${runs} back-kicks=${kicks} deaths-within-1.5s=${deaths}\n${rows.join('\n')}`;
  return { runs, deaths, kicks, summary };
}

const trailOf = (lv: Level) => lv.rings.map((r, i) => (r.trail !== undefined ? i : -1)).filter((i) => i >= 0);
// 一種 bot 跑一關：回傳 WIN、最快時間、落地／滑行／碰到／死亡／卡住／軌跡拾取物吃到的比例
function runBots(lv: Level, mk: (rel: number, gv: number) => Bot, trail: number[], rows: string[]) {
  const o = { wins: 0, best: Infinity, lan: 0, lau: 0, dth: 0, stk: 0, tch: 0, eps: [] as number[], fr: [] as number[] };
  for (const [rel, gv] of PARAMS) {
    const s = createSim(lv),
      bot = mk(rel, gv);
    let touchedHere = false,
      cT = 0,
      cX = 0,
      inC = false,
      gapT = 0,
      stuckHere = false,
      acc = 0,
      inEp = false,
      lastC = 0;
    while (s.t < 90 && s.mode !== 'dead' && s.mode !== 'won') {
      step(s, T.DT, bot(s));
      for (const e of s.events) {
        if (e.type === 'dune') {
          touchedHere = true;
          if (s.tongue.state !== 'stuck') {
            o.lan++;
            if (inEp) o.eps.push(acc);
            inEp = true;
            acc = 0;
            lastC = s.t;
          }
        } else if (e.type === 'launch') o.lau++;
      }
      s.events.length = 0;
      if (s.onDune >= 0) {
        if (inEp) {
          acc += T.DT;
          lastC = s.t;
        }
        if (!inC) {
          inC = true;
          cT = s.t;
          cX = s.x;
        }
        gapT = 0;
        if (s.t - cT >= STUCK_T) {
          if (s.x - cX < STUCK_DX && !stuckHere) {
            stuckHere = true;
            o.stk++;
            rows.push(`L${lv.n} rel=${rel} gv=${gv} 卡住 x=${s.x.toFixed(1)} t=${s.t.toFixed(1)}`);
          }
          cT = s.t;
          cX = s.x;
        }
      } else if (inC) {
        gapT += T.DT;
        if (gapT > GAP) inC = false;
      }
      if (inEp && s.t - lastC > GAP) {
        o.eps.push(acc);
        inEp = false;
      }
    }
    if (inEp) o.eps.push(acc);
    if (touchedHere || s.duneT > -90) o.tch++;
    if (s.mode === 'won') {
      o.wins++;
      o.best = Math.min(o.best, s.time);
    }
    if (s.mode === 'dead' && s.duneT > -90 && s.t - s.duneT <= WINDOW) {
      o.dth++;
      rows.push(`L${lv.n} rel=${rel} gv=${gv} cause=${s.cause} dt=${(s.t - s.duneT).toFixed(2)} x=${s.x.toFixed(1)}`);
    }
    if (trail.length) o.fr.push(trail.filter((i) => s.rings[i]).length / trail.length);
  }
  return o;
}

interface TimesRow {
  n: number;
  ok: boolean;
  line: string;
}
function measure({ plant = false, nodune = false, times = false } = {}) {
  let touched = 0,
    landings = 0,
    launches = 0,
    deaths = 0,
    stuck = 0,
    unsolved = 0,
    fields = 0,
    lowTouch = 0,
    lowRing = 0,
    harder = 0;
  const rows: string[] = [],
    allEp: number[] = [],
    ep1: number[] = [],
    lines: string[] = [],
    timesRows: TimesRow[] = [];
  for (let n = 76; n <= 90; n++) {
    const lv = generateLevel(n);
    fields += lv.dunes.filter((d) => d.lip && !d.off).length;
    const trail = trailOf(lv);
    if (nodune) lv.dunes.length = 0;
    if (plant)
      for (const d of lv.dunes)
        if (d.lip && !d.off)
          for (const [dx, dy] of [
            [3, 3],
            [5, 5],
            [7, 7],
            [9, 6],
            [11, 4],
          ])
            lv.spikes.push({ x: d.x1 + dx, y: d.H + dy, r: 0.95, hang: true });
    const norm = runBots(lv, makeBot, trail, rows),
      surf = nodune || times ? norm : runBots(lv, makeSurfBot, trail, rows);
    const nf = nodune || times ? 0 : med(surf.fr);
    if (norm.wins === 0 || (!nodune && !times && surf.wins === 0)) unsolved++;
    if (!nodune && !plant && !times && surf.tch < 9) lowTouch++;
    if (!nodune && !plant && !times && !(nf >= 0.7)) lowRing++;
    if (!nodune && !plant && !times && surf.wins < norm.wins - 1) harder++;
    touched += surf.tch;
    landings += surf.lan;
    launches += surf.lau;
    deaths += surf.dth;
    stuck += surf.stk;
    allEp.push(...surf.eps);
    if (n === 76) ep1.push(...surf.eps);
    const par = lv.par;
    if (times) {
      const ok = norm.best <= par;
      timesRows.push({ n, ok, line: `L${n} par=${par}s 最快 一般 bot=${norm.best.toFixed(1)}s` });
      if (!ok) unsolved++;
      continue;
    }
    lines.push(
      `L${n} fields=${lv.dunes.filter((d) => d.lip && !d.off).length} trail=${trail.length} 滑沙bot: touch=${String(surf.tch).padStart(2)}/12 landings=${String(surf.lan).padStart(3)} launches=${String(surf.lau).padStart(3)} slide-median=${med(surf.eps).toFixed(2)}s ring-median=${(nf * 100).toFixed(0)}% deaths=${surf.dth} stuck=${surf.stk} 最快=${surf.best.toFixed(1)}s | WIN 滑沙 ${surf.wins}/12 一般 ${norm.wins}/12 par=${par}s 一般最快=${norm.best.toFixed(1)}s`,
    );
  }
  const m1 = med(ep1),
    mAll = med(allEp);
  const summary =
    `fields=${fields} bots-touch=${touched} landings=${landings} launches=${launches} slides=${allEp.length} slide-median(6-1)=${m1.toFixed(2)}s slide-median(76-90)=${mAll.toFixed(2)}s levels-with-<9-bots=${lowTouch} levels-ring<70%=${lowRing} levels-surf-harder=${harder} deaths-within-1.5s=${deaths} stuck=${stuck}${nodune || times ? ` unsolved=${unsolved}` : ''}\n` +
    lines.join('\n') +
    '\n' +
    rows.slice(0, 30).join('\n');
  return { touched, landings, launches, deaths, stuck, unsolved, fields, lowTouch, lowRing, harder, m1, mAll, summary, timesRows };
}

describe('正式：滑沙 bot 的安全與手感量尺', () => {
  let r: ReturnType<typeof measure>;
  beforeAll(() => {
    r = measure();
  }, LONG);
  it('碰到沙丘後 1.5 秒內死亡 = 0', () => {
    expect(r.deaths === 0, r.summary).toBe(true);
  });
  it('卡住 = 0', () => {
    expect(r.stuck === 0, r.summary).toBe(true);
  });
  it('每關至少 9/12 組 bot 碰到沙丘', () => {
    expect(r.lowTouch === 0, r.summary).toBe(true);
  });
  it('每關吃到軌跡拾取物的中位數 ≥ 70%', () => {
    expect(r.lowRing === 0, r.summary).toBe(true);
  });
  it('滑沙 bot 的 WIN ≥ 一般 bot 的 WIN −1', () => {
    expect(r.harder === 0, r.summary).toBe(true);
  });
  it('有落地（landings > 0）', () => {
    expect(r.landings > 0, r.summary).toBe(true);
  });
  it('有被拋起（launches > 0）', () => {
    expect(r.launches > 0, r.summary).toBe(true);
  });
  it('6-1 落地滑行時間中位數 ≥ 2.0 秒', () => {
    expect(r.m1 >= 2.0, r.summary).toBe(true);
  });
  it('76–90 全部落地中位數 ≥ 1.5 秒', () => {
    expect(r.mAll >= 1.5, r.summary).toBe(true);
  });
});

describe('--plant 自我驗證：拋起路徑放尖刺，量尺要抓得到', () => {
  it('deaths > 0', { timeout: LONG }, () => {
    const r = measure({ plant: true });
    expect(r.deaths > 0, r.summary).toBe(true);
  });
});

describe('--nodune：拿掉所有沙丘，76–90 每關仍然破得了', () => {
  it('unsolved = 0', { timeout: LONG }, () => {
    const r = measure({ nodune: true });
    expect(r.unsolved === 0, r.summary).toBe(true);
  });
});

describe('--times：每關最快的一般 bot 時間 ≤ 3 星門檻（par）', () => {
  let r: ReturnType<typeof measure>;
  beforeAll(() => {
    r = measure({ times: true });
  }, LONG);
  for (let n = 76; n <= 90; n++)
    it(`L${n} 拿得到 3 星`, () => {
      const row = r.timesRows.find((x) => x.n === n);
      expect(row !== undefined && row.ok, row?.line ?? `L${n} 沒有量到`).toBe(true);
    });
  it('unsolved = 0', () => {
    expect(r.unsolved === 0, r.summary).toBe(true);
  });
});

describe('--back 背面量尺：從 lip 後面的背坡上方落下', () => {
  let r: ReturnType<typeof measureBack>;
  beforeAll(() => {
    r = measureBack();
  }, LONG);
  it('有被背坡拋起（kicks > 0）', () => {
    expect(r.kicks > 0, r.summary).toBe(true);
  });
  it('1.5 秒內死亡 = 0', () => {
    expect(r.deaths === 0, r.summary).toBe(true);
  });
});

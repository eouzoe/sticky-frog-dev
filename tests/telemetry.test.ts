// 遊玩數據：沒設網址＝完全不做事；事件欄位；排隊與分批；不送的情況；送出的批次要通過收資料端自己的驗證（server/telemetry/src/index.ts 的 validate）。
import { describe, expect, it } from 'vitest';
import { createTelemetry, type Telemetry, type TelemetryOptions } from '../src/telemetry.ts';
import { validate } from '../server/telemetry/src/validate.ts';

type Ev = Record<string, unknown> & { t: string };
interface Sent {
  u: string;
  b: { a: string; s: string; b: string; d: string; e: Ev[] };
}
interface Rig {
  sent: Sent[];
  timers: { f: () => void; ms: number }[];
  store: Record<string, string>;
  touched: number;
  clock: number;
  ap: boolean;
  ls: Pick<Storage, 'getItem' | 'setItem'>;
  uuid: () => string;
  tm: Telemetry;
}
function rig(over: Partial<TelemetryOptions> = {}): Rig {
  const r = { sent: [], timers: [], store: {}, touched: 0, clock: 1000, ap: false } as unknown as Rig;
  r.ls = {
    getItem: (k) => (r.touched++, r.store[k] ?? null),
    setItem: (k, v) => {
      r.touched++;
      r.store[k] = v;
    },
  };
  let n = 0;
  r.uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  r.tm = createTelemetry({
    url: 'https://t.example/e',
    build: 'abc123',
    host: 'www.crazygames.com',
    search: '',
    ls: r.ls,
    uuid: r.uuid,
    now: () => r.clock,
    send: (u, b) => {
      r.sent.push({ u, b: JSON.parse(b) });
      return true;
    },
    timer: (f, ms) => r.timers.push({ f, ms }),
    autoplay: () => r.ap,
    desktop: true,
    ...over,
  });
  return r;
}
const events = (r: Rig) => r.sent.flatMap((s) => s.b.e);

describe('1. 沒設網址：什麼都不做', () => {
  it('沒設網址：關閉、不送、不碰 localStorage、不掛計時器', () => {
    const r = rig({ url: '' });
    r.tm.bind(() => null);
    r.tm.notice(false, () => {});
    r.tm.menuReady(1, { lang: 'en', vw: 1, vh: 1, q: 'high' });
    r.tm.levelStart(1);
    r.tm.death(1, 0.5, 'water');
    r.tm.clear(1, 3, 1);
    r.tm.leave('menu');
    r.tm.endlessOver(1, 1);
    r.tm.flush();
    expect(r.tm.on === false && r.sent.length === 0 && r.touched === 0 && r.timers.length === 0).toBe(true);
  });
});

describe('2. 事件欄位', () => {
  const r = rig();
  const tm = r.tm;
  tm.bind(() => ({ level: 7, x: 33.33, prog: 0.4567 }));
  tm.menuReady(1234.6, { lang: 'zh-Hant', vw: 1280, vh: 720, q: 'high' });
  tm.levelStart(7);
  r.clock += 12340;
  tm.death(41.26, 0.5234, 'saw');
  r.clock += 5000;
  tm.levelStart(7);
  tm.death(60, 0.8, 'water');
  tm.clear(22.34, 2, 5);
  r.clock += 8000;
  tm.leave('menu');
  tm.endlessOver(420, 5000);
  tm.want('cat', 120, 37);
  tm.buy('dart', 25);
  tm.flush();
  const e = events(r),
    by = (t: string) => e.filter((x) => x.t === t);
  it('shop_want／shop_buy 欄位', () => {
    expect(
      JSON.stringify(by('shop_want')[0]) === JSON.stringify({ t: 'shop_want', it: 'cat', pr: 120, co: 37 }) &&
        JSON.stringify(by('shop_buy')[0]) === JSON.stringify({ t: 'shop_buy', it: 'dart', pr: 25 }),
    ).toBe(true);
  });
  it('session_start 欄位', () => {
    expect(JSON.stringify(by('session_start')[0]) === JSON.stringify({ t: 'session_start', lang: 'zh-Hant', vw: 1280, vh: 720, q: 'high', boot: 1235 }), JSON.stringify(by('session_start')[0])).toBe(
      true,
    );
  });
  it('level_start：同一關第 2 次嘗試 n=2', () => {
    expect(
      by('level_start')
        .map((x) => x.n)
        .join(),
    ).toBe('1,2');
  });
  it('death 欄位：x/進度％/死因/本次秒數/第幾次死', () => {
    expect(JSON.stringify(by('death')[0]) === JSON.stringify({ t: 'death', lv: 7, x: 41.3, p: 52.3, c: 'saw', sec: 12.3, n: 1 }), JSON.stringify(by('death')[0])).toBe(true);
  });
  it('第二次死亡 n=2', () => {
    expect(by('death')[1].n === 2).toBe(true);
  });
  it('level_clear 欄位（這關死了 2 次）', () => {
    expect(JSON.stringify(by('level_clear')[0]) === JSON.stringify({ t: 'level_clear', lv: 7, sec: 22.3, st: 2, n: 2, fl: 5 }), JSON.stringify(by('level_clear')[0])).toBe(true);
  });
  it('level_abandon 欄位', () => {
    expect(JSON.stringify(by('level_abandon')[0]) === JSON.stringify({ t: 'level_abandon', lv: 7, x: 33.3, p: 45.7, sec: 8, r: 'menu' }), JSON.stringify(by('level_abandon')[0])).toBe(true);
  });
  it('endless_over 欄位', () => {
    expect(JSON.stringify(by('endless_over')[0]) === JSON.stringify({ t: 'endless_over', dist: 420, score: 5000 })).toBe(true);
  });
  it('信封：匿名ID、session、build、裝置', () => {
    const env = r.sent[0].b;
    expect(env.a.length === 36 && env.s.length === 36 && env.a !== env.s && env.b === 'abc123' && env.d === 'd' && Object.keys(env).sort().join() === 'a,b,d,e,s').toBe(true);
  });
  it('所有批次都通過收資料端的驗證', () => {
    expect(
      r.sent.every((s) => validate(s.b) === null),
      r.sent.map((s) => validate(s.b)).join(),
    ).toBe(true);
  });
  it('不送 IP／UA／任何多餘欄位（事件鍵都在白名單）', () => {
    expect(e.every((x) => Object.keys(x).every((k) => ['t', 'lv', 'x', 'p', 'c', 'sec', 'n', 'st', 'fl', 'r', 'dist', 'score', 'lang', 'vw', 'vh', 'q', 'boot', 'it', 'pr', 'co'].includes(k)))).toBe(
      true,
    );
  });
});

describe('3. 排隊與分批', () => {
  const r = rig();
  it('只掛一個 10 秒計時器', () => {
    expect(r.timers.length === 1 && r.timers[0].ms === 10000).toBe(true);
  });
  it('排隊中不送', () => {
    for (let i = 0; i < 250; i++) r.tm.endlessOver(i, i);
    expect(r.sent.length === 0).toBe(true);
  });
  it('計時器觸發：250 筆分成 100/100/50', () => {
    r.timers[0].f();
    expect(r.sent.map((s) => s.b.e.length).join() === '100,100,50', r.sent.map((s) => s.b.e.length).join()).toBe(true);
  });
  it('佇列空了就不送空批次', () => {
    r.timers[0].f();
    expect(r.sent.length === 3).toBe(true);
  });
  it('佇列上限 300：超過的丟掉最舊的', () => {
    const r2 = rig();
    for (let i = 0; i < 400; i++) r2.tm.endlessOver(i, i);
    r2.tm.flush();
    expect(events(r2).length === 300 && events(r2)[0].dist === 100).toBe(true);
  });
  it('送出失敗：丟掉、不重試、不拋例外', () => {
    const r3 = rig({
      send: () => {
        throw new Error('boom');
      },
    });
    r3.tm.endlessOver(1, 1);
    r3.tm.flush();
    r3.tm.flush();
    expect(true).toBe(true); // 走到這裡＝沒拋例外
  });
  it('sendBeacon 回 false：只試一次', () => {
    let calls = 0;
    const r4 = rig({
      send: () => {
        calls++;
        return false;
      },
    });
    r4.tm.endlessOver(1, 1);
    r4.tm.flush();
    r4.tm.flush();
    expect(calls === 1).toBe(true);
  });
});

describe('4. 匿名 ID 持久、session 每次新', () => {
  it('同一個 localStorage：匿名 ID 相同、session 不同', () => {
    const a = rig();
    const b = rig({ ls: a.ls });
    a.tm.endlessOver(1, 1);
    a.tm.flush();
    b.tm.endlessOver(1, 1);
    b.tm.flush();
    expect(a.sent[0].b.a === b.sent[0].b.a && a.sent[0].b.s !== b.sent[0].b.s).toBe(true);
  });
  it('localStorage 壞掉：照樣運作', () => {
    const c = rig({
      ls: {
        getItem: () => {
          throw new Error('x');
        },
        setItem: () => {
          throw new Error('x');
        },
      },
    });
    c.tm.endlessOver(1, 1);
    c.tm.flush();
    expect(c.sent.length === 1).toBe(true);
  });
});

describe('5. 不送的情況', () => {
  const ap = rig();
  it('autoplay 開著的局不送', () => {
    ap.ap = true;
    ap.tm.levelStart(1);
    ap.tm.death(1, 0.1, 'water');
    ap.tm.flush();
    expect(ap.sent.length === 0).toBe(true);
  });
  it('autoplay 關掉後恢復', () => {
    ap.ap = false;
    ap.tm.levelStart(1);
    ap.tm.flush();
    expect(ap.sent.length === 1).toBe(true);
  });
  it('?notelemetry 完全不做事', () => {
    const nt = rig({ search: '?lang=en&notelemetry' });
    nt.tm.levelStart(1);
    nt.tm.flush();
    expect(nt.tm.on === false && nt.sent.length === 0 && nt.touched === 0 && nt.timers.length === 0).toBe(true);
  });
  it('localhost 開發（遙測網址是遠端）不送', () => {
    const lo = rig({ host: 'localhost' });
    lo.tm.levelStart(1);
    lo.tm.flush();
    expect(lo.tm.on === false && lo.sent.length === 0).toBe(true);
  });
  it('localhost＋遙測網址也是 localhost（本機端到端測試）才送', () => {
    const lo2 = rig({ host: '127.0.0.1', url: 'http://127.0.0.1:8791/e' });
    lo2.tm.levelStart(1);
    lo2.tm.flush();
    expect(lo2.tm.on === true && lo2.sent.length === 1).toBe(true);
  });
  it('不在玩關卡時 leave 不記 abandon', () => {
    const lv = rig();
    lv.tm.bind(() => null);
    lv.tm.leave('hidden');
    lv.tm.flush();
    expect(lv.sent.length === 0).toBe(true);
  });
});

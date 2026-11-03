// 匿名遊玩數據（server/telemetry 收）。建置時沒設 VITE_TELEMETRY_URL＝整支模組是空殼：不讀 localStorage、不掛監聽、不發任何請求。
// 另外 ?notelemetry、autoplay 的局、localhost 開發（除非遙測網址自己就是 localhost）都不送。
// 事件先排隊，每 10 秒或頁面隱藏時用 sendBeacon 送出；送失敗就丟掉，不重試。隱私說明見 public/privacy.html。
const FLUSH_MS = 10000,
  MAX_BATCH = 100,
  MAX_QUEUE = 300,
  ID_KEY = 'sf_anon';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

type TelemetryEvent = Record<string, string | number> & { t: string };
export interface LevelCtx {
  level: number;
  x: number;
  prog: number;
}
export interface Telemetry {
  on: boolean;
  bind(f: () => LevelCtx | null): void;
  notice(seen: boolean, mark: () => void): void;
  menuReady(boot: number, info: { lang: string; vw: number; vh: number; q: string }): void;
  levelStart(level: number): void;
  death(x: number, prog: number, cause: string): void;
  clear(secs: number, stars: number, flies: number): void;
  leave(reason: 'menu' | 'hidden' | 'close'): void;
  endlessOver(dist: number, score: number): void;
  /** 商店：想買但金幣不夠（定價依據）、買了 */
  want(item: string, price: number, coins: number): void;
  buy(item: string, price: number): void;
  flush(): void;
}
const NOOP: Telemetry = { on: false, bind() {}, notice() {}, menuReady() {}, levelStart() {}, death() {}, clear() {}, leave() {}, endlessOver() {}, want() {}, buy() {}, flush() {} };

export interface TelemetryOptions {
  url: string;
  build: string;
  host: string;
  search: string;
  ls: Pick<Storage, 'getItem' | 'setItem'>;
  uuid: () => string;
  now: () => number;
  send: (url: string, body: string) => boolean;
  timer: (fn: () => void, ms: number) => unknown;
  autoplay: () => boolean;
  desktop: boolean;
}

export function createTelemetry(o: TelemetryOptions): Telemetry {
  if (!o.url) return NOOP;
  const urlHost = (() => {
    try {
      return new URL(o.url).hostname;
    } catch {
      return '';
    }
  })();
  if (/[?&]notelemetry\b/.test(o.search || '')) return NOOP;
  if (LOCAL.test(o.host || '') && !LOCAL.test(urlHost)) return NOOP;

  let anon = '';
  try {
    anon = o.ls.getItem(ID_KEY) || '';
  } catch {
    /* 沒有 localStorage 就每次都是新 ID */
  }
  if (!/^[0-9a-f-]{36}$/.test(anon)) {
    anon = o.uuid();
    try {
      o.ls.setItem(ID_KEY, anon);
    } catch {
      /* 同上 */
    }
  }
  const session = o.uuid();
  const q: TelemetryEvent[] = [];
  let ctx: () => LevelCtx | null = () => null; // 目前在玩的非無盡關卡 { level, x, prog }，沒有就 null
  const tries: Record<number, number> = {},
    deaths: Record<number, number> = {}; // 本次載入裡每關的嘗試次數／死亡次數
  let lv = 0,
    t0 = 0; // 目前關卡、這次嘗試的起點（ms）

  const sec = (ms: number) => Math.round(ms / 100) / 10;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const push = (e: TelemetryEvent) => {
    if (o.autoplay()) return;
    q.push(e);
    if (q.length > MAX_QUEUE) q.shift();
  };
  function flush(): void {
    while (q.length) {
      const e = q.splice(0, MAX_BATCH);
      try {
        o.send(o.url, JSON.stringify({ a: anon, s: session, b: o.build, d: o.desktop ? 'd' : 'm', e }));
      } catch {
        /* 丟掉 */
      }
    }
  }
  o.timer(flush, FLUSH_MS);

  return {
    on: true,
    bind(f) {
      ctx = f;
    },
    notice() {},
    // 選單第一次可操作；boot＝從開啟頁面到現在的毫秒
    menuReady(boot, info) {
      push({ t: 'session_start', lang: String(info.lang || '').slice(0, 12), vw: info.vw, vh: info.vh, q: info.q === 'low' ? 'low' : 'high', boot: Math.round(boot) });
    },
    levelStart(level) {
      lv = level;
      tries[level] = (tries[level] || 0) + 1;
      t0 = o.now();
      push({ t: 'level_start', lv: level, n: tries[level] });
    },
    death(x, prog, cause) {
      deaths[lv] = (deaths[lv] || 0) + 1;
      push({ t: 'death', lv, x: r1(x), p: r1(prog * 100), c: String(cause), sec: sec(o.now() - t0), n: deaths[lv] });
      t0 = o.now();
    },
    clear(secs, stars, flies) {
      push({ t: 'level_clear', lv, sec: r1(secs), st: stars, n: deaths[lv] || 0, fl: flies });
    },
    leave(reason) {
      const c = ctx();
      if (!c) return;
      push({ t: 'level_abandon', lv: c.level, x: r1(c.x), p: r1(c.prog * 100), sec: sec(o.now() - t0), r: reason });
    },
    endlessOver(dist, score) {
      push({ t: 'endless_over', dist, score });
    },
    want(item, price, coins) {
      push({ t: 'shop_want', it: String(item).slice(0, 24), pr: price, co: coins });
    },
    buy(item, price) {
      push({ t: 'shop_buy', it: String(item).slice(0, 24), pr: price });
    },
    flush,
  };
}

function browser(): Telemetry {
  if (typeof window === 'undefined') return NOOP;
  const env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const tm = createTelemetry({
    url: env.VITE_TELEMETRY_URL || '',
    build: env.VITE_BUILD || 'dev',
    host: location.hostname,
    search: location.search,
    ls: window.localStorage,
    uuid: () => crypto.randomUUID(),
    now: () => performance.now(),
    send: (url, body) => navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })), // text/plain＝簡單請求，不需要 preflight
    timer: (fn, ms) => setInterval(fn, ms),
    autoplay: () => !!(window as { __game?: { autoplay?: unknown } }).__game?.autoplay,
    desktop: !matchMedia('(pointer: coarse)').matches,
  });
  if (tm.on) {
    // 切走或關掉：先記「放棄」再送。visibilitychange 優先；pagehide 補 visibilitychange 沒來的情況（兩者都來時 leave 只記一次）
    let left = false;
    const out = (why: 'hidden' | 'close') => {
      if (!left) {
        left = true;
        tm.leave(why);
      }
      tm.flush();
    };
    // 隱私通知：第一次看到選單才顯示；點一下（任何地方）或開始玩就收掉並記進存檔，不擋操作
    let dismiss = () => {};
    tm.notice = (seen, mark) => {
      const el = document.getElementById('privNote');
      if (!el || seen) return;
      el.style.display = '';
      dismiss = () => {
        if (el.style.display === 'none') return;
        el.style.display = 'none';
        mark();
      };
      document.addEventListener('click', () => dismiss(), { capture: true, once: true });
    };
    const start = tm.levelStart;
    tm.levelStart = (l) => {
      start(l);
      dismiss();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) out('hidden');
      else left = false;
    });
    addEventListener('pagehide', () => out('close'));
  }
  return tm;
}
export const TM = browser();

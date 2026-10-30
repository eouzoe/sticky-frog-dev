// 遊玩數據：node tests/telemetry-check.mjs
// 沒設網址＝完全不做事；事件欄位；排隊與分批；不送的情況；送出的批次要通過收資料端自己的驗證（server/telemetry/src/index.js 的 validate）。
import { createTelemetry } from '../src/telemetry.ts';
import { validate } from '../server/telemetry/src/index.js';
let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };

function rig(over = {}) {
  const r = { sent: [], timers: [], store: {}, touched: 0, clock: 1000, ap: false };
  r.ls = { getItem: (k) => (r.touched++, r.store[k] ?? null), setItem: (k, v) => { r.touched++; r.store[k] = v; } };
  let n = 0; r.uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  r.tm = createTelemetry({ url: 'https://t.example/e', build: 'abc123', host: 'www.crazygames.com', search: '', ls: r.ls, uuid: r.uuid, now: () => r.clock, send: (u, b) => { r.sent.push({ u, b: JSON.parse(b) }); return true; }, timer: (f, ms) => r.timers.push({ f, ms }), autoplay: () => r.ap, desktop: true, ...over });
  return r;
}
const events = (r) => r.sent.flatMap((s) => s.b.e);

// 1. 沒設網址：什麼都不做
{
  const r = rig({ url: '' });
  r.tm.bind(() => null); r.tm.notice?.(false, () => {}); r.tm.menuReady(1, { lang: 'en', vw: 1, vh: 1, q: 'high' }); r.tm.levelStart(1); r.tm.death(1, 0.5, 'water'); r.tm.clear(1, 3, 1); r.tm.leave('menu'); r.tm.endlessOver(1, 1); r.tm.flush();
  check('沒設網址：關閉、不送、不碰 localStorage、不掛計時器', r.tm.on === false && r.sent.length === 0 && r.touched === 0 && r.timers.length === 0);
}
// 2. 事件欄位
{
  const r = rig(); const tm = r.tm;
  tm.bind(() => ({ level: 7, x: 33.33, prog: 0.4567 }));
  tm.menuReady(1234.6, { lang: 'zh-Hant', vw: 1280, vh: 720, q: 'high' });
  tm.levelStart(7); r.clock += 12340;
  tm.death(41.26, 0.5234, 'saw'); r.clock += 5000;
  tm.levelStart(7); tm.death(60, 0.8, 'water');
  tm.clear(22.34, 2, 5);
  r.clock += 8000; tm.leave('menu');
  tm.endlessOver(420, 5000);
  tm.want('cat', 120, 37); tm.buy('dart', 25);
  tm.flush();
  const e = events(r), by = (t) => e.filter((x) => x.t === t);
  check('shop_want／shop_buy 欄位', JSON.stringify(by('shop_want')[0]) === JSON.stringify({ t: 'shop_want', it: 'cat', pr: 120, co: 37 }) && JSON.stringify(by('shop_buy')[0]) === JSON.stringify({ t: 'shop_buy', it: 'dart', pr: 25 }));
  check('session_start 欄位', JSON.stringify(by('session_start')[0]) === JSON.stringify({ t: 'session_start', lang: 'zh-Hant', vw: 1280, vh: 720, q: 'high', boot: 1235 }), JSON.stringify(by('session_start')[0]));
  check('level_start：同一關第 2 次嘗試 n=2', by('level_start').map((x) => x.n).join() === '1,2');
  check('death 欄位：x/進度％/死因/本次秒數/第幾次死', JSON.stringify(by('death')[0]) === JSON.stringify({ t: 'death', lv: 7, x: 41.3, p: 52.3, c: 'saw', sec: 12.3, n: 1 }), JSON.stringify(by('death')[0]));
  check('第二次死亡 n=2', by('death')[1].n === 2);
  check('level_clear 欄位（這關死了 2 次）', JSON.stringify(by('level_clear')[0]) === JSON.stringify({ t: 'level_clear', lv: 7, sec: 22.3, st: 2, n: 2, fl: 5 }), JSON.stringify(by('level_clear')[0]));
  check('level_abandon 欄位', JSON.stringify(by('level_abandon')[0]) === JSON.stringify({ t: 'level_abandon', lv: 7, x: 33.3, p: 45.7, sec: 8, r: 'menu' }), JSON.stringify(by('level_abandon')[0]));
  check('endless_over 欄位', JSON.stringify(by('endless_over')[0]) === JSON.stringify({ t: 'endless_over', dist: 420, score: 5000 }));
  const env = r.sent[0].b;
  check('信封：匿名ID、session、build、裝置', env.a.length === 36 && env.s.length === 36 && env.a !== env.s && env.b === 'abc123' && env.d === 'd' && Object.keys(env).sort().join() === 'a,b,d,e,s');
  check('所有批次都通過收資料端的驗證', r.sent.every((s) => validate(s.b) === null), r.sent.map((s) => validate(s.b)).join());
  check('不送 IP／UA／任何多餘欄位（事件鍵都在白名單）', e.every((x) => Object.keys(x).every((k) => ['t', 'lv', 'x', 'p', 'c', 'sec', 'n', 'st', 'fl', 'r', 'dist', 'score', 'lang', 'vw', 'vh', 'q', 'boot', 'it', 'pr', 'co'].includes(k))));
}
// 3. 排隊與分批
{
  const r = rig();
  check('只掛一個 10 秒計時器', r.timers.length === 1 && r.timers[0].ms === 10000);
  for (let i = 0; i < 250; i++) r.tm.endlessOver(i, i);
  check('排隊中不送', r.sent.length === 0);
  r.timers[0].f();
  check('計時器觸發：250 筆分成 100/100/50', r.sent.map((s) => s.b.e.length).join() === '100,100,50', r.sent.map((s) => s.b.e.length).join());
  r.timers[0].f();
  check('佇列空了就不送空批次', r.sent.length === 3);
  const r2 = rig(); for (let i = 0; i < 400; i++) r2.tm.endlessOver(i, i); r2.tm.flush();
  check('佇列上限 300：超過的丟掉最舊的', events(r2).length === 300 && events(r2)[0].dist === 100);
  const r3 = rig({ send: () => { throw new Error('boom'); } }); r3.tm.endlessOver(1, 1); r3.tm.flush(); r3.tm.flush();
  check('送出失敗：丟掉、不重試、不拋例外', true);
  let calls = 0; const r4 = rig({ send: () => { calls++; return false; } }); r4.tm.endlessOver(1, 1); r4.tm.flush(); r4.tm.flush();
  check('sendBeacon 回 false：只試一次', calls === 1);
}
// 4. 匿名 ID 持久、session 每次新
{
  const a = rig(); const b = rig({ ls: a.ls });
  a.tm.endlessOver(1, 1); a.tm.flush(); b.tm.endlessOver(1, 1); b.tm.flush();
  check('同一個 localStorage：匿名 ID 相同、session 不同', a.sent[0].b.a === b.sent[0].b.a && a.sent[0].b.s !== b.sent[0].b.s);
  const c = rig({ ls: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } }); c.tm.endlessOver(1, 1); c.tm.flush();
  check('localStorage 壞掉：照樣運作', c.sent.length === 1);
}
// 5. 不送的情況
{
  const ap = rig(); ap.ap = true; ap.tm.levelStart(1); ap.tm.death(1, 0.1, 'water'); ap.tm.flush();
  check('autoplay 開著的局不送', ap.sent.length === 0);
  ap.ap = false; ap.tm.levelStart(1); ap.tm.flush();
  check('autoplay 關掉後恢復', ap.sent.length === 1);
  const nt = rig({ search: '?lang=en&notelemetry' }); nt.tm.levelStart(1); nt.tm.flush();
  check('?notelemetry 完全不做事', nt.tm.on === false && nt.sent.length === 0 && nt.touched === 0 && nt.timers.length === 0);
  const lo = rig({ host: 'localhost' }); lo.tm.levelStart(1); lo.tm.flush();
  check('localhost 開發（遙測網址是遠端）不送', lo.tm.on === false && lo.sent.length === 0);
  const lo2 = rig({ host: '127.0.0.1', url: 'http://127.0.0.1:8791/e' }); lo2.tm.levelStart(1); lo2.tm.flush();
  check('localhost＋遙測網址也是 localhost（本機端到端測試）才送', lo2.tm.on === true && lo2.sent.length === 1);
  const lv = rig(); lv.tm.bind(() => null); lv.tm.leave('hidden'); lv.tm.flush();
  check('不在玩關卡時 leave 不記 abandon', lv.sent.length === 0);
}
console.log(fails ? `\n${fails} 項失敗` : '\n全部通過');
process.exit(fails ? 1 : 0);

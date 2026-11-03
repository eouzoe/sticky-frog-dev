// POST /e：收批次事件。這裡是信任邊界——body、事件數、型別、範圍、字串長度全部檢查，不合格整批 400、不寫入。
import { drizzle } from 'drizzle-orm/d1';
import { events, type EventRow } from './schema.ts';

const MAX_BODY = 32 * 1024;
const MAX_EVENTS = 100;
const RATE_EVENTS_PER_MIN = 600; // 每個匿名 ID
const ORIGIN_OK = /^(https:\/\/([a-z0-9-]+\.)*crazygames\.com|https:\/\/crazy-games\.zeabur\.app|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

type Check = (v: unknown) => boolean;
const num =
  (lo: number, hi: number, int = false): Check =>
  (v) =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!int || Number.isInteger(v));
const str =
  (max: number, re = /^[\w .-]*$/): Check =>
  (v) =>
    typeof v === 'string' && v.length <= max && re.test(v);
const oneOf =
  (...a: string[]): Check =>
  (v) =>
    typeof v === 'string' && a.includes(v);
const LV = num(1, 200, true),
  X = num(-1000, 1e6),
  P = num(0, 100),
  SEC = num(0, 86400),
  N = num(0, 1e5, true);

// 事件類型 → 欄位（短鍵）。REQ 必填、其餘可選；不在表裡的鍵＝整批拒絕。
const EVENTS: Record<string, Record<string, Check>> = {
  session_start: { lang: str(12, /^[A-Za-z-]*$/), vw: num(0, 20000, true), vh: num(0, 20000, true), q: oneOf('high', 'low'), boot: num(0, 600000, true) },
  level_start: { lv: LV, n: N },
  death: { lv: LV, x: X, p: P, c: str(16, /^[a-z_]+$/), sec: SEC, n: N },
  level_clear: { lv: LV, sec: SEC, st: num(0, 3, true), n: N, fl: N },
  level_abandon: { lv: LV, x: X, p: P, sec: SEC, r: oneOf('menu', 'hidden', 'close') },
  endless_over: { dist: num(0, 1e7, true), score: num(0, 1e9, true) },
  shop_want: { it: str(24, /^[a-z_]+$/), pr: num(0, 1e6, true), co: num(0, 1e9, true) }, // 想買但金幣不夠：定價依據
  shop_buy: { it: str(24, /^[a-z_]+$/), pr: num(0, 1e6, true) },
};
const REQ: Record<string, string[]> = {
  death: ['lv', 'x', 'p', 'c'],
  level_start: ['lv'],
  level_clear: ['lv', 'sec'],
  level_abandon: ['lv', 'r'],
  endless_over: ['dist', 'score'],
  session_start: [],
  shop_want: ['it', 'pr', 'co'],
  shop_buy: ['it', 'pr'],
};
const UUID = /^[0-9a-f-]{36}$/;
const ENV_KEYS: Record<string, Check> = { a: (v) => typeof v === 'string' && UUID.test(v), s: (v) => typeof v === 'string' && UUID.test(v), b: str(24), d: oneOf('d', 'm'), e: Array.isArray };

type Ev = Record<string, unknown> & { t: string };
export type Batch = { a: string; s: string; b: string; d: 'd' | 'm'; e: Ev[] };

// 回傳 null＝合格；否則是拒絕原因（只進日誌與測試，不回給呼叫端）
export function validate(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body';
  const o = body as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!ENV_KEYS[k]) return `unknown envelope key ${k}`;
  for (const k of Object.keys(ENV_KEYS)) if (!(k in o) || !ENV_KEYS[k](o[k])) return `bad ${k}`;
  const e = o.e as unknown[];
  if (e.length < 1 || e.length > MAX_EVENTS) return 'event count';
  for (const ev of e) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return 'event shape';
    const r = ev as Record<string, unknown>;
    const spec = typeof r.t === 'string' && Object.hasOwn(EVENTS, r.t) ? EVENTS[r.t] : null;
    if (!spec) return 'unknown type';
    for (const [k, v] of Object.entries(r)) if (k !== 't' && !(Object.hasOwn(spec, k) && spec[k](v))) return `bad field ${r.t}.${k}`;
    for (const k of REQ[r.t as string]) if (!(k in r)) return `missing ${r.t}.${k}`;
  }
  return null;
}

// 短鍵 → 欄位
const COLS = {
  lv: 'level',
  x: 'x',
  p: 'prog',
  c: 'cause',
  sec: 'secs',
  st: 'stars',
  n: 'n',
  fl: 'flies',
  r: 'reason',
  dist: 'dist',
  score: 'score',
  lang: 'lang',
  vw: 'vw',
  vh: 'vh',
  q: 'quality',
  boot: 'bootMs',
  it: 'item',
  pr: 'price',
  co: 'coins',
} as const;

// 頻率上限放在 isolate 記憶體，只擋單一匿名 ID 的灌水；多 isolate 各算各的，要嚴格再改 DO／D1 計數。
const hits = new Map<string, { t0: number; n: number }>();
function limited(anon: string, n: number, now: number): boolean {
  if (hits.size > 5000) hits.clear();
  let h = hits.get(anon);
  if (!h || now - h.t0 > 60000) hits.set(anon, (h = { t0: now, n: 0 }));
  h.n += n;
  return h.n > RATE_EVENTS_PER_MIN;
}

const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});
const reply = (status: number, origin: string | null, text = '') => new Response(status === 204 ? null : text, { status, headers: origin ? cors(origin) : {} });
const originClass = (o: string) => (/^http:\/\/(localhost|127\.0\.0\.1)/.test(o) ? 'local' : o.endsWith('crazygames.com') ? 'cg' : 'other');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    if (url.pathname !== '/e') return reply(404, null);
    if (!ORIGIN_OK.test(origin)) return reply(403, null);
    if (req.method === 'OPTIONS') return reply(204, origin);
    if (req.method !== 'POST') return reply(405, origin);
    if (Number(req.headers.get('Content-Length')) > MAX_BODY) return reply(400, origin, 'too large');
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(400, origin, 'too large'); // 沒帶 Content-Length（chunked）時的第二道
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, origin, 'json');
    }
    if (validate(body)) return reply(400, origin, 'invalid');
    const b = body as Batch;
    const now = Date.now();
    if (limited(b.a, b.e.length, now)) return reply(429, origin, 'slow down');
    const country = (req.cf?.country as string | undefined) ?? null,
      oc = originClass(origin);
    const rows: EventRow[] = b.e.map((ev) => {
      const row: EventRow = { ts: now, anon: b.a, session: b.s, build: b.b, dev: b.d, country, origin: oc, type: ev.t };
      for (const [k, col] of Object.entries(COLS)) if (k in ev) (row as Record<string, unknown>)[col] = ev[k];
      return row;
    });
    const db = drizzle(env.DB);
    const [first, ...rest] = rows.map((r) => db.insert(events).values(r));
    await db.batch([first, ...rest]); // 一次交易、逐筆語句：100 筆一句會超過 SQLite 的綁定變數上限
    return reply(204, origin);
  },
} satisfies ExportedHandler<Env>;

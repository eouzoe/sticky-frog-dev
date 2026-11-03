// POST /e：收批次事件。這裡是信任邊界——body、事件數、型別、範圍、字串長度全部檢查，不合格整批 400、不寫入。
import { drizzle } from 'drizzle-orm/d1';

import { events, type EventRow } from './schema.ts';
import { MAX_BODY, ORIGIN_OK, RATE_EVENTS_PER_MIN, validate, type Batch } from './validate.ts';

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

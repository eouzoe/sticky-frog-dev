// POST /e：收批次事件。這裡是信任邊界——body、事件數、型別、範圍、字串長度全部檢查，不合格整批 400、不寫入。
const MAX_BODY = 32 * 1024;
const MAX_EVENTS = 100;
const RATE_EVENTS_PER_MIN = 600; // 每個匿名 ID
const ORIGIN_OK = /^(https:\/\/([a-z0-9-]+\.)*crazygames\.com|https:\/\/crazy-games\.zeabur\.app|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;

const num = (lo, hi, int = false) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi && (!int || Number.isInteger(v));
const str = (max, re = /^[\w .-]*$/) => (v) => typeof v === 'string' && v.length <= max && re.test(v);
const oneOf = (...a) => (v) => a.includes(v);
const LV = num(1, 200, true), X = num(-1000, 1e6), P = num(0, 100), SEC = num(0, 86400), N = num(0, 1e5, true);

// 事件類型 → 欄位（短鍵）。REQ 必填、其餘可選；不在表裡的鍵＝整批拒絕。
const EVENTS = {
  session_start: { lang: str(12, /^[A-Za-z-]*$/), vw: num(0, 20000, true), vh: num(0, 20000, true), q: oneOf('high', 'low'), boot: num(0, 600000, true) },
  level_start: { lv: LV, n: N },
  death: { lv: LV, x: X, p: P, c: str(16, /^[a-z_]+$/), sec: SEC, n: N },
  level_clear: { lv: LV, sec: SEC, st: num(0, 3, true), n: N, fl: N },
  level_abandon: { lv: LV, x: X, p: P, sec: SEC, r: oneOf('menu', 'hidden', 'close') },
  endless_over: { dist: num(0, 1e7, true), score: num(0, 1e9, true) },
  shop_want: { it: str(24, /^[a-z_]+$/), pr: num(0, 1e6, true), co: num(0, 1e9, true) }, // tapped an item the player cannot afford: the pricing signal
  shop_buy: { it: str(24, /^[a-z_]+$/), pr: num(0, 1e6, true) },
};
const REQ = { death: ['lv', 'x', 'p', 'c'], level_start: ['lv'], level_clear: ['lv', 'sec'], level_abandon: ['lv', 'r'], endless_over: ['dist', 'score'], session_start: [], shop_want: ['it', 'pr', 'co'], shop_buy: ['it', 'pr'] };
const UUID = /^[0-9a-f-]{36}$/;
const ENV_KEYS = { a: (v) => typeof v === 'string' && UUID.test(v), s: (v) => typeof v === 'string' && UUID.test(v), b: str(24), d: oneOf('d', 'm'), e: Array.isArray };

// 回傳 null＝合格；否則是拒絕原因（只進日誌與測試，不回給呼叫端）
export function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'body';
  for (const k of Object.keys(body)) if (!ENV_KEYS[k]) return `unknown envelope key ${k}`;
  for (const k of Object.keys(ENV_KEYS)) if (!(k in body) || !ENV_KEYS[k](body[k])) return `bad ${k}`;
  if (body.e.length < 1 || body.e.length > MAX_EVENTS) return 'event count';
  for (const ev of body.e) {
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return 'event shape';
    const spec = Object.hasOwn(EVENTS, ev.t) ? EVENTS[ev.t] : null;
    if (!spec) return 'unknown type';
    for (const [k, v] of Object.entries(ev)) if (k !== 't' && !(Object.hasOwn(spec, k) && spec[k](v))) return `bad field ${ev.t}.${k}`;
    for (const k of REQ[ev.t]) if (!(k in ev)) return `missing ${ev.t}.${k}`;
  }
  return null;
}

const COLS = ['lv:level', 'x:x', 'p:prog', 'c:cause', 'sec:secs', 'st:stars', 'n:n', 'fl:flies', 'r:reason', 'dist:dist', 'score:score', 'lang:lang', 'vw:vw', 'vh:vh', 'q:quality', 'boot:boot_ms', 'it:item', 'pr:price', 'co:coins'].map((s) => s.split(':'));
const SQL = `INSERT INTO events (ts,anon,session,build,dev,country,origin,type,${COLS.map((c) => c[1]).join(',')}) VALUES (?,?,?,?,?,?,?,?,${COLS.map(() => '?').join(',')})`;

// ponytail: 頻率上限放在 isolate 記憶體，只擋單一匿名 ID 的灌水；多 isolate 各算各的，要嚴格再改 DO／D1 計數。
const hits = new Map();
function limited(anon, n, now) {
  if (hits.size > 5000) hits.clear();
  let h = hits.get(anon);
  if (!h || now - h.t0 > 60000) hits.set(anon, (h = { t0: now, n: 0 }));
  h.n += n;
  return h.n > RATE_EVENTS_PER_MIN;
}

const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' });
const reply = (status, origin, text = '') => new Response(status === 204 ? null : text, { status, headers: origin ? cors(origin) : {} });
const originClass = (o) => (/^http:\/\/(localhost|127\.0\.0\.1)/.test(o) ? 'local' : /crazygames\.com$/.test(o) ? 'cg' : 'other');

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
    let body; try { body = JSON.parse(raw); } catch { return reply(400, origin, 'json'); }
    if (validate(body)) return reply(400, origin, 'invalid');
    const now = Date.now();
    if (limited(body.a, body.e.length, now)) return reply(429, origin, 'slow down');
    const country = req.cf?.country ?? null, oc = originClass(origin);
    await env.DB.batch(body.e.map((ev) => env.DB.prepare(SQL).bind(now, body.a, body.s, body.b, body.d, country, oc, ev.t, ...COLS.map(([k]) => ev[k] ?? null))));
    return reply(204, origin);
  },
};

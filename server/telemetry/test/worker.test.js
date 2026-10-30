// Telemetry worker: accepted and rejected batches, origin rules, rate limit, stored columns.
// Runs inside workerd against a fresh local D1 (schema.sql applied once per file): cd server/telemetry && npm test.
// test-worker.mjs stays for checking a deployed worker (--remote).
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import schema from '../schema.sql?raw';

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (o = {}) => ({ t: 'death', lv: 3, x: 41.5, p: 52, c: 'water', sec: 12.3, n: 2, ...o });
const batch = (o = {}) => ({ a: U(1), s: U(2), b: 'test', d: 'd', e: [ev()], ...o });
const send = (body, { origin = 'http://localhost:5778', raw } = {}) =>
  exports.default.fetch('https://telemetry.test/e', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: raw ?? JSON.stringify(body) });
const count = async () => (await env.DB.prepare('SELECT COUNT(*) c FROM events').first()).c;

beforeAll(async () => {
  const statements = schema.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
});

describe('accepted batches', () => {
  it('stores all six event types, one row each', async () => {
    const before = await count();
    const res = await send(batch({ e: [{ t: 'session_start', lang: 'en', vw: 1280, vh: 720, q: 'high', boot: 1500 }, { t: 'level_start', lv: 3, n: 1 }, ev(), { t: 'level_clear', lv: 3, sec: 20, st: 2, n: 1, fl: 4 }, { t: 'level_abandon', lv: 4, x: 10, p: 5, sec: 8, r: 'menu' }, { t: 'endless_over', dist: 420, score: 5000 }] }));
    expect(res.status).toBe(204);
    expect((await count()) - before).toBe(6);
  });
  it('accepts a CrazyGames subdomain and classifies its origin as cg', async () => {
    const res = await send(batch({ s: U(3) }), { origin: 'https://www.crazygames.com' });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare('SELECT origin FROM events WHERE session = ?').bind(U(3)).first();
    expect(row.origin).toBe('cg');
  });
  it('stores no IP or user-agent column', async () => {
    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('events')").all();
    const names = results.map((r) => r.name);
    expect(names).not.toContain('ip');
    expect(names).not.toContain('ua');
  });
});

describe('rejected batches write nothing', () => {
  const cases = [
    ['body over 32 KB', { raw: JSON.stringify(batch({ e: [ev({ c: 'x'.repeat(40000) })] })) }],
    ['101 events', batch({ e: Array.from({ length: 101 }, () => ev()) })],
    ['unknown event type', batch({ e: [ev({ t: 'purchase' })] })],
    ['unknown field', batch({ e: [ev({ ip: '1.2.3.4' })] })],
    ['wrong type (x as string)', batch({ e: [ev({ x: '41' })] })],
    ['out of range (progress 150)', batch({ e: [ev({ p: 150 })] })],
    ['out of range (level 0)', batch({ e: [ev({ lv: 0 })] })],
    ['bad string (cause)', batch({ e: [ev({ c: "water'; DROP TABLE events;--" })] })],
    ['bad anonymous id', batch({ a: 'hello' })],
    ['missing required field (death without x)', batch({ e: [(({ x: _x, ...r }) => r)(ev())] })],
    ['empty batch', batch({ e: [] })],
    ['not JSON', { raw: 'not json' }],
    ['null where a number is required', batch({ e: [ev({ x: null })] })],
  ];
  for (const [name, body] of cases) {
    it(`${name} → 400`, async () => {
      const before = await count();
      const res = body.raw ? await send(null, { raw: body.raw }) : await send(body);
      expect(res.status).toBe(400);
      expect(await count()).toBe(before);
    });
  }
  for (const [name, origin] of [['foreign origin', 'https://evil.example.com'], ['look-alike of crazygames.com', 'https://crazygames.com.evil.example']]) {
    it(`${name} → 403`, async () => {
      const before = await count();
      expect((await send(batch(), { origin })).status).toBe(403);
      expect(await count()).toBe(before);
    });
  }
});

describe('rate limit', () => {
  it('one anonymous id: 600 events a minute, then 429', async () => {
    const before = await count();
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await send(batch({ a: U(9), e: Array.from({ length: 100 }, () => ev()) }))).status;
    expect(last).toBe(429);
    expect((await count()) - before).toBe(600);
  });
});

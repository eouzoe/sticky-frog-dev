// node server/telemetry/test-worker.mjs <端點 base> <--local|--remote>
// 打合格批次（要 204 且 D1 多 N 列）與各種不合格批次（要 400 且 D1 不增加）。測試列的 build 都是 'test'，跑完自己刪。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const [base, mode] = process.argv.slice(2);
if (!base || !['--local', '--remote'].includes(mode)) { console.error('用法：node test-worker.mjs <base> <--local|--remote>'); process.exit(2); }
const cfg = existsSync(new URL('wrangler.local.toml', import.meta.url)) ? 'wrangler.local.toml' : 'wrangler.toml';
const here = new URL('.', import.meta.url).pathname;
const d1 = (sql) => JSON.parse(execFileSync('npx', ['-y', 'wrangler@4', 'd1', 'execute', 'sticky-frog-telemetry', '-c', cfg, mode, '--json', '--command', sql], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
const count = () => d1("SELECT COUNT(*) c FROM events WHERE build='test'")[0].c;
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (o = {}) => ({ t: 'death', lv: 3, x: 41.5, p: 52, c: 'water', sec: 12.3, n: 2, ...o });
const batch = (o = {}) => ({ a: U(1), s: U(2), b: 'test', d: 'd', e: [ev()], ...o });
const send = (body, { origin = 'http://localhost:5778', raw } = {}) =>
  fetch(`${base}/e`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: raw ?? JSON.stringify(body) }).then((r) => r.status);

const good = [
  ['合格：全部 6 種事件', 204, batch({ e: [{ t: 'session_start', lang: 'en', vw: 1280, vh: 720, q: 'high', boot: 1500 }, { t: 'level_start', lv: 3, n: 1 }, ev(), { t: 'level_clear', lv: 3, sec: 20, st: 2, n: 1, fl: 4 }, { t: 'level_abandon', lv: 4, x: 10, p: 5, sec: 8, r: 'menu' }, { t: 'endless_over', dist: 420, score: 5000 }] }), 6],
  ['合格：CrazyGames 子網域來源', 204, batch(), 1, { origin: 'https://www.crazygames.com' }],
];
const bad = [
  ['超大 body（> 32KB）', 400, null, 0, { raw: JSON.stringify(batch({ e: [ev({ c: 'x'.repeat(40000) })] })) }],
  ['太多筆（101）', 400, batch({ e: Array.from({ length: 101 }, () => ev()) })],
  ['未知事件類型', 400, batch({ e: [ev({ t: 'purchase' })] })],
  ['未知欄位', 400, batch({ e: [ev({ ip: '1.2.3.4' })] })],
  ['型別錯（x 是字串）', 400, batch({ e: [ev({ x: '41' })] })],
  ['範圍外（進度 150）', 400, batch({ e: [ev({ p: 150 })] })],
  ['範圍外（關卡 0）', 400, batch({ e: [ev({ lv: 0 })] })],
  ['字串太長／格式錯（死因）', 400, batch({ e: [ev({ c: "water'; DROP TABLE events;--" })] })],
  ['匿名 ID 格式錯', 400, batch({ a: 'hello' })],
  ['缺必填（death 沒有 x）', 400, batch({ e: [(({ x, ...r }) => r)(ev())] })],
  ['空批次', 400, batch({ e: [] })],
  ['不是 JSON', 400, null, 0, { raw: 'not json' }],
  ['NaN／Infinity 變 null', 400, batch({ e: [ev({ x: null })] })],
  ['不被允許的來源', 403, batch(), 0, { origin: 'https://evil.example.com' }],
  ['來源看起來像 crazygames.com 的假網域', 403, batch(), 0, { origin: 'https://crazygames.com.evil.example' }],
];
let fails = 0;
const before0 = count();
console.log(`起始 test 列數 ${before0}`);
for (const [name, want, body, rows = 0, opt] of [...good, ...bad]) {
  const b = count();
  const got = await send(body, opt);
  const a = count();
  const ok = got === want && a - b === (want === 204 ? rows : 0);
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}：HTTP ${got}（要 ${want}），寫入 ${a - b} 列（要 ${want === 204 ? rows : 0}）`);
}
// 頻率上限：同一個匿名 ID 一分鐘內灌過 600 筆 → 429
{
  const b = count(); let last = 0;
  for (let i = 0; i < 8; i++) last = await send(batch({ a: U(9), e: Array.from({ length: 100 }, () => ev()) }));
  const a = count(); const ok = last === 429 && a - b === 600;
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} 頻率上限：8 批×100 筆，最後一批 HTTP ${last}（要 429），共寫入 ${a - b} 列（要 600）`);
}
const row = d1("SELECT origin, country, dev, build FROM events WHERE build='test' ORDER BY id DESC LIMIT 1")[0];
console.log('最後一列的來源類別／國家／裝置：', JSON.stringify(row));
console.log(`欄位清單（確認沒有 IP／UA 欄位）：${d1("SELECT name FROM pragma_table_info('events')").map((r) => r.name).join(',')}`);
d1("DELETE FROM events WHERE build='test'");
console.log(`清除後 test 列數 ${count()}；${fails ? `失敗 ${fails} 項` : '全部通過'}`);
process.exit(fails ? 1 : 0);

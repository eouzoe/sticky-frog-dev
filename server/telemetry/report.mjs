// node server/telemetry/report.mjs [--local] [--out report.md]
// 用 wrangler d1 execute --json 查 D1，印出（或寫檔）一份 markdown 的關卡難度報告。預設查線上（--remote）。
// 設定檔：環境變數 WRANGLER_CONFIG，否則有 wrangler.local.toml 就用它（放真正的 database_id，不進 repo），否則 wrangler.toml。
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mode = args.includes('--local') ? '--local' : '--remote';
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : '';
const here = new URL('.', import.meta.url).pathname;
const cfg = process.env.WRANGLER_CONFIG || (existsSync(`${here}wrangler.local.toml`) ? 'wrangler.local.toml' : 'wrangler.toml');

// ---- 異常樣本篩除規則（報告開頭會印出來；改這裡就同步）----
const RULES = {
  heavySession: 500, // 單一 session 超過這麼多事件＝機器人或迴圈
  deathSecMax: 1800, // 一次嘗試超過 30 分鐘才死：多半是掛機
  clearSecMin: 2, clearSecMax: 3600, // 過關秒數 < 2 或 > 1 小時不合理
  abandonSecMax: 3600,
  bootMsMax: 120000,
  minSample: 20, // 一關開始人數低於此值，標「樣本少」不下難易結論
  hardRate: 0.5, easyRate: 0.95, easyDeaths: 0.5,
};
const R = RULES;
const CLEAN = `WITH heavy AS (SELECT session FROM events GROUP BY session HAVING COUNT(*) > ${R.heavySession}),
e AS (SELECT * FROM events
  WHERE origin != 'local' AND build != 'test'
    AND session NOT IN (SELECT session FROM heavy)
    AND NOT (type = 'death' AND secs > ${R.deathSecMax})
    AND NOT (type = 'level_clear' AND (secs < ${R.clearSecMin} OR secs > ${R.clearSecMax}))
    AND NOT (type = 'level_abandon' AND secs > ${R.abandonSecMax}))`;

function sql(q) {
  const out = execFileSync('npx', ['-y', 'wrangler@4', 'd1', 'execute', 'sticky-frog-telemetry', '-c', cfg, mode, '--json', '--command', q], { cwd: here, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 });
  return JSON.parse(out)[0].results;
}
const clean = (q) => sql(`${CLEAN} ${q}`);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const fix = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
const table = (head, rows) => (rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : '_（沒有資料）_');
const quantile = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
const BINS = Array.from({ length: 10 }, (_, i) => `${i * 10}–${i * 10 + 10}%`);

// ---- 1. 概況 ----
const raw = sql(`SELECT COUNT(*) n, COUNT(DISTINCT anon) anons, COUNT(DISTINCT session) sessions, MIN(ts) t0, MAX(ts) t1 FROM events`)[0];
const kept = clean(`SELECT COUNT(*) n, COUNT(DISTINCT anon) anons, COUNT(DISTINCT session) sessions FROM e`)[0];
const ex = sql(`WITH heavy AS (SELECT session FROM events GROUP BY session HAVING COUNT(*) > ${R.heavySession})
  SELECT SUM(origin = 'local') local, SUM(build = 'test') test, SUM(session IN (SELECT session FROM heavy)) heavy,
    SUM((type = 'death' AND secs > ${R.deathSecMax}) OR (type = 'level_clear' AND (secs < ${R.clearSecMin} OR secs > ${R.clearSecMax})) OR (type = 'level_abandon' AND secs > ${R.abandonSecMax})) badsec FROM events`)[0];
const countries = clean(`SELECT COALESCE(country,'?') c, COUNT(DISTINCT anon) n FROM e GROUP BY c ORDER BY n DESC LIMIT 8`);

// ---- 2. 每關 ----
const starts = clean(`SELECT level, COUNT(DISTINCT anon) starters, COUNT(*) tries FROM e WHERE type='level_start' GROUP BY level ORDER BY level`);
const clears = clean(`SELECT level, COUNT(DISTINCT anon) clearers, AVG(n) avg_deaths, AVG(secs) avg_secs FROM e WHERE type='level_clear' GROUP BY level`);
const deaths = clean(`SELECT level, COUNT(*) n FROM e WHERE type='death' GROUP BY level`);
const clearBy = Object.fromEntries(clears.map((r) => [r.level, r]));
const deathBy = Object.fromEntries(deaths.map((r) => [r.level, r.n]));
const levels = starts.map((s) => {
  const c = clearBy[s.level], rate = c ? c.clearers / s.starters : 0;
  let flag = '';
  if (s.starters < R.minSample) flag = '樣本少';
  else if (rate < R.hardRate) flag = '偏難？';
  else if (rate >= R.easyRate && (c?.avg_deaths ?? 0) < R.easyDeaths) flag = '偏簡單？';
  return { ...s, clearers: c?.clearers ?? 0, rate, avg_deaths: c?.avg_deaths, avg_secs: c?.avg_secs, deaths: deathBy[s.level] ?? 0, flag };
});

// ---- 3. 死亡位置 ----
const dpos = clean(`SELECT level, MIN(9, CAST(prog / 10 AS INTEGER)) bin, COALESCE(cause,'?') cause, COUNT(*) n FROM e WHERE type='death' GROUP BY level, bin, cause ORDER BY level, bin`);
// ---- 4. 放棄 ----
const apos = clean(`SELECT level, MIN(9, CAST(prog / 10 AS INTEGER)) bin, reason, COUNT(*) n FROM e WHERE type='level_abandon' GROUP BY level, bin, reason ORDER BY level, bin`);
// ---- 6. 開機時間 ----
const boots = clean(`SELECT dev, boot_ms FROM e WHERE type='session_start' AND boot_ms BETWEEN 1 AND ${R.bootMsMax} ORDER BY boot_ms`);
// ---- 7. 無盡 ----
const endless = clean(`SELECT COUNT(*) runs, COUNT(DISTINCT anon) anons, AVG(dist) avg_dist, MAX(dist) max_dist FROM e WHERE type='endless_over'`)[0];

// ---- 輸出 ----
const L = [];
const w = (...s) => L.push(...s);
w('# STICKY FROG 關卡數據報告', '', `產生時間：${new Date().toISOString()}　資料來源：${mode === '--local' ? '本機 D1' : '線上 D1'}`, '');
w('## 異常樣本篩除規則（下面所有數字都已套用）', '',
  '- 來源是 localhost 開發的列（`origin=local`）；建置版本 `test` 的列。',
  `- 單一 session 超過 ${R.heavySession} 個事件：整個 session 丟掉（機器人或迴圈）。`,
  `- 死亡的本次嘗試秒數 > ${R.deathSecMax}（掛機）；過關秒數 < ${R.clearSecMin} 或 > ${R.clearSecMax}；放棄的秒數 > ${R.abandonSecMax}。`,
  `- 開機到選單時間只取 1–${R.bootMsMax} ms。`,
  `- 一關開始人數 < ${R.minSample}：標「樣本少」，不下難易結論。通關率 < ${pct(R.hardRate, 1)} 標「偏難？」；通關率 ≥ ${pct(R.easyRate, 1)} 且通關前平均死亡 < ${R.easyDeaths} 標「偏簡單？」。`,
  '- 人數＝不重複匿名 ID。「通關率」＝這關有過關的人 ÷ 開始過這關的人。', '');
w('## 概況', '',
  table(['', '事件列', '匿名 ID', 'session'], [['原始', raw.n, raw.anons, raw.sessions], ['篩除後', kept.n, kept.anons, kept.sessions]]), '',
  `被篩掉的列數：開發來源 ${ex.local ?? 0}、測試資料 ${ex.test ?? 0}、異常多事件的 session ${ex.heavy ?? 0}、秒數不合理 ${ex.badsec ?? 0}（可能重疊）。`,
  raw.t0 ? `資料時間範圍：${new Date(raw.t0).toISOString()} ～ ${new Date(raw.t1).toISOString()}` : '',
  `國家（匿名 ID 數，前 8）：${countries.map((c) => `${c.c} ${c.n}`).join('、') || '—'}`, '');
w('## 每關開始人數與通關率', '',
  table(['關', '開始人數', '嘗試次數', '通關人數', '通關率', '通關前平均死亡', '平均過關秒', '死亡總數', '判讀'],
    levels.map((l) => [l.level, l.starters, l.tries, l.clearers, pct(l.clearers, l.starters), fix(l.avg_deaths), fix(l.avg_secs), l.deaths, l.flag])), '');
w('## 死亡位置（按進度每 10% 一格）', '', '每格是死亡次數；粗體＝該關最集中的一格。', '');
const byLevel = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.level)) m.set(r.level, []); m.get(r.level).push(r); } return m; };
const dm = byLevel(dpos);
w(table(['關', '總計', ...BINS], [...dm].map(([lv, rs]) => {
  const bins = Array(10).fill(0); for (const r of rs) bins[r.bin] += r.n;
  const tot = bins.reduce((a, b) => a + b, 0), top = Math.max(...bins);
  return [lv, tot, ...bins.map((n) => (n === top && n > 0 ? `**${n}**` : n || ''))];
})), '');
w('### 死因分布（每關最集中的那一格）', '');
for (const [lv, rs] of dm) {
  const bins = Array(10).fill(0); for (const r of rs) bins[r.bin] += r.n;
  const hot = bins.indexOf(Math.max(...bins));
  const causes = rs.filter((r) => r.bin === hot).sort((a, b) => b.n - a.n).map((r) => `${r.cause} ${r.n}`).join('、');
  const all = {}; for (const r of rs) all[r.cause] = (all[r.cause] || 0) + r.n;
  w(`- 第 ${lv} 關：最集中在 ${BINS[hot]}（${causes}）；全關死因 ${Object.entries(all).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join('、')}`);
}
if (!dm.size) w('_（沒有資料）_');
w('', '## 放棄位置（離開關卡時的進度）', '', '原因：menu＝回選單、hidden＝切走或隱藏分頁、close＝關分頁。', '');
const am = byLevel(apos);
w(table(['關', '總計', 'menu', 'hidden', 'close', ...BINS], [...am].map(([lv, rs]) => {
  const bins = Array(10).fill(0), rsn = { menu: 0, hidden: 0, close: 0 }; for (const r of rs) { bins[r.bin] += r.n; rsn[r.reason] += r.n; }
  const top = Math.max(...bins);
  return [lv, bins.reduce((a, b) => a + b, 0), rsn.menu, rsn.hidden, rsn.close, ...bins.map((n) => (n === top && n > 0 ? `**${n}**` : n || ''))];
})), '');
w('## 關卡留存漏斗（第 n 關 → 第 n+1 關）', '', '「過關後有開下一關」＝過第 n 關的人裡，有開始第 n+1 關的比例（用匿名 ID 判斷，含之後幾天回來玩的）。', '');
const startSet = Object.fromEntries(levels.map((l) => [l.level, l.starters]));
const nextStart = clean(`SELECT a.level lv, COUNT(DISTINCT a.anon) kept FROM e a WHERE a.type='level_clear' AND EXISTS (SELECT 1 FROM e b WHERE b.anon=a.anon AND b.type='level_start' AND b.level=a.level+1) GROUP BY a.level`);
const nextBy = Object.fromEntries(nextStart.map((r) => [r.lv, r.kept]));
const first = levels[0]?.starters;
w(table(['關', '開始人數', '佔第一關', '下一關開始人數', '開始→下一關開始', '過關人數', '過關後有開下一關'],
  levels.map((l) => [l.level, l.starters, pct(l.starters, first), startSet[l.level + 1] ?? '—', startSet[l.level + 1] != null ? pct(startSet[l.level + 1], l.starters) : '—', l.clearers, l.clearers && startSet[l.level + 1] != null ? pct(nextBy[l.level] ?? 0, l.clearers) : '—'])), '');
w('## 開機到選單可操作（毫秒）', '');
const bd = (d) => boots.filter((b) => b.dev === d).map((b) => b.boot_ms);
w(table(['裝置', 'session 數', 'p50', 'p90'], [['桌機', bd('d')], ['手機', bd('m')]].map(([n, a]) => [n, a.length, quantile(a, 0.5) ?? '—', quantile(a, 0.9) ?? '—'])), '');
w('## 無盡模式', '', endless.runs ? `${endless.runs} 局、${endless.anons} 人；平均距離 ${fix(endless.avg_dist, 0)}、最遠 ${endless.max_dist}。` : '_（沒有資料）_', '');
const md = L.join('\n');
if (outFile) { writeFileSync(outFile, md); console.error(`寫入 ${outFile}`); } else console.log(md);

// 障礙物長相：第 9 關（立在石柱上的石頭）、第 25 關（垂下來的石頭）、第 22 關（蝴蝶）各開一關，鏡頭停在第一個障礙物前截圖；順便確認 fx 圖集有 rock／bfly0／bfly1
// 用法：bun tools/perf/hazards.mjs [網址]
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('pageerror', (e) => logs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.goto(url, { timeout: 120000 });
await page.waitForFunction(() => performance.getEntriesByName('menu-ready').length > 0, null, { timeout: 60000 }); // 選單真的出來（state 在載入畫面收掉前就是 menu）
const missing = await page.evaluate(() => ['rock', 'bfly0', 'bfly1'].filter((k) => !window.__game.view.frames[k]));
await page.evaluate(() => { window.__game.save.unlocked = 90; });
const shots = [];
for (const [n, kind] of [[9, 'spikes'], [25, 'spikes'], [22, 'saws'], [33, 'spikes']]) {
  await page.evaluate((n) => window.__game.start(n), n);
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const at = await page.evaluate((kind) => { const g = window.__game, h = g.sim.level[kind][0]; if (!h) return null; g.freeze = true; g.camOverride = { p: [h.x - 1, Math.max(5, h.y + 1), 15] }; return [h.x, h.y]; }, kind);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}hazard-${n}.png` });
  shots.push({ level: n, kind, at });
  await page.evaluate(() => { window.__game.freeze = false; window.__game.camOverride = null; });
}
console.log(JSON.stringify({ missing, shots, logs }));
await browser.close();
process.exit(missing.length || logs.length ? 1 : 0);

// 重新產生 README 的截圖與示範 GIF：docs/shot-menu.jpg、shot-swing.jpg、shot-clear.jpg、shot-shop.jpg、docs/demo.gif。
// 用法：bun run build && bun run preview，然後 bun tools/perf/readme-shots.mjs [網址]（預設 http://localhost:4173/）。GIF 需要 PATH 上有 ffmpeg（devenv shell 有）。
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';

const url0 = process.argv[2] ?? 'http://localhost:4173/';
const url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1&lang=en&notelemetry`;
const docs = new URL('../../docs/', import.meta.url).pathname;
const W = 800, H = 450;
const browser = await chromium.launch({ ...BASE, ...GPU });
const waitFor = (page, expr, ms = 10000) => page.waitForFunction(expr, null, { timeout: ms });

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, ...opts });
  const page = await ctx.newPage();
  await page.goto(url);
  await waitFor(page, () => window.__game && window.__game.state === 'menu' && !document.getElementById('boot'), 20000); // 載入畫面淡出後才移除
  await page.waitForTimeout(800);
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: `${docs}${name}`, type: 'jpeg', quality: 85 });

// 選單
{ const { ctx, page } = await fresh(); await shot(page, 'shot-menu.jpg'); await ctx.close(); }
// 擺盪中：自動玩家玩第 3 關，等到黏著擺盪的那一刻
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => { window.__game.start(3); window.__game.autoplay = [0.25, -10]; });
  await page.waitForTimeout(2500);
  await waitFor(page, () => window.__game.sim && window.__game.sim.mode === 'swing', 8000).catch(() => {});
  await page.waitForTimeout(250);
  await shot(page, 'shot-swing.jpg'); await ctx.close();
}
// 過關浮層：三顆星亮完、金幣飛入時
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => window.__game.start(1));
  await page.waitForTimeout(900);
  await page.evaluate(() => { const s = window.__game.sim; s.fliesGot = s.level.flies.length; s.time = 1; window.__game.forceWin(); });
  await waitFor(page, () => window.__game.beat && window.__game.beat.t >= 1.15, 8000);
  await shot(page, 'shot-clear.jpg'); await ctx.close();
}
// 商店：給夠金幣，展示台是旋轉貓組合包
{
  const { ctx, page } = await fresh();
  await page.click('#shopBtn');
  await page.waitForTimeout(1500);
  await shot(page, 'shot-shop.jpg'); await ctx.close();
}
// 示範 GIF：錄自動玩家，取 6 秒轉成 480 寬、12 fps、64 色（約 1–2 MB）
{
  const dir = mkdtempSync(join(tmpdir(), 'sf-demo-'));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } } });
  const tv = Date.now(); // 錄影從開分頁這一刻起算
  const page = await ctx.newPage();
  await page.goto(url);
  await waitFor(page, () => window.__game && window.__game.state === 'menu', 20000);
  await page.evaluate(() => { window.__game.start(2); window.__game.autoplay = [0.25, -10]; });
  const t0 = Date.now();
  await page.waitForTimeout(8500);
  await ctx.close();
  const video = join(dir, readdirSync(dir).find((f) => f.endsWith('.webm')));
  const start = (t0 - tv) / 1000 + 1.2; // 跳過開機與選單，從進關後 1.2 秒開始
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(start), '-t', '6', '-i', video,
    '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    `${docs}demo.gif`]);
  rmSync(dir, { recursive: true, force: true });
}
await browser.close();
console.log('ok: docs/shot-menu.jpg shot-swing.jpg shot-clear.jpg shot-shop.jpg demo.gif');

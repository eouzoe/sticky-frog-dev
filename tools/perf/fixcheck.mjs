// 止血驗證（開發伺服器，含 SDK 腳本標籤）：
// A. SDK 晚 1.5 秒才就緒、雲端有另一份進度：選單不等它就出來；就緒後本機與雲端合併、寫回雲端；開局後才就緒也一樣
// B. 強制 WebGL context 掉再恢復：不黑畫面、沒有錯誤、恢復後還能開局畫圖
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const LOCAL = JSON.stringify({ unlocked: 12, stars: { 1: 3, 11: 1 }, coins: 90, owned: ['tree', 'none', 'tongue', 'dart'], skin: 'dart', updatedAt: 2000, last: 12 });
const CLOUD = JSON.stringify({ unlocked: 9, stars: { 1: 2, 5: 2 }, coins: 400, owned: ['tree', 'none', 'tongue', 'rainbow'], trail: 'rainbow', updatedAt: 1000, last: 9 });
// 假 SDK：init 1.5 秒後才 resolve；data 是記憶體裡的雲端存檔，setItem 會記錄最後寫入
const SDK = `window.__cloudWrites = []; window.CrazyGames = { SDK: { environment: 'local', init: () => new Promise((r) => setTimeout(r, 1500)),
  game: { loadingStart() {}, loadingStop() {}, gameplayStart() {}, gameplayStop() {}, happytime() {}, settings: {}, addSettingsChangeListener() {} },
  ad: {}, user: { systemInfo: {} },
  data: { store: { 'sticky-frog-v1': ${JSON.stringify(CLOUD)} }, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; window.__cloudWrites.push(JSON.parse(v)); }, removeItem(k) { delete this.store[k]; } } } };`;
const out = { errors: [] };

async function scenarioA(startBeforeReady) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`A ${e}`)); page.on('console', (m) => { if (m.type() === 'error') out.errors.push(`A ${m.text()}`); });
  await page.addInitScript((s) => { try { localStorage.setItem('sticky-frog-v1', s); } catch {} }, LOCAL);
  await page.route(/sdk\.crazygames\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SDK }));
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
  const menuAt = Date.now() - t0;
  const before = await page.evaluate(() => ({ unlocked: __game.save.unlocked, coins: __game.save.coins, play: document.getElementById('playLbl')?.textContent }));
  if (startBeforeReady) { await page.evaluate(() => __game.start(3)); await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 10000 }); }
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => ({ unlocked: __game.save.unlocked, coins: __game.save.coins, owned: __game.save.owned, state: __game.state, play: document.getElementById('playLbl')?.textContent,
    cloudLast: window.__cloudWrites.at(-1) ? { unlocked: window.__cloudWrites.at(-1).unlocked, coins: window.__cloudWrites.at(-1).coins, owned: window.__cloudWrites.at(-1).owned } : null, local: JSON.parse(localStorage.getItem('sticky-frog-v1')).unlocked }));
  await ctx.close();
  return { startBeforeReady, menuAtMs: menuAt, before, after };
}
out.sdkLateMenu = await scenarioA(false);
out.sdkLatePlaying = await scenarioA(true);

// B. context lost / restored
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
  page.on('pageerror', (e) => out.errors.push(`B ${e}`)); page.on('console', (m) => { if (m.type() === 'error') out.errors.push(`B ${m.text()}`); });
  await page.route(/sdk\.crazygames\.com/, (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const pix = async () => page.evaluate(() => { const gl = document.getElementById('c').getContext('webgl2'); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(4 * 64); let dark = 0; for (let i = 0; i < 64; i++) { gl.readPixels(Math.floor((i % 8) * w / 8 + w / 16), Math.floor(Math.floor(i / 8) * h / 8 + h / 16), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4)); if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] < 30) dark++; } return { darkOf64: dark, lost: gl.isContextLost() }; });
  const beforeLoss = await pix();
  await page.evaluate(() => { window.__ext = document.getElementById('c').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__ext.loseContext(); });
  await page.waitForTimeout(600);
  const whileLost = await page.evaluate(() => ({ lost: document.getElementById('c').getContext('webgl2')?.isContextLost?.() ?? 'n/a', viewLost: __game.view.R.lost }));
  await page.evaluate(() => window.__ext.restoreContext());
  await page.waitForTimeout(2000);
  const afterRestore = await pix();
  await page.screenshot({ path: `${OUT}ctx-restored-menu.png` });
  await page.evaluate(() => __game.start(1)); await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 10000 });
  await page.evaluate(() => { __game.autoplay = [0.25, -2]; }); await page.waitForTimeout(1500);
  const playing = await pix();
  await page.screenshot({ path: `${OUT}ctx-restored-play.png` });
  await ctx.close();
  out.contextLoss = { beforeLoss, whileLost, afterRestore, playing };
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
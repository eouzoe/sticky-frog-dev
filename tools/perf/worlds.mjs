// 六個世界各截一張遊玩畫面＋選單；記錄貼圖常駐量與 draw call
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';
const [url = 'http://localhost:5173/', tag = 'w'] = process.argv.slice(2);
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ ...BASE, ...GPU });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('pageerror', (e) => logs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}${tag}-menu.png` });
const stats = [];
for (let wi = 0; wi < 6; wi++) {
  await page.evaluate((n) => { const g = window.__game; g.save.unlocked = 90; g.autoplay = null; g.start(n); }, wi * 15 + 2);
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 20000 });
  await page.evaluate(() => { window.__game.autoplay = [0.25, -2]; });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}${tag}-${wi}.png` });
  stats.push(await page.evaluate((wi) => ({ wi, texMB: +(window.__game.atlasBytes / 1048576).toFixed(1), draw: window.__game.view.drawCalls, fps: window.__game.fps }), wi));
}
console.log(JSON.stringify({ stats, logs }));
await browser.close();

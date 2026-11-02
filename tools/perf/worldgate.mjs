// 從世界 0 的選單直接開世界 1、2 的關：進入 playing 的第一幀，那個世界的圖集必須已經在（鉤子的圖要存在）；記錄等了多久
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';
const url0 = process.argv[2] ?? 'http://localhost:5173/', url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1`; // 正式版要 ?debug=1 才有 __game
const browser = await chromium.launch({ ...BASE, ...GPU });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 1e6 / 8 }); // 慢 4G：圖集要幾百毫秒才到
const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
const out = [];
for (const n of [16, 31, 2, 15, 16]) {
  const r = await page.evaluate(async (n) => {
    const g = window.__game; g.save.unlocked = 90;
    const wi = Math.floor((n - 1) / 15), readyBefore = g.view.worldReady(wi), t0 = performance.now();
    g.start(n);
    // 等到 playing 的第一幀
    await new Promise((res) => { const tick = () => (g.state === 'playing' && g.level === n && g.startedAt > t0 ? res() : requestAnimationFrame(tick)); tick(); });
    await new Promise((res) => requestAnimationFrame(res));
    return { level: n, world: wi, readyBefore, waitedMs: Math.round(performance.now() - t0), readyAtPlay: g.view.worldReady(wi), hookFrame: !!g.view.wf('hook'), state: g.state };
  }, n);
  out.push(r);
  await page.waitForTimeout(600);
}
console.log(JSON.stringify({ out, errs }));
await browser.close();

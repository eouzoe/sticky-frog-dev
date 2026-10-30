// 三種貓質感各截：主頁站姿、點一下旋轉中、商店展示台（桌機＋手機）
// 用法：bun catlooks.mjs <網址>
import { chromium } from 'playwright-core';
const url0 = process.argv[2] ?? 'http://localhost:5173/', url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1`; // 正式版要 ?debug=1 才有 __game
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const logs = [];
for (const look of ['sticker', 'scene', 'plain']) {
  for (const [dev, ctxOpt] of [['desk', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(ctxOpt), page = await ctx.newPage();
    page.on('pageerror', (e) => logs.push(`${look}/${dev} ${e}`)); page.on('console', (m) => { if (m.type() === 'error') logs.push(`${look}/${dev} ${m.text()}`); });
    await page.goto(`${url}?catlook=${look}`);
    await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
    await page.evaluate(() => { const g = window.__game; g.save.skin = 'cat'; if (!g.save.owned.includes('cat')) g.save.owned.push('cat'); g.look('cat'); });
    await page.click('#shopBtn'); await page.waitForTimeout(900);
    if (dev === 'desk') await page.screenshot({ path: `${OUT}look-${look}-shop.png`, clip: await page.locator('#showcase').boundingBox() });
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}look-${look}-${dev}-stand.png` });
    await page.locator('#heroImg').dispatchEvent('pointerdown');
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${OUT}look-${look}-${dev}-spin.png` });
    if (dev === 'desk') { const hero = page.locator('#heroImg'); for (const [i, d] of [[0, 30], [1, 60], [2, 70]]) { await page.waitForTimeout(d); await page.screenshot({ path: `${OUT}look-${look}-hero${i}.png`, clip: await hero.boundingBox() }); } }
    await ctx.close();
  }
}
console.log(JSON.stringify(logs));
await browser.close();

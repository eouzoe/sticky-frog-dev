// 開機路徑的 performance.measure 清單（同一個瀏覽器載兩次，取第二次＝著色器與 GPU 暖機後）；也印 menu-ready 時間
// 用法：bun bootmarks.mjs <網址> [gpu|swift] [cpuRate]
import { chromium } from 'playwright-core';
const [url = 'http://localhost:4180/', mode = 'gpu', rate = '1'] = process.argv.slice(2);
const LAUNCH = mode === 'gpu' ? { args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, ...LAUNCH });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
let res;
for (let i = 0; i < 2; i++) {
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page); // 每次新分頁：不被上一頁的拆除擋住
  if (+rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +rate });
  await page.goto(url);
  await page.waitForFunction(() => performance.getEntriesByName('menu-ready').length > 0, null, { timeout: 60000 });
  res = await page.evaluate(() => ({ menuReady: Math.round(performance.getEntriesByName('menu-ready')[0].startTime),
    nav: (({ responseEnd, domInteractive, domContentLoadedEventEnd }) => ({ htmlDone: Math.round(responseEnd), domInteractive: Math.round(domInteractive), dcl: Math.round(domContentLoadedEventEnd) }))(performance.getEntriesByType('navigation')[0]),
    marks: performance.getEntriesByType('mark').map((m) => [m.name, Math.round(m.startTime)]),
    res: performance.getEntriesByType('resource').map((r) => [r.name.split('/').pop().split('?')[0], Math.round(r.startTime), Math.round(r.responseEnd), r.transferSize]).sort((a, b) => a[1] - b[1]),
    measures: performance.getEntriesByType('measure').map((m) => [m.name, Math.round(m.startTime), +m.duration.toFixed(1)]).sort((a, b) => b[2] - a[2]) }));
  if (i === 0) await page.waitForTimeout(1500);
}
console.log(JSON.stringify(res));
await browser.close();

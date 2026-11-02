// 遊玩中的每幀成本：CPU 取樣剖析（自身耗時排行）＋填充量（每幀所有四邊形的面積＋兩個全螢幕通道，換算成 overdraw 倍數）
// 真 GPU（WSL D3D12）、手機 390×844 DPR3、CPU 降速 4 倍；第 1 關與第 48 關（火山）各 6 秒自動玩家
// 用法：bun playprof.mjs <dist>
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
const DIST = resolve(process.argv[2]), PORT = 5794;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const server = createServer((req, res) => { const u = decodeURIComponent(new URL(req.url, 'http://x').pathname); const f = join(DIST, u === '/' ? 'index.html' : u); if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; } const b = readFileSync(f); res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'content-length': b.length }); res.end(b); });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
// 填充量探針：包住渲染器的四種畫法，累計每幀面積（CSS 像素）
await page.evaluate(() => {
  const g = window.__game, R = g.view.R, F = (window.__fill = { area: 0, n: 0, frames: 0, sum: 0, nsum: 0, max: 0 });
  const poly = (x0, y0, x1, y1, x2, y2, x3, y3) => Math.abs((x0 * y1 - x1 * y0) + (x1 * y3 - x3 * y1) + (x3 * y2 - x2 * y3) + (x2 * y0 - x0 * y2)) / 2; // TL,TR,BR,BL
  const s = R.sprite, sm = R.spriteM, q = R.quad, qu = R.quadUV;
  R.sprite = function (f, x, y, rot, kx, ky, ...r) { F.area += Math.abs(kx * ky) * f.w * f.h * (r[4] !== undefined ? (r[4] ?? 1) - (r[3] ?? 0) : 1); F.n++; return s.call(this, f, x, y, rot, kx, ky, ...r); };
  R.spriteM = function (f, m, ...r) { F.area += Math.abs(m[0] * m[3] - m[1] * m[2]) * f.w * f.h; F.n++; return sm.call(this, f, m, ...r); };
  R.quad = function (t, x0, y0, x1, y1, x2, y2, x3, y3, ...r) { F.area += poly(x0, y0, x1, y1, x3, y3, x2, y2); F.n++; return q.call(this, t, x0, y0, x1, y1, x2, y2, x3, y3, ...r); };
  R.quadUV = function (t, x0, y0, u0, v0, x1, y1, u1, v1, x2, y2, u2, v2, x3, y3, ...r) { F.area += poly(x0, y0, x1, y1, x3, y3, x2, y2); F.n++; return qu.call(this, t, x0, y0, u0, v0, x1, y1, u1, v1, x2, y2, u2, v2, x3, y3, ...r); };
  const v = g.view, rr = v.render; v.render = function () { F.area = 0; F.n = 0; const out = rr.apply(this, arguments); F.frames++; F.sum += F.area; F.nsum += F.n; F.max = Math.max(F.max, F.area); return out; };
});
async function run(level) {
  await page.evaluate((n) => { const g = window.__game; g.autoplay = null; g.start(n); }, level);
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.autoplay = [0.25, -2]; });
  await page.waitForTimeout(1000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => Object.assign(window.__fill, { frames: 0, sum: 0, nsum: 0, max: 0 }));
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  const t0 = Date.now(); await page.waitForTimeout(6000);
  const { profile } = await cdp.send('Profiler.stop'); const secs = (Date.now() - t0) / 1000;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const fill = await page.evaluate(() => { const F = window.__fill, W = innerWidth, H = innerHeight, dpr = window.__game.view.R.dpr; return { frames: F.frames, quadsPerFrame: Math.round(F.nsum / Math.max(1, F.frames)), spriteAreaPerFrame_screens: +(F.sum / Math.max(1, F.frames) / (W * H)).toFixed(2), maxSpriteArea_screens: +(F.max / (W * H)).toFixed(2), fullscreenPasses: 2, dpr, canvasPx: Math.round(W * dpr) + 'x' + Math.round(H * dpr) }; });
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); let total = 0;
  const name = (n) => { const cf = n.callFrame; return `${cf.functionName || '(匿名)'} ${cf.url ? cf.url.split('/').pop().replace(/-[\w-]{8}\.js$/, '.js') : ''}${cf.url ? ':' + (cf.lineNumber + 1) : ''}`; };
  for (let i = 0; i < profile.samples.length; i++) { const dt = (profile.timeDeltas[i + 1] ?? 0) / 1000; total += dt; const k = name(byId.get(profile.samples[i])); self.set(k, (self.get(k) ?? 0) + dt); }
  const idle = self.get('(idle) ') ?? 0;
  return { level, secs: +secs.toFixed(1), renders: fill.frames, fps: +(fill.frames / secs).toFixed(1), busyMsPerFrame: +((total - idle) / Math.max(1, fill.frames)).toFixed(1), fill,
    topSelf: [...self.entries()].filter(([k]) => k !== '(idle) ').sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${(v / Math.max(1, fill.frames)).toFixed(2)}ms/幀  ${k}`) };
}
const out = [await run(1), await run(48)];
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();

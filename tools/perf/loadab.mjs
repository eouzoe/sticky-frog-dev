// 交錯比較載入時間：每一輪每個版本各跑一次、順序輪流，機器負載漂移對各版本影響相同
// 用法：bun loadab.mjs <情境 A|M|B> <輪數> <dist1> <dist2> ...
// ready＝選單第一幀畫完（載入畫面開始退場），從導覽開始算；真 GPU（WSL D3D12）、預熱、冷快取
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import { extname, join, resolve, basename } from 'node:path';
import { chromium } from 'playwright-core';

const [scen, roundsArg, ...distArgs] = process.argv.slice(2);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const serve = (dir, port) => {
  const zc = new Map();
  const s = createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = join(dir, u === '/' ? 'index.html' : u);
    if (!f.startsWith(dir) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    const ext = extname(f); let body = readFileSync(f); const h = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
    if (['.html', '.js', '.css'].includes(ext) && (req.headers['accept-encoding'] ?? '').includes('br')) {
      if (!zc.has(f)) zc.set(f, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
      body = zc.get(f); h['content-encoding'] = 'br';
    }
    h['content-length'] = body.length; res.writeHead(200, h); res.end(body);
  });
  return new Promise((r) => s.listen(port, '127.0.0.1', () => r(s)));
};
const dists = distArgs.map((d, i) => ({ name: basename(resolve(d)), dir: resolve(d), port: 5800 + i, runs: [] }));
const servers = await Promise.all(dists.map((d) => serve(d.dir, d.port)));

const SCEN = {
  A: { ctx: { viewport: { width: 1280, height: 720 } }, cpu: 1, net: null },
  M: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, net: null },
  B: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, net: { latency: 170, down: 9e6 / 8, up: 1.5e6 / 8 } },
}[scen];
const INIT = `(() => { const T = window.__lt = { p: {} }; let inner = null;
  Object.defineProperty(window, '__bootP', { configurable: true, set(f) { inner = f; }, get() { return (p) => { T.p[p] = performance.now(); inner && inner(p); }; } }); })();`;

const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
{ const c = await browser.newContext(), p = await c.newPage(); await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); gl.clear(gl.COLOR_BUFFER_BIT); gl.finish(); }); await c.close(); }

async function once(d) {
  const ctx = await browser.newContext(SCEN.ctx), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (SCEN.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: SCEN.net.latency, downloadThroughput: SCEN.net.down, uploadThroughput: SCEN.net.up });
  if (SCEN.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: SCEN.cpu });
  await page.addInitScript(INIT);
  await page.route(/sdk\.crazygames\.com/, (r) => r.abort());
  const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${d.port}/`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__lt?.p[1] != null, null, { timeout: 60000, polling: 20 });
  const m = await page.evaluate(() => ({ js: window.__lt.p[0.1], view: window.__lt.p[0.6], ready: window.__lt.p[1] }));
  await ctx.close();
  if (errs.length) m.errs = errs;
  return m;
}
const R = +roundsArg;
for (let i = 0; i < R; i++) {
  const order = i % 2 ? dists.toReversed() : dists;
  for (const d of order) d.runs.push(await once(d));
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
const out = dists.map((d) => {
  const r = d.runs.map((x) => x.ready);
  return { dist: d.name, readyMin: q(r, 0), readyP25: q(r, 0.25), readyMedian: q(r, 0.5), jsMedian: q(d.runs.map((x) => x.js), 0.5), viewMedian: q(d.runs.map((x) => x.view), 0.5), all: r.map(Math.round), errs: d.runs.flatMap((x) => x.errs ?? []) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close(); for (const s of servers) s.close();

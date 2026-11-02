// 載入時間量測：正式建置、冷快取（每次新開瀏覽器環境）、每情境跑 N 次取中位數
// 用法：bun loadtime.mjs <dist 資料夾> [情境,逗號分隔] [N] [sdk: none|fast|slow]
// 時間點全部從「導覽開始」（performance.timeOrigin）算起：
//   html  = HTML 收完        js = 主程式開始跑（boot 第一行）     view = WebGL＋共用圖集好
//   sdk   = SDK 等待結束      ready = 世界圖集＋造型＋語系＋第一幀畫完（載入畫面開始退場）
//   input = 載入畫面不再擋點擊（ready＋120ms）     net = 開機期間最後一個請求收完
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';

const [distArg, onlyArg = 'A,M,B', nArg = '7', sdkMode = 'none', gpuMode = 'gpu'] = process.argv.slice(2);
const DIST = resolve(distArg), N = +nArg, PORT = 5791;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const TEXTY = new Set(['.html', '.js', '.css']);
const zc = new Map();
const server = createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(DIST, u === '/' ? 'index.html' : u);
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  const ext = extname(f); let body = readFileSync(f); const h = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
  if (TEXTY.has(ext) && (req.headers['accept-encoding'] ?? '').includes('br')) {
    if (!zc.has(f)) zc.set(f, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
    body = zc.get(f); h['content-encoding'] = 'br';
  }
  h['content-length'] = body.length; res.writeHead(200, h); res.end(body);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const SCEN = {
  A: { name: '桌機 1280×720、不節流、本機網路', ctx: { viewport: { width: 1280, height: 720 } }, cpu: 1, net: null },
  M: { name: '手機 390×844 DPR3、CPU 降速 4 倍、本機網路', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, net: null },
  B: { name: '手機 390×844 DPR3、CPU 降速 4 倍、4G（9 Mbps、RTT 170ms）', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, net: { latency: 170, down: 9e6 / 8, up: 1.5e6 / 8 } },
};

const INIT = `(() => {
  const T = window.__lt = { p: {}, out: null };
  let inner = null;
  Object.defineProperty(window, '__bootP', { configurable: true,
    set(f) { inner = f; },
    get() { return (p) => { T.p[p] = performance.now(); inner && inner(p); }; } });
  new MutationObserver(() => { const b = document.getElementById('boot'); if (b && b.classList.contains('out') && T.out == null) T.out = performance.now(); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  // 計時：同步呼叫記總耗時與第一次發生的時間點；createImageBitmap 記從呼叫到完成
  T.gl = {}; T.lt = [];
  const acc = (k, t0) => { const d = performance.now() - t0, e = T.gl[k] ??= { n: 0, ms: 0, at: Math.round(t0) }; e.n++; e.ms += d; };
  const wrap = (obj, name, key = name) => { const o = obj[name]; if (!o) return; obj[name] = function (...a) { const t0 = performance.now(); try { return o.apply(this, a); } finally { acc(key, t0); } }; };
  wrap(HTMLCanvasElement.prototype, 'getContext');
  const P = WebGL2RenderingContext.prototype;
  for (const n of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap', 'drawArrays', 'drawElements', 'bufferData', 'bufferSubData']) wrap(P, n);
  const cib = window.createImageBitmap; window.createImageBitmap = function (...a) { const t0 = performance.now(); return cib.apply(this, a).finally(() => acc('createImageBitmap', t0)); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) T.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
})();`;
const SDK = {
  fast: 'window.CrazyGames={SDK:{init:()=>Promise.resolve(),environment:"crazygames",game:{},ad:{},data:{getItem:()=>null,setItem(){},removeItem(){}},user:{systemInfo:{}}}};',
  slow: 'window.CrazyGames={SDK:{init:()=>new Promise(()=>{}),game:{},ad:{},data:{}}};',
};

const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? Math.round(s[s.length >> 1]) : null; };
// gpu：WSL 的 D3D12（Mesa d3d12 → Windows 實體 GPU）；swift：SwiftShader 軟體模擬
const LAUNCH = gpuMode === 'gpu'
  ? GPU
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const browser = await chromium.launch({ ...BASE, ...LAUNCH });
// 預熱：真實使用者打開遊戲時瀏覽器早就開著、GPU 行程已經初始化；這筆一次性成本不算進載入時間
{ const c = await browser.newContext(), p = await c.newPage(); {
  const r = await p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl.getExtension('WEBGL_debug_renderer_info'); gl.clear(gl.COLOR_BUFFER_BIT); gl.finish(); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  console.error(`渲染器：${r}`); } await c.close(); }
const out = {};
for (const k of onlyArg.split(',')) {
  const S = SCEN[k], runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext(S.ctx), page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (S.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: S.net.latency, downloadThroughput: S.net.down, uploadThroughput: S.net.up });
    if (S.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: S.cpu });
    await page.addInitScript(INIT);
    await page.route(/sdk\.crazygames\.com/, async (route) => {
      if (sdkMode === 'slow') await new Promise((r) => setTimeout(r, 300));
      if (sdkMode === 'none') return route.abort();
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: SDK[sdkMode] });
    });
    const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.__lt?.out != null, null, { timeout: 60000, polling: 20 });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const T = window.__lt, nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource').filter((e) => e.startTime < T.p[1]);
      return { html: nav.responseEnd, dcl: nav.domContentLoadedEventEnd, js: T.p[0.1], view: T.p[0.6], sdk: T.p[0.9], ready: T.p[1], input: T.out,
        net: Math.max(nav.responseEnd, ...res.map((e) => e.responseEnd)), reqs: res.length + 1,
        bytes: nav.transferSize + res.reduce((a, e) => a + e.transferSize, 0),
        gl: Object.fromEntries(Object.entries(T.gl).map(([k, v]) => [k, `${v.n}× ${v.ms.toFixed(1)}ms @${v.at}`])), longtasks: T.lt,
        list: res.map((e) => `${e.name.split('/').pop()} ${Math.round(e.startTime)}→${Math.round(e.responseEnd)}ms ${e.transferSize}B`) };
    });
    if (errs.length) r.errs = errs;
    runs.push(r);
    await ctx.close();
  }
  const keys = ['html', 'js', 'view', 'sdk', 'ready', 'input', 'net'];
  out[k] = { name: S.name, sdk: sdkMode, median: Object.fromEntries(keys.map((x) => [x, med(runs.map((r) => r[x]))])),
    readyAll: runs.map((r) => Math.round(r.ready)), reqs: runs[0].reqs, kb: +(runs[0].bytes / 1024).toFixed(1), sample: runs[runs.length >> 1].list, gl: runs[runs.length >> 1].gl, longtasks: runs[runs.length >> 1].longtasks, errs: runs.flatMap((r) => r.errs ?? []) };
  console.error(`[${k}] ${S.name}：ready 中位數 ${out[k].median.ready}ms（${out[k].readyAll.join(' / ')}）`);
}
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));

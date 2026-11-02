// 真實條件量測（Playwright＋CDP）：模擬手機螢幕、CPU 與網路節流，量載入與遊玩的數字。
// 一行重跑（一律包 heavy.sh；--build 會先 npm run build）：
//   /Users/eason/Studio/games/crazygames/_tools/heavy.sh node tests/perf-real.mjs --build --label after --out tests/perf-after.json
// 旗標：--dist <資料夾>（預設 ./dist）  --only A,B,C（預設三種都跑）  --port 5779
//       --uncap：關掉垂直同步與 60fps 上限，讓影格時間反映真實成本（預設會被 60Hz 蓋住，改前改後都是 16.7ms，看不出差別）；只拿遊玩影格時間的數字，閒置／暫停的數字請用不加 --uncap 的結果
// 情境：A 桌機 1280×720 不節流；B 手機 390×844 DSF3 觸控、CPU 4×、網路 9/1.5 Mbps RTT 170ms；C 慢手機 CPU 6×、1.6 Mbps RTT 560ms。
// 限制：無頭瀏覽器用這台 Mac 的 GPU，GPU 負擔模擬不出來；CPU 節流只放慢主執行緒。真機要自己測。
// SDK：sdk.crazygames.com 用假腳本代替（延遲 300ms 才回，init() 永遠不 resolve），重現「不在 CrazyGames 網域時要等 4 秒逾時」；該請求不計入數字。
const { chromium } = await import('playwright-core').catch(() => import('/Users/eason/Studio/games/crazygames/_tools/node_modules/playwright-core/index.mjs'));
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DIST = resolve(opt('dist', 'dist')), PORT = +opt('port', 5779), OUT = opt('out', null), LABEL = opt('label', 'run');
const ONLY = (opt('only', 'A,B,C')).split(',');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
if (argv.includes('--build')) { const r = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' }); if (r.status) process.exit(r.status); }

// ---- 靜態伺服器：文字類資源開 br/gzip（模擬 CDN），其他原樣 ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.png': 'image/png' };
const TEXTY = new Set(['.html', '.js', '.css', '.json', '.svg']);
const zcache = new Map();
const server = createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = join(DIST, u === '/' ? 'index.html' : u);
  if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  const ext = extname(f); let body = readFileSync(f); const h = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
  const ae = req.headers['accept-encoding'] ?? '';
  if (TEXTY.has(ext)) {
    const enc = ae.includes('br') ? 'br' : ae.includes('gzip') ? 'gzip' : null;
    if (enc) { const k = `${enc}|${f}`; if (!zcache.has(k)) zcache.set(k, enc === 'br' ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } }) : gzipSync(body, { level: 6 })); body = zcache.get(k); h['content-encoding'] = enc; }
  }
  h['content-length'] = body.length; res.writeHead(200, h); res.end(body);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, '127.0.0.1', r); });

const SCEN = {
  A: { name: '桌機 1280×720 不節流', ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 }, cpu: 1, net: null },
  B: { name: '手機 390×844 DSF3 CPU4× 9Mbps/1.5Mbps RTT170', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, net: { latency: 170, down: 9e6 / 8, up: 1.5e6 / 8 } },
  C: { name: '慢手機 390×844 DSF3 CPU6× 1.6Mbps RTT560', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 6, net: { latency: 560, down: 1.6e6 / 8, up: 0.75e6 / 8 } },
};
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 頁面內的探針：在任何腳本之前裝好
const INIT = `(() => {
  const T = window.__t = { boot: null, menu: null, render: 0, raf: 0, frames: [], rec: false };

  // 通用 GL 探針（兩版都適用）：draw call、三角形、貼圖上傳位元組
  T.dc = 0; T.tri = 0; T.texBytes = 0;
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const wrapDraw = (name, countArg) => { const o = P[name]; if (!o) return; P[name] = function (...a) { T.dc++; if (a[0] === 4) T.tri += (a[countArg] | 0) / 3; return o.apply(this, a); }; };
    wrapDraw('drawElements', 1); wrapDraw('drawArrays', 2); wrapDraw('drawElementsInstanced', 1); wrapDraw('drawArraysInstanced', 2);
    const ti = P.texImage2D; P.texImage2D = function (...a) { if (a.length >= 9) T.texBytes += (a[3] | 0) * (a[4] | 0) * 4; else if (a[5]) T.texBytes += (a[5].width | 0) * (a[5].height | 0) * 4; return ti.apply(this, a); };
    const ts = P.texStorage2D; if (ts) P.texStorage2D = function (...a) { T.texBytes += (a[3] | 0) * (a[4] | 0) * 4; return ts.apply(this, a); };
  }
  let lastF = 0;
  const loop = (now) => {
    requestAnimationFrame(loop); T.raf++;
    if (T.rec) { if (lastF) T.frames.push(now - lastF); lastF = now; } else lastF = 0;
    if (T.boot == null) { const b = document.getElementById('boot'); if (b && b.offsetHeight > 0) T.boot = now; }
    const g = window.__game;
    if (T.menu == null && g && g.state === 'menu') { const b = document.getElementById('boot'); if (!b || b.classList.contains('done') || b.classList.contains('out')) T.menu = now; }
    if (g && !T.hooked && g.view) { T.hooked = 1; const r = g.view.renderer?.render ? g.view.renderer : g.view, o = r.render.bind(r); r.render = (...a) => { T.render++; return o(...a); }; }
  };
  requestAnimationFrame(loop);
})();`;
const SDK_STUB = 'window.CrazyGames={SDK:{init:()=>new Promise(()=>{}),game:{},ad:{},data:{}}};';

async function runScenario(browser, key) {
  const S = SCEN[key], r = { name: S.name };
  const ctx = await browser.newContext(S.ctx);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  if (S.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: S.net.latency, downloadThroughput: S.net.down, uploadThroughput: S.net.up });
  if (S.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: S.cpu });
  await page.addInitScript(INIT);
  await page.route(/sdk\.crazygames\.com/, async (route) => { await sleep(300); await route.fulfill({ status: 200, contentType: 'text/javascript', body: SDK_STUB }); });
  // 請求帳：wallTime（秒）＋ 解碼大小（dataReceived）＋ 傳輸大小（loadingFinished）
  const reqs = new Map();
  cdp.on('Network.requestWillBeSent', (e) => { if (/sdk\.crazygames\.com/.test(e.request.url)) return; reqs.set(e.requestId, { url: e.request.url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''), wall: e.wallTime * 1000, raw: 0, wire: 0 }); });
  cdp.on('Network.dataReceived', (e) => { const q = reqs.get(e.requestId); if (q) q.raw += e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const q = reqs.get(e.requestId); if (q) q.wire = e.encodedDataLength; });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const busy = async () => { const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value])); return [m.TaskDuration, m.Timestamp]; };
  const stats = async (ms) => { // 一段時間內：render 次數／秒、主執行緒忙碌比例
    const [b0, t0] = await busy(), r0 = await ev(() => window.__t.render), f0 = await ev(() => window.__t.raf);
    await sleep(ms);
    const [b1, t1] = await busy(), r1 = await ev(() => window.__t.render), f1 = await ev(() => window.__t.raf), dt = t1 - t0;
    return { renderPerSec: +((r1 - r0) / dt).toFixed(2), rafPerSec: +((f1 - f0) / dt).toFixed(2), busyRatio: +((b1 - b0) / dt).toFixed(3) };
  };
  const waitFor = async (fn, ms, what) => { try { await page.waitForFunction(fn, null, { timeout: ms, polling: 100 }); return true; } catch { r.errors = [...(r.errors ?? []), `逾時：${what}`]; return false; } };
  const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'commit' });
  await waitFor(() => window.__t?.menu != null, 150000, '選單可按');
  const T1 = await ev(() => ({ boot: window.__t.boot, menu: window.__t.menu, origin: performance.timeOrigin }));
  r.fcpMs = await ev(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  r.bootVisibleMs = T1.boot == null ? null : Math.round(T1.boot); r.menuReadyMs = T1.menu == null ? null : Math.round(T1.menu);
  await sleep(1500);
  r.menuIdle5s = await stats(5000);
  // 按 PLAY → 第一格遊玩畫面
  const tPlay0 = await ev(() => performance.now());
  await (S.ctx.hasTouch ? page.tap('#playBtn') : page.click('#playBtn'));
  await waitFor(() => window.__game.state === 'playing', 60000, '進入遊玩');
  await ev(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  const tFirst = await ev(() => performance.now());
  r.playMs = Math.round(tFirst - tPlay0); r.firstPlayFrameMs = Math.round(tFirst);
  const cut = T1.origin + tFirst;
  const before = [...reqs.values()].filter((q) => q.wall <= cut);
  r.beforeFirstPlay = { requests: before.length, rawBytes: before.reduce((a, q) => a + q.raw, 0), wireBytes: before.reduce((a, q) => a + q.wire, 0) };
  r.requestList = before.map((q) => `${q.url} raw=${q.raw} wire=${q.wire}`);
  // 自動玩家 10 秒：影格時間、draw calls、三角形
  const play10 = async (level) => {
    if (level) { await ev((n) => { window.__game.autoplay = null; window.__game.start(n); }, level); await waitFor(() => window.__game.state === 'playing', 60000, `關卡 ${level}`); }
    await ev(() => { window.__game.autoplay = [0.25, -2]; window.__t.frames = []; window.__t.rec = true; window.__t.dc0 = window.__t.dc; window.__t.tri0 = window.__t.tri; window.__t.r0 = window.__t.render; });
    const [pb0] = await busy();
    const st = await stats(10000);
    const [pb1] = await busy();
    const o = await ev(() => { window.__t.rec = false; const n = Math.max(1, window.__t.render - window.__t.r0); return { frames: window.__t.frames, dc: +((window.__t.dc - window.__t.dc0) / n).toFixed(1), tri: Math.round((window.__t.tri - window.__t.tri0) / n), renders: n, q: window.__game.quality, fps: window.__game.fps, state: window.__game.state }; });
    return { frameMsP50: pct(o.frames, 0.5), frameMsP95: pct(o.frames, 0.95), frameCount: o.frames.length, drawCalls: o.dc, triangles: o.tri, mainMsPerRender: +(((pb1 - pb0) * 1000) / o.renders).toFixed(2), renders: o.renders, quality: o.q, state: o.state, busyRatio: st.busyRatio, renderPerSec: st.renderPerSec };
  };
  r.level1Autoplay10s = await play10(null);
  // 暫停 5 秒
  await ev(() => { window.__game.autoplay = null; window.__game.start(1); }); // 自動玩家可能已過關（結算畫面不能暫停）：重開第 1 關、不操作
  await waitFor(() => window.__game.state === 'playing', 60000, '重開第 1 關');
  await sleep(500);
  await page.keyboard.press('Escape');
  await waitFor(() => window.__game.state === 'paused', 10000, '暫停');
  await sleep(800);
  r.pause5s = await stats(5000);
  // 火山關（第 4 世界第 3 關＝第 48 關）
  r.volcanoAutoplay10s = await play10(48);
  const all = [...reqs.values()];
  r.jsHeapMB = await ev(() => +(performance.memory?.usedJSHeapSize / 1048576).toFixed(1)); r.texUploadMB = await ev(() => +(window.__t.texBytes / 1048576).toFixed(1));
  r.totalAll = { requests: all.length, rawBytes: all.reduce((a, q) => a + q.raw, 0), wireBytes: all.reduce((a, q) => a + q.wire, 0) };
  if (errs.length) r.pageErrors = errs;
  await ctx.close();
  return r;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', ...(argv.includes('--uncap') ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])] });
const result = { label: LABEL, at: new Date().toISOString(), dist: DIST, note: 'WSL2 無 GPU：SwiftShader 軟體光柵＋軟體合成，影格時間不可信；看下載、主執行緒每幀毫秒、draw call、貼圖量', scenarios: {} };
try {
  for (const k of ONLY) {
    console.log(`[perf] 情境 ${k}：${SCEN[k].name}`);
    const s = result.scenarios[k] = await runScenario(browser, k);
    console.log(`  boot=${s.bootVisibleMs}ms menu=${s.menuReadyMs}ms play=${s.playMs}ms req=${s.beforeFirstPlay.requests} wire=${s.beforeFirstPlay.wireBytes} idleBusy=${s.menuIdle5s.busyRatio} idleRender/s=${s.menuIdle5s.renderPerSec} pauseRender/s=${s.pause5s.renderPerSec} p95=${s.level1Autoplay10s.frameMsP95}/${s.volcanoAutoplay10s.frameMsP95} q=${s.level1Autoplay10s.quality}/${s.volcanoAutoplay10s.quality}${s.errors ? ' ERR ' + s.errors : ''}`);
    await sleep(2000);
  }
} finally { await browser.close(); server.close(); }
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2));
else console.log(JSON.stringify(result, null, 2));

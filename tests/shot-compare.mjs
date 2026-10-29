// 畫面比對：虛擬時鐘（rAF 與 performance.now 由腳本一格一格推、Math.random 固定種子）讓同一關同一位置的畫面可重現，
// 兩個 dist 各拍一輪後逐像素比；或同一個 dist 拍高／中／低三級並排成一張圖。
// 用法（一律包 heavy.sh）：
//   比兩版：node tests/shot-compare.mjs --a <dist 舊> --b <dist 新> --out <輸出資料夾>
//   三級並排：node tests/shot-compare.mjs --tiers --b <dist> --out <輸出資料夾> [--mobile]
// 旗標：--a-q / --b-q 傳給頁面的 ?q=（預設都不帶＝桌機自動高畫質）；--port 5779
const { chromium } = await import('playwright-core').catch(() => import('/Users/eason/Studio/games/crazygames/_tools/node_modules/playwright-core/index.mjs'));
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(opt('out', 'shots')), PORT = +opt('port', 5779), MOBILE = argv.includes('--mobile');
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const serve = (dist) => new Promise((ok, bad) => {
  const s = createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = join(dist, u === '/' ? 'index.html' : u);
    if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' }); res.end(readFileSync(f));
  });
  s.once('error', bad); s.listen(PORT, '127.0.0.1', () => ok(s));
});
const INIT = `(() => {
  let vt = 1000, cbs = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { cbs.push(cb); return cbs.length; };
  window.__step = (n = 1) => { for (let i = 0; i < n; i++) { vt += 1000 / 60; const c = cbs; cbs = []; for (const f of c) f(vt); } };
  window.__seed = (a) => { Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  window.__seed(1);
})();`;
const ONE = opt('scene', null); // --scene l1：只拍一個場景
const ALL_SCENES = [
  { name: 'menu', level: 0, frames: 90 },
  { name: 'l1', level: 1, frames: 240 },
  { name: 'l48-volcano', level: 48, frames: 240 },
  { name: 'l20-candy', level: 20, frames: 240 },
];
const SCENES = ONE ? ALL_SCENES.filter((x) => x.name === ONE) : ALL_SCENES;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEW = MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 };

async function shootAll(browser, dist, q, tag) {
  const srv = await serve(resolve(dist)), files = {};
  try {
    for (const sc of SCENES) {
      const ctx = await browser.newContext(VIEW), page = await ctx.newPage();
      await page.addInitScript(INIT);
      await page.route(/sdk\.crazygames\.com/, (r) => r.abort());
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await page.goto(`http://127.0.0.1:${PORT}/${q ? `?q=${q}` : ''}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000, polling: 100 });
      // 選單階段不推時間：新版選單只畫 15fps，推了兩版的動畫時鐘就對不齊；遊玩畫面從第 0 格開始兩版逐格相同
      if (!sc.level) await page.evaluate(() => window.__step(30));
      if (sc.level) {
        await page.evaluate((n) => { window.__seed(777); window.__game.autoplay = null; window.__game.start(n); }, sc.level);
        await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 60000, polling: 50 }); // 新版要等世界模型下載，期間不推虛擬時間
        await page.evaluate(() => { window.__seed(777); window.__game.autoplay = [0.25, -2]; });
      } else await page.evaluate(() => window.__seed(777));
      for (let i = 0; i < sc.frames / 30; i++) await page.evaluate(() => window.__step(30));
      await sleep(300);
      const f = join(OUT, `${tag}-${sc.name}.png`); writeFileSync(f, await page.screenshot());
      files[sc.name] = { file: f, quality: await page.evaluate(() => window.__game.quality), errs };
      await ctx.close();
    }
  } finally { srv.close(); }
  return files;
}
// 在頁面裡用 canvas 比對兩張 PNG
async function diffPng(browser, fa, fb) {
  const page = await browser.newPage();
  const r = await page.evaluate(async ([a, b]) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: [ia.width, ia.height, ib.width, ib.height] };
    const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height).data; };
    const da = px(ia), db = px(ib); let n = 0, big = 0, max = 0, sum = 0;
    for (let k = 0; k < da.length; k += 4) { const d = Math.max(Math.abs(da[k] - db[k]), Math.abs(da[k + 1] - db[k + 1]), Math.abs(da[k + 2] - db[k + 2])); if (d) { n++; sum += d; if (d > 8) big++; if (d > max) max = d; } }
    const total = da.length / 4; return { pixels: total, differ: n, differPct: +(100 * n / total).toFixed(3), over8: big, over8Pct: +(100 * big / total).toFixed(3), maxDelta: max, meanDeltaOfDiffering: n ? +(sum / n).toFixed(2) : 0 };
  }, [`data:image/png;base64,${readFileSync(fa).toString('base64')}`, `data:image/png;base64,${readFileSync(fb).toString('base64')}`]);
  await page.close(); return r;
}
// 並排成一張（每格縮到寬 640，上方標籤）
async function sheet(browser, rows, outFile) {
  const page = await browser.newPage();
  const data = rows.map((r) => ({ label: r.label, cells: r.cells.map((c) => ({ t: c.t, src: `data:image/png;base64,${readFileSync(c.file).toString('base64')}` })) }));
  const png = await page.evaluate(async (rows) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const W = 640, imgs = await Promise.all(rows.map((r) => Promise.all(r.cells.map((c) => load(c.src)))));
    const H = Math.round(W * imgs[0][0].height / imgs[0][0].width), LH = 34, cols = rows[0].cells.length;
    const cv = document.createElement('canvas'); cv.width = W * cols; cv.height = rows.length * (H + LH); const g = cv.getContext('2d');
    g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height); g.font = 'bold 22px sans-serif'; g.fillStyle = '#fff';
    rows.forEach((r, y) => r.cells.forEach((c, x) => { g.fillText(`${r.label} — ${c.t}`, x * W + 10, y * (H + LH) + 24); g.drawImage(imgs[y][x], x * W, y * (H + LH) + LH, W, H); }));
    return cv.toDataURL('image/png').split(',')[1];
  }, data);
  writeFileSync(outFile, Buffer.from(png, 'base64')); await page.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = {};
try {
  if (argv.includes('--tiers')) {
    const dist = opt('b', 'dist'), per = {};
    for (const q of ['high', 'mid', 'low']) per[q] = await shootAll(browser, dist, q, `tier-${q}`);
    await sheet(browser, SCENES.map((sc) => ({ label: sc.name, cells: ['high', 'mid', 'low'].map((q) => ({ t: q, file: per[q][sc.name].file })) })), join(OUT, `tiers${MOBILE ? '-mobile' : ''}.png`));
    report.tiers = Object.fromEntries(Object.entries(per).map(([q, v]) => [q, Object.fromEntries(Object.entries(v).map(([n, x]) => [n, { quality: x.quality, errs: x.errs }]))]));
    for (const sc of SCENES) { report.diffVsHigh ??= {}; report.diffVsHigh[sc.name] = { mid: await diffPng(browser, per.high[sc.name].file, per.mid[sc.name].file), low: await diffPng(browser, per.high[sc.name].file, per.low[sc.name].file) }; }
  } else {
    const A = await shootAll(browser, opt('a'), opt('a-q'), 'a'), B = await shootAll(browser, opt('b'), opt('b-q'), 'b');
    // 噪音下限：同一版再拍一次（只拍 l1）
    report.scenes = {};
    for (const sc of SCENES) report.scenes[sc.name] = { diff: await diffPng(browser, A[sc.name].file, B[sc.name].file), qualityA: A[sc.name].quality, qualityB: B[sc.name].quality, errsA: A[sc.name].errs, errsB: B[sc.name].errs };
    await sheet(browser, SCENES.map((sc) => ({ label: sc.name, cells: [{ t: '改前', file: A[sc.name].file }, { t: '改後', file: B[sc.name].file }] })), join(OUT, 'before-after.png'));
  }
} finally { await browser.close(); }
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));

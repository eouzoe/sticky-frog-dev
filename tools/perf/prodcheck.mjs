// 正式版健康檢查：載入 → 選單閒置 3 秒 → 自動玩家 8 秒；記錄錯誤、長任務（>50ms）、rAF 間隔的分布、WebGL 渲染器名稱
// 用法：bun prodcheck.mjs <網址> <gpu|swift|nogl>
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';
const [url = 'http://localhost:4180/', mode = 'gpu'] = process.argv.slice(2);
const LAUNCH = mode === 'gpu' ? GPU
  : mode === 'swift' ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  : { args: ['--disable-webgl', '--disable-webgl2'] };
const browser = await chromium.launch({ ...BASE, ...LAUNCH });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200))); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => {
  const T = (window.__t = { lt: [], raf: [], last: 0 });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) T.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const loop = (now) => { if (T.last) T.raf.push(now - T.last); T.last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
});
const t0 = Date.now();
await page.goto(url, { waitUntil: 'commit' });
let booted = true;
try { await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 30000 }); } catch { booted = false; }
const menuAt = Date.now() - t0;
const info = await page.evaluate(() => { const c = document.getElementById('c'); const gl = c?.getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return { renderer: gl ? (e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl2', bootFail: !!document.querySelector('#boot button'), bootText: document.getElementById('boot')?.textContent?.trim().slice(0, 40), q: window.__game?.quality, dpr: window.__game?.view?.R?.dpr, canvas: c ? `${c.width}x${c.height}` : '' }; });
const window_ = async (ms, label) => {
  await page.evaluate(() => { window.__t.lt = []; window.__t.raf = []; });
  await page.waitForTimeout(ms);
  return page.evaluate((label) => { const r = window.__t.raf.slice().sort((a, b) => a - b); const p = (q) => r.length ? +r[Math.min(r.length - 1, Math.floor(q * r.length))].toFixed(1) : null; return { label, frames: r.length, p50: p(0.5), p95: p(0.95), max: p(1), over50: r.filter((x) => x > 50).length, longtasks: window.__t.lt.filter((x) => x[1] >= 50) }; }, label);
};
const out = { mode, booted, menuAtMs: menuAt, info };
if (booted) {
  out.menuIdle = await window_(3000, '選單閒置');
  await page.evaluate(() => { window.__game.start(1); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 15000 });
  await page.evaluate(() => { window.__game.autoplay = [0.25, -2]; });
  out.play = await window_(8000, '自動玩家');
}
out.errors = errors;
console.log(JSON.stringify(out, null, 1));
await browser.close();

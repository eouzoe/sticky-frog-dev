// 烘焙執行器：起靜態伺服器（.ts 當場轉譯）→ 無頭 Chrome 開烘焙頁 → 每張圖集寫成 src/art/atlas-<name>.webp＋atlas-<name>.json
// 兩個烘焙頁：index.html（three.js 從原版 GLB 渲染角色、道具、背景零件，要幾分鐘）、paint.html（用 src/render/paint.ts 畫小形狀，幾秒）
// 用法：bun tools/bake/run.mjs            兩個都跑
//       bun tools/bake/run.mjs --paint    只畫小形狀（改了 paint.ts 的定義時）
//       bun tools/bake/run.mjs --3d       只跑 3D
// Chrome 路徑可用 CHROME 環境變數覆寫
import { chromium } from 'playwright-core';
import { BASE } from '../perf/browser.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(import.meta.dir, '../..'));
const OUT = join(ROOT, 'src/art');
const PAGES = process.argv.includes('--paint') ? ['paint'] : process.argv.includes('--3d') ? ['index'] : ['paint', 'index'];
const ts = new Bun.Transpiler({ loader: 'ts' });
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname),
      f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) return new Response('no', { status: 403 });
    const file = Bun.file(f);
    if (!file.size) return new Response('not found', { status: 404 });
    if (f.endsWith('.ts')) return new Response(ts.transformSync(await file.text()), { headers: { 'content-type': 'text/javascript' } });
    return new Response(file);
  },
});
const browser = await chromium.launch({ ...BASE, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  mkdirSync(OUT, { recursive: true });
  for (const pg of PAGES) {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.text().startsWith('[bake]') || m.type() === 'error') console.log(m.text());
    });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    const t0 = Date.now();
    await page.goto(`http://localhost:${server.port}/tools/bake/${pg}.html`);
    await page.waitForFunction(() => window.__bake || window.__bakeError, null, { timeout: 30 * 60 * 1000, polling: 500 });
    const err = await page.evaluate(() => window.__bakeError);
    if (err) throw new Error(err);
    const r = await page.evaluate(() => window.__bake);
    for (const [name, a] of Object.entries(r.atlases)) {
      const buf = Buffer.from(a.webp.split(',')[1], 'base64');
      writeFileSync(join(OUT, `atlas-${name}.webp`), buf);
      // 這張圖集的座標表：frames 的 a 欄位說它屬於哪張，寫進各自的 json 時拿掉
      const frames = {};
      for (const [key, fr] of Object.entries(r.frames))
        if (fr.a === name) {
          const { a: _a, ...rest } = fr;
          frames[key] = rest;
        }
      writeFileSync(join(OUT, `atlas-${name}.json`), JSON.stringify({ w: a.w, h: a.h, frames }));
      console.log(`atlas-${name}.webp ${a.w}x${a.h} ${(buf.length / 1024).toFixed(1)} KB，${Object.keys(frames).length} 格`);
    }
    console.log(`${pg}：${((Date.now() - t0) / 1000).toFixed(0)} s`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

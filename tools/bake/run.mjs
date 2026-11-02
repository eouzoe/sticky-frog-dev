// 烘焙執行器：起靜態伺服器 → 無頭 Chrome 開 tools/bake/index.html → 把圖集（WebP）與座標表寫進 src/art/
// 用法：bun tools/bake/run.mjs   （Chrome 路徑可用 CHROME 環境變數覆寫）
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, normalize } from 'node:path';

const ROOT = normalize(join(import.meta.dir, '../..'));
const OUT = join(ROOT, 'src/art');
const CHROME = process.env.CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`;
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const p = decodeURIComponent(new URL(req.url).pathname), f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) return new Response('no', { status: 403 });
    const file = Bun.file(f);
    return file.size ? new Response(file) : new Response('not found', { status: 404 });
  },
});
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.text().startsWith('[bake]') || m.type() === 'error') console.log(m.text()); });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${server.port}/tools/bake/index.html`);
  await page.waitForFunction(() => window.__bake || window.__bakeError, null, { timeout: 30 * 60 * 1000, polling: 1000 });
  const err = await page.evaluate(() => window.__bakeError);
  if (err) throw new Error(err);
  const r = await page.evaluate(() => window.__bake);
  mkdirSync(OUT, { recursive: true });
  const meta = { atlases: {}, frames: r.frames };
  for (const [name, a] of Object.entries(r.atlases)) {
    const buf = Buffer.from(a.webp.split(',')[1], 'base64');
    writeFileSync(join(OUT, `atlas-${name}.webp`), buf);
    meta.atlases[name] = { w: a.w, h: a.h };
    console.log(`atlas-${name}.webp ${a.w}x${a.h} ${(buf.length / 1024).toFixed(1)} KB`);
  }
  writeFileSync(join(OUT, 'atlas.json'), JSON.stringify(meta));
  console.log(`frames ${Object.keys(r.frames).length}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} finally { await browser.close(); server.stop(); }

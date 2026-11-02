// 執行 tests/ 裡的瀏覽器步驟檔（smoke-*.json、tour-*.json、probe-*.json、p1-*.json）。
// 用法：bun tools/perf/smoke.mjs [--url http://localhost:4173/] [--verbose] tests/smoke-desktop.json [更多檔案…]（--verbose 印出每個 eval 的回傳值）
// 先 bun run build && bun run preview（或 bun run dev，網址換成 5173）。網址自動加 ?debug=1（正式版要有它才掛 window.__game）。
// 視窗：檔名含 portrait＝390×844 觸控、含 mobile＝844×390 觸控、其他＝1280×720 桌機。
// 步驟：wait（毫秒）、eval（頁面裡求值，Promise 會等）、assert＋msg（求值為假就記一筆失敗）、shot（截圖到 tools/perf/shots/）、
//       click（CSS 選擇器）、key（按一下；加 hold＝按住幾毫秒）、down／up（按住／放開）、drag＋ms（從第一點按住、移到第二點、停 ms 後放開）、tap（[x, y]）。
// 結束碼：有任何 assert 失敗或步驟出錯就是 1。
import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';

const args = process.argv.slice(2);
const ui = args.indexOf('--url');
const url0 = ui >= 0 ? args.splice(ui, 2)[1] : 'http://localhost:4173/';
const vi = args.indexOf('--verbose'), verbose = vi >= 0; if (verbose) args.splice(vi, 1);
const url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1`;
const files = args;
if (!files.length) { console.error('用法：bun tools/perf/smoke.mjs [--url 網址] tests/smoke-*.json'); process.exit(2); }
const shots = new URL('./shots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ ...BASE, ...GPU });
let failed = 0;
for (const file of files) {
  const name = basename(file, '.json');
  const steps = await Bun.file(file).json();
  const touch = /mobile|portrait/.test(name);
  const viewport = /portrait/.test(name) ? { width: 390, height: 844 } : touch ? { width: 844, height: 390 } : { width: 1280, height: 720 };
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  let ok = 0, bad = 0, shotN = 0;
  for (const [i, s] of steps.entries()) {
    try {
      if ('wait' in s) await page.waitForTimeout(s.wait);
      else if ('eval' in s) { const v = await page.evaluate(s.eval); if (verbose && v !== undefined) console.log(`     ${name} #${i} → ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 2000)); }
      else if ('assert' in s) {
        const v = await page.evaluate(s.assert);
        if (v) ok++; else { bad++; console.log(`FAIL ${name} #${i} ${s.msg ?? s.assert}`); }
      } else if ('shot' in s) await page.screenshot({ path: `${shots}${name}-${String(++shotN).padStart(2, '0')}-${s.shot}.png` });
      else if ('click' in s) await page.click(s.click, { timeout: 5000 });
      else if ('key' in s) {
        if (s.hold) { await page.keyboard.down(s.key); await page.waitForTimeout(s.hold); await page.keyboard.up(s.key); }
        else await page.keyboard.press(s.key);
      } else if ('down' in s) await page.keyboard.down(s.down);
      else if ('up' in s) await page.keyboard.up(s.up);
      else if ('drag' in s) {
        const [[x1, y1], [x2, y2]] = s.drag;
        await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2);
        await page.waitForTimeout(s.ms ?? 0); await page.mouse.up();
      } else if ('tap' in s) {
        const [x, y] = s.tap;
        if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
      } else { bad++; console.log(`FAIL ${name} #${i} 不認得的步驟 ${JSON.stringify(s)}`); }
    } catch (e) {
      bad++; console.log(`FAIL ${name} #${i} ${JSON.stringify(s).slice(0, 120)} → ${String(e).split('\n')[0]}`);
    }
  }
  for (const e of errors) { bad++; console.log(`FAIL ${name} 頁面錯誤 ${e.split('\n')[0]}`); }
  console.log(`${bad ? 'FAIL' : 'ok  '} ${name}：${ok} 項斷言通過${bad ? `、${bad} 項失敗` : ''}`);
  failed += bad;
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);

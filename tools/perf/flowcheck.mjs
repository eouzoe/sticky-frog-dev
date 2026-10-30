// 一局結束的流程（flow.ts／beat.ts）在真的瀏覽器裡走一遍：過關節拍自動下一關、金幣飛到才入帳、主線死亡重生、點擊提前、
// 無盡死亡倒數自動新一局、過關節拍中暫停／繼續。每一步截圖到 shots/flow-*.png。用法：bun tools/perf/flowcheck.mjs [網址]
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('pageerror', (e) => logs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
const fails = [];
const check = (name, ok, extra = '') => { if (!ok) fails.push(name); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };
const g = (expr) => page.evaluate(expr);
const state = () => g(() => window.__game.state);
const waitState = (want, ms) => page.waitForFunction((w) => w.includes(window.__game.state), want, { timeout: ms }).then(() => true).catch(() => false);
const snap = () => g(() => { const q = (s) => document.querySelector(s); return { state: window.__game.state, level: window.__game.level, endless: window.__game.endless, beat: window.__game.beat, inFlight: window.__game.coinsInFlight, hudCoins: q('#hudCoinN').textContent, saveCoins: window.__game.coins, clearOn: !q('#clear').hidden, overOn: !q('#over').hidden, stars: document.querySelectorAll('#clear .cs.hit').length, chip: !q('#clearCoins').hidden, best: !q('#clearBest').hidden, distOn: !q('#ovDistRow').hidden, cdOn: !q('#ovCdWrap').hidden, buttons: [...document.querySelectorAll('#clear button, #over button')].length, hud: q('#hud').classList.contains('on'), paused: q('#pause').classList.contains('on') }; });
const shot = (name) => page.screenshot({ path: `${OUT}flow-${name}.png` });

await page.goto(url, { timeout: 120000 });
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
await g(() => { window.__game.save.unlocked = 90; window.__game.save.coins = 100; });

// ---- 1. 過關（豪爽：蒼蠅全吃＋新紀錄）：第 1 關直接放到終點，逐 50 ms 取樣整個節拍（截圖只拍一張，拍照會卡住取樣）
await g(() => window.__game.start(1));
await waitState(['playing'], 15000); await page.waitForTimeout(2500); // 等手感回饋模組與圖集
await g(() => { const gm = window.__game; gm.save.best[1] = 1; gm.sim.fliesGot = gm.sim.flies.length; gm.forceWin(); });
check('落荷葉 → cleared', await waitState(['cleared'], 6000));
const t0 = Date.now(), samples = [];
let shotPending = true;
while (Date.now() - t0 < 4000) {
  const s = await snap(); const el = (Date.now() - t0) / 1000; samples.push({ el: +el.toFixed(2), ...s });
  if (s.state !== 'cleared') break;
  if (shotPending && s.chip) { shotPending = false; await shot('clear-coins'); }
  await page.waitForTimeout(50);
}
check('沒有按鈕也自動進第 2 關、浮層收起', await waitState(['playing'], 4000) && (await snap()).level === 2 && !(await snap()).clearOn);
const first = samples[0], lastClear = samples.findLast((s) => s.state === 'cleared');
check('浮層沒有按鈕、HUD 留著、不擋輸入', first.buttons === 0 && first.hud && first.clearOn);
check('三顆星依序亮（蒼蠅全吃）', samples.some((s) => s.stars === 1) && samples.some((s) => s.stars === 2) && lastClear.stars === 3, `最後 ${lastClear.stars} 顆`);
check('金幣晶片在第三顆星之後才出現、NEW BEST 在金幣飛到之後', samples.find((s) => s.chip)?.el > samples.find((s) => s.stars === 3)?.el && samples.find((s) => s.best)?.el > samples.find((s) => s.chip)?.el && lastClear.best);
// HUD 數字只在有金幣到達（飛行中的數量變少）的那一刻才動；過關時存檔已經是最終值
const jumps = samples.filter((s, i) => i > 0 && s.hudCoins !== samples[i - 1].hudCoins);
check('HUD 數字等金幣飛到才跳（存檔先到位、數字分批到）', jumps.length >= 2 && jumps.every((s, k) => s.inFlight < samples[samples.indexOf(s) - 1].inFlight || k < 0) && first.inFlight > 0 && String(first.saveCoins) !== first.hudCoins && lastClear.inFlight === 0 && lastClear.hudCoins === String(lastClear.saveCoins), `${first.hudCoins} → ${lastClear.hudCoins}（存檔一開始就是 ${first.saveCoins}），分 ${jumps.length} 次到`);
console.log(`     豪爽節拍牆上時鐘 ${lastClear.el} s（設計 2.0 s；機器負載高時幀會卡、節拍每幀最多推 0.1 s）`);
await shot('next-level');

// ---- 2. 主線死亡：短定格就重生，不結算
await page.waitForTimeout(1500);
await g(() => window.__game.forceDie());
check('死亡 → dying', await waitState(['dying'], 4000));
const td = Date.now();
check('dying 約 0.5 s 後自動重生', await waitState(['playing'], 2000) && Date.now() - td < 1200, `${Date.now() - td} ms`);
check('重生後還在第 2 關、沒有浮層', (await snap()).level === 2 && !(await snap()).clearOn);
await shot('respawn');

// ---- 3. 點擊提前：第 2 關過關後第三顆星亮了就點畫面
await page.waitForTimeout(800);
await g(() => window.__game.forceWin());
await waitState(['cleared'], 6000);
await page.waitForFunction(() => window.__game.beat && window.__game.beat.t >= window.__game.beat.skipAfter, null, { timeout: 3000 });
await shot('clear-two-stars'); // 可惜節拍：中間那顆（蒼蠅）留暗
check('亮的是達成的那兩顆（過關、時間），蒼蠅那顆留暗', await g(() => { const cs = [...document.querySelectorAll('#clear .cs')].map((e) => e.classList.contains('hit')); return cs[0] && !cs[1] && cs[2]; }));
const tSkip = Date.now();
await page.mouse.click(640, 600);
check('點一下立刻進第 3 關', await waitState(['playing'], 1000) && (await snap()).level === 3, `${Date.now() - tSkip} ms`);
const sk = await snap();
check('提前時金幣直接入帳、浮層收起', sk.inFlight === 0 && !sk.clearOn, `HUD ${sk.hudCoins}／存檔 ${sk.saveCoins}`);
check('提前的那一下沒有變成跳躍', await g(() => window.__game.mode) === 'perch');
await shot('after-skip');

// ---- 4. 過關節拍中暫停、繼續
await page.waitForTimeout(800);
await g(() => window.__game.forceWin());
await waitState(['cleared'], 6000); await page.waitForTimeout(300);
await page.keyboard.press('Escape');
const p = await snap();
check('過關節拍中可以暫停（浮層留著）', p.state === 'paused' && p.paused && p.clearOn);
await shot('paused-in-clear');
await page.keyboard.press('Escape');
check('繼續回到 cleared，節拍接著播完進第 4 關', (await state()) === 'cleared' && await waitState(['playing'], 4000) && (await snap()).level === 4);

// ---- 5. 無盡死亡：結算浮層、倒數、自動新一局
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await g(() => { document.getElementById('pMenu').click(); });
check('暫停選單回選單', await waitState(['menu'], 3000));
await g(() => window.__game.startEndless());
check('開無盡', await waitState(['playing'], 15000) && (await snap()).endless);
await page.waitForTimeout(2000);
await g(() => { window.__game.sim.maxX = window.__game.sim.x + 80; window.__game.forceDie(); });
check('無盡死亡 → over（不是 dying）', await waitState(['over'], 4000));
const te = Date.now(), eSamples = [];
let eShot = true;
while (Date.now() - te < 3200) { const s = await snap(); eSamples.push({ el: +((Date.now() - te) / 1000).toFixed(2), ...s }); if (s.state === 'playing') break; if (eShot && s.cdOn) { eShot = false; await shot('endless-over'); } await page.waitForTimeout(60); }
const eo = eSamples.filter((s) => s.state === 'over');
check('結束浮層：距離浮出、倒數條出現、沒有按鈕', eo.some((s) => s.distOn) && eo.some((s) => s.cdOn) && eo.every((s) => s.buttons === 0 && s.overOn));
const eDone = eSamples.at(-1);
check('倒數完自動新一局（約 2.3 s）', eDone.state === 'playing' && eDone.endless && !eDone.overOn && eDone.el >= 2.0 && eDone.el <= 2.9, `${eDone.el} s`);
await page.waitForTimeout(600); await shot('endless-new-run');
check('無盡新一局的距離歸零', await g(() => window.__game.dist) < 5);

// ---- 6. 無盡：倒數中按 R 提前
await g(() => { window.__game.sim.maxX = window.__game.sim.x + 80; window.__game.forceDie(); });
await waitState(['over'], 4000);
await page.waitForFunction(() => window.__game.beat && window.__game.beat.t >= window.__game.beat.skipAfter, null, { timeout: 3000 });
await page.keyboard.press('KeyR');
check('無盡倒數中按 R 立刻新一局', await waitState(['playing'], 1000));

console.log(JSON.stringify({ clearSamples: samples.map((s) => [s.el, s.state, s.stars, s.chip, s.inFlight, s.hudCoins]), logs }));
console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all ok');
await browser.close();
process.exit(fails.length ? 1 : 0);

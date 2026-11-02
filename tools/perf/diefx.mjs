// 真的撞尖刺：找第一個有尖刺的關卡，把青蛙放到尖刺上走正常死亡流程；80 ms 與 260 ms 各截一張（角色附近）
import { chromium } from 'playwright-core';
import { BASE, GPU } from './browser.mjs';
const url0 = process.argv[2] ?? 'http://localhost:5173/', url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1`; // 正式版要 ?debug=1 才有 __game
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ ...BASE, ...GPU });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('pageerror', (e) => logs.push(String(e)));
await page.goto(url, { timeout: 120000 });
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
const n = 9; // 尖刺第一次出現的關（level.ts NEW_AT.spikeLow）
await page.evaluate((n) => { const g = window.__game; g.save.unlocked = 90; g.start(n); }, n);
await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 15000 });
await page.waitForTimeout(3000); // 等手感回饋模組載好
const info = await page.evaluate(() => { const g = window.__game, s = g.sim, sp = s.level.spikes[0]; g.autoplay = null; s.mode = 'air'; s.tongue.state = 'idle'; s.x = sp.x; s.y = sp.y + 0.3; s.vx = 0; s.vy = 0; return { level: g.level, spike: [sp.x, sp.y] }; });
await page.waitForFunction(() => window.__game.mode === 'dead', null, { timeout: 5000 });
const shots = [];
for (const [i, d] of [[1, 120], [2, 200], [3, 300]]) {
  await page.waitForTimeout(d);
  const s = await page.evaluate(() => ({ particles: window.__game.particles, mode: window.__game.mode, screen: window.__game.frogScreen.map(Math.round) }));
  const cx = Math.min(1280 - 220, Math.max(220, s.screen[0])), cy = Math.min(720 - 220, Math.max(220, s.screen[1]));
  await page.screenshot({ path: `${OUT}die-real${i}.png`, clip: { x: cx - 220, y: cy - 220, width: 440, height: 440 } });
  shots.push(s);
}
console.log(JSON.stringify({ level: n, info, shots, logs }));
await browser.close();

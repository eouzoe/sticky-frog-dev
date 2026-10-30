// 選單裡 rAF 有沒有在跑：每秒的 rAF 次數、遊戲自己的 fps、visibilityState；滑鼠動一下之後再量
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:4180/';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { window.__n = 0; const loop = () => { window.__n++; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
await page.goto(url);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
const boot = async () => page.evaluate(() => { const b = document.getElementById('boot'); return !b ? 'removed' : b.classList.contains('out') ? 'fading' : 'shown'; });
const sample = async (label, ms) => { const a = await page.evaluate(() => window.__n); await page.waitForTimeout(ms); const b = await page.evaluate(() => ({ n: window.__n, vis: document.visibilityState, fps: window.__game.fps, state: window.__game.state })); return { label, boot: await boot(), rafPerSec: +((b.n - a) / (ms / 1000)).toFixed(1), fps: b.fps, vis: b.vis, state: b.state }; };
const out = [];
for (let i = 0; i < 3; i++) out.push(await sample(`第一次載入 選單 ${i * 2}–${i * 2 + 2}s`, 2000));
await page.goto(url); await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
for (let i = 0; i < 3; i++) out.push(await sample(`同瀏覽器第二次載入 選單 ${i * 2}–${i * 2 + 2}s`, 2000));
console.log(JSON.stringify(out));
await browser.close();

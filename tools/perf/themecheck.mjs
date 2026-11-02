// 主題資料包（旋轉貓組合包）在真瀏覽器走一遍：商店展示台是組合包（特價、倒數）、買了整套進 owned 並套用、選關頁多主題分頁、
// 系列關卡用主題道具（起點貓跳台、終點軟墊、蒼蠅小魚乾）、系列最後一關過了回選單。截圖 theme-*.png。用法：bun tools/perf/themecheck.mjs [網址]
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:5173/';
const OUT = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`, args: ['--use-gl=angle', '--use-angle=gles-egl', '--ignore-gpu-blocklist', '--enable-gpu'], env: { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: '/usr/lib/wsl/lib' } });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = []; page.on('pageerror', (e) => logs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
const fails = [];
const check = (name, ok, extra = '') => { if (!ok) fails.push(name); console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };
const g = (fn, arg) => page.evaluate(fn, arg);
const waitState = (want, ms) => page.waitForFunction((w) => w.includes(window.__game.state), want, { timeout: ms }).then(() => true).catch(() => false);
await page.goto(url, { timeout: 120000 });
await page.waitForFunction(() => performance.getEntriesByName('menu-ready').length > 0, null, { timeout: 60000 });
await g(() => { const s = window.__game.save; s.unlocked = 90; s.coins = 150; });

// ---- 商店：展示台＝組合包，特價 160（原價 220 劃掉）、倒數；買不起（150）→ 不扣錢
await page.click('#shopBtn'); await waitState(['shop'], 3000);
const shop0 = await g(() => ({ ribbon: document.getElementById('showRibbon').textContent, buy: document.getElementById('showBuy').textContent, strike: document.querySelector('#showBuy s')?.textContent, sub: document.getElementById('showSub').textContent, saleAt: window.__game.save.saleAt }));
check('展示台是組合包：特價倒數、原價劃掉、整套內容一行', /\d+h/.test(shop0.ribbon) && shop0.strike === '220' && shop0.buy.includes('160') && /10/.test(shop0.sub) && shop0.saleAt > 0, JSON.stringify(shop0));
await page.click('#showBuy'); await page.waitForTimeout(300);
check('買不起：不扣錢、沒套用', await g(() => window.__game.save.coins === 150 && window.__game.theme === ''));
await page.screenshot({ path: `${OUT}theme-shop.png` });
// ---- 買得起：買整套 → owned 多四個、theme=cat、角色／舌頭／拖尾都換、試玩面板
await g(() => { window.__game.save.coins = 300; window.__game.buySet('cat'); }); await page.waitForTimeout(1300);
const bought = await g(() => { const s = window.__game.save; return { coins: s.coins, owned: s.owned, theme: s.theme, skin: s.skin, tongue: s.tongue, trail: s.trail, buy: document.getElementById('showBuy').textContent, tryOn: document.getElementById('tryNow').classList.contains('on') }; });
check('買整套：扣 160、set:cat＋貓＋毛線舌＋毛線拖尾進 owned、整套套用、展示台變「裝備中」', bought.coins === 140 && ['set:cat', 'cat', 'yarn', 'wool'].every((id) => bought.owned.includes(id)) && bought.theme === 'cat' && bought.skin === 'cat' && bought.tongue === 'yarn' && bought.trail === 'wool' && bought.tryOn, JSON.stringify(bought));
await page.screenshot({ path: `${OUT}theme-bought.png` });
// ---- 選關頁：主題分頁開了，10 關
await page.click('#tryLater'); await page.waitForTimeout(200);
await page.click('#shop .back'); await waitState(['menu'], 3000);
await page.click('#levelsBtn'); await waitState(['levels'], 3000);
const cards = await g(() => [...document.querySelectorAll('#worldTabs .wcard')].map((b) => ({ txt: b.textContent, locked: b.classList.contains('locked') })));
check('選關頁多一張主題卡、沒鎖', cards.length === 7 && !cards[6].locked && cards[6].txt.includes('★'), JSON.stringify(cards[6]));
await page.click('#worldTabs .wcard:nth-child(7)'); await page.waitForTimeout(500);
const grid = await g(() => ({ n: document.querySelectorAll('#levelGrid .lvb').length, locked: document.querySelectorAll('#levelGrid .lvb.locked').length, level: window.__game.level, stump: window.__game.view.wf('stump') === window.__game.view.frames.catTower }));
check('主題分頁：10 關全開、背景換成系列第一關（起點是貓跳台）', grid.n === 10 && grid.locked === 0 && grid.level === 91 && grid.stump, JSON.stringify(grid));
await page.screenshot({ path: `${OUT}theme-levels.png` });
// ---- 進系列第一關：世界 0、標籤 ★-1、道具替換；過關 → 第 2 關（不是回選單）
await page.click('#levelGrid .lvb:nth-child(1)'); check('開系列第 1 關', await waitState(['playing'], 15000));
await page.waitForTimeout(1500);
const lv = await g(() => { const gm = window.__game, v = gm.view; return { level: gm.level, world: gm.sim.level.world, label: document.getElementById('hudLevel').textContent, goal: v.wf('goal') === v.frames.cushion, stump: v.wf('stump') === v.frames.catTower, flies: gm.sim.level.flies.length, hazards: gm.sim.level.spikes.length + gm.sim.level.saws.length }; });
check('系列關卡：第 91 關、世界 0、HUD 標 ★-1、終點軟墊、起點貓跳台、有蒼蠅（小魚乾）', lv.level === 91 && lv.world === 0 && lv.label.includes('★-1') && lv.goal && lv.stump && lv.flies > 0, JSON.stringify(lv));
await page.screenshot({ path: `${OUT}theme-level-start.png` });
await g(() => { const gm = window.__game; gm.freeze = true; gm.camOverride = { p: [gm.sim.level.goal.x - 2, 6, 15] }; }); await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}theme-level-goal.png` });
await g(() => { window.__game.freeze = false; window.__game.camOverride = null; window.__game.forceWin(); });
check('系列第 1 關過了 → 第 2 關（★-2）', await waitState(['cleared'], 6000) && await waitState(['playing'], 5000) && (await g(() => window.__game.level)) === 92);
await g(() => window.__game.start(100)); await waitState(['playing'], 15000); await page.waitForTimeout(800);
await g(() => window.__game.forceWin());
check('系列最後一關（第 100 關）過了 → 回選單、星數記在 100', await waitState(['cleared'], 6000) && await waitState(['menu'], 5000) && (await g(() => window.__game.save.stars[100] >= 1)));
// ---- 沒擁有：主題卡鎖著
await g(() => { const s = window.__game.save; s.owned = s.owned.filter((id) => !['set:cat', 'cat', 'yarn', 'wool'].includes(id)); s.theme = ''; s.skin = 'tree'; s.tongue = 'tongue'; s.trail = 'none'; });
await page.click('#levelsBtn'); await waitState(['levels'], 3000);
check('沒擁有整套：主題卡鎖著', await g(() => document.querySelector('#worldTabs .wcard:nth-child(7)').classList.contains('locked')));
console.log(JSON.stringify({ logs }));
console.log(fails.length ? `FAILED ${fails.length}: ${fails.join(' | ')}` : 'all ok');
await browser.close();
process.exit(fails.length || logs.length ? 1 : 0);

// 量遊戲每個音效的響度（主輸出接量測節點；近似 BS.1770 K 加權：高通 60Hz＋1.5kHz 高架 +4dB）
// 指標：短期響度＝連續 300ms 視窗的最大均方（dB），旋轉貓 oiia 量循環播 2 秒
// 用法：bun sfxlevels.mjs <網址>
import { chromium } from 'playwright-core';
import { BASE } from './browser.mjs';
const url0 = process.argv[2] ?? 'http://localhost:5173/', url = `${url0}${url0.includes('?') ? '&' : '?'}debug=1`; // 正式版要 ?debug=1 才有 __game
const browser = await chromium.launch({ ...BASE, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  window.__lv = { blocks: [] };
  AudioNode.prototype.connect = function (dest, ...rest) {
    const r = orig.call(this, dest, ...rest);
    if (dest instanceof AudioDestinationNode && !this.__tapSelf) {
      const ctx = this.context;
      if (!ctx.__tap) {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
        const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 1500; hs.gain.value = 4;
        const sp = ctx.createScriptProcessor(1024, 1, 1); sp.__tapSelf = true;
        sp.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); let s = 0, pk = 0; for (const v of d) { s += v * v; const a = Math.abs(v); if (a > pk) pk = a; } window.__lv.blocks.push([s / d.length, pk]); };
        orig.call(hp, hs); orig.call(hs, sp); orig.call(sp, ctx.destination);
        ctx.__tap = hp;
      }
      orig.call(this, ctx.__tap);
    }
    return r;
  };
});
await page.goto(url);
await page.waitForFunction(() => window.__game?.state === 'menu', null, { timeout: 60000 });
await page.mouse.click(5, 5); // 讓音訊環境起來（遊戲在第一次互動時 initAudio）
await page.evaluate(() => { const A = window.__game.audio; A.initAudio?.(); A.setMusic(false); });
await page.waitForTimeout(500);
const measure = async (fn, ms) => {
  await page.evaluate(() => { window.__lv.blocks = []; });
  await page.evaluate(fn);
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const b = window.__lv.blocks, sr = 48000, per = Math.max(1, Math.round((0.3 * sr) / 1024));
    let best = 0, pk = 0;
    for (let i = 0; i < b.length; i++) { pk = Math.max(pk, b[i][1]); let s = 0, n = 0; for (let j = i; j < Math.min(b.length, i + per); j++) { s += b[j][0]; n++; } if (n === per) best = Math.max(best, s / n); }
    if (best === 0 && b.length) best = b.reduce((a, x) => a + x[0], 0) / b.length;
    return { st: +(10 * Math.log10(best || 1e-12)).toFixed(1), peak: +(20 * Math.log10(pk || 1e-9)).toFixed(1) };
  });
};
const names = ['shoot', 'attach', 'release', 'miss', 'jump', 'flip', 'fly', 'ring', 'bounce', 'fan', 'wall', 'splash', 'spike', 'win', 'star', 'coin', 'tick', 'click', 'buy', 'whoosh', 'slide', 'sparkle', 'fanfare', 'gulp', 'jelly', 'ui_press', 'ui_pop', 'panel_in', 'feat', 'pop'];
const out = {};
for (const n of names) out[n] = await measure(`window.__game.audio.play(${JSON.stringify(n)})`, 1300);
// oiia：選貓（觸發下載）、等載好、循環播 2 秒
await page.evaluate(() => { window.__game.look('cat'); });
await page.waitForTimeout(1500);
out.oiia = await measure('window.__game.audio.oiiaStart()', 2200);
await page.evaluate(() => window.__game.audio.oiiaStop());
// 背景音樂也量一下（4 秒）
await page.waitForTimeout(400);
out.music = await measure('window.__game.audio.setMusic(true)', 4000);
console.log(JSON.stringify(out));
await browser.close();

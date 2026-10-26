// 事件特效配方（軟膠公仔語彙）：每個遊戲事件 → 果凍形變／糖果碎片／閃星／泡泡／彩紙＋停格、慢動作、FOV、震動、音效層。
// 配方表與每格的疊加上限寫在 _out/hook-hero/round2/integ/DONE.md。分數、跳字、連擊仍在 main.js。
import { SH } from './fx.js';

const CANDY = ['#ff6fb5', '#ffd23f', '#7be0ff', '#7ee08a', '#b58cff', '#ffffff']; // 糖果色（彩紙、閃星）
const GOLD = ['#ffd23f', '#fff3a0', '#ffffff'];
const FEAT_COL = {
  spin: ['#ffd23f', '#ff6fb5', '#ffffff'], tornado: ['#ffd23f', '#ff6fb5', '#7be0ff', '#b58cff'], flow: ['#7ee08a', '#ffffff', '#ffd23f'],
  speed: ['#7be0ff', '#ffffff', '#ffd23f'], skim: ['#7be0ff', '#bff4ff', '#ffffff'], shave: ['#ff6fb5', '#ffffff', '#ffd23f'], clutch: ['#ffd23f', '#7ee08a', '#ffffff'],
};

export function createJuice(c) {
  const { fx, frog, lvView, G } = c;
  const stop = (t) => { G.hitStop = Math.max(G.hitStop, t); }; // 停格取 max，不累加
  const small = (a) => fx.addTrauma(a); // 高頻小事件：取 max
  const big = (a) => fx.addTrauma(a, true); // 大事件：累加（上限 1）
  const stars = (x, y, n, o = {}) => fx.burst(x, y, n, { colors: GOLD, speed: 9, size: 0.34, grav: 5, drag: 2.2, life: 0.9, shape: SH.STAR, ...o });
  const confetti = (x, y, n, o = {}) => fx.burst(x, y, n, { colors: CANDY, speed: 11, size: 0.3, grav: 7, drag: 1.6, life: 1.4, shape: SH.CONFETTI, ...o });
  const bubbles = (x, y, n, o = {}) => fx.burst(x, y, n, { colors: ['#ffffff', '#bff4ff'], speed: 3, size: 0.4, grav: -4, drag: 2, life: 1.1, shape: SH.BUBBLE, ...o });
  const candy = (x, y, n, colors, o = {}) => fx.burst(x, y, n, { colors, speed: 8, size: 0.32, grav: 18, life: 0.8, shape: SH.CANDY, ...o });
  // 從鏡頭上緣落下的彩紙雨（只給最大的時刻）
  function rain(n) {
    const cx = G.cam.x, cy = G.cam.y + 9;
    for (let i = 0; i < n; i++) fx.spawn(cx + (Math.random() - 0.5) * 34, cy + Math.random() * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, -2 - Math.random() * 3, 0, 2.4, 0.32 + Math.random() * 0.15, 3, 1.2, SH.CONFETTI, CANDY[i % CANDY.length]);
  }

  return {
    jump(s, w) { frog.squash(1.45, Math.atan2(-s.vx, s.vy)); candy(s.x, s.y - 0.5, 8, [w.wood, '#f5e6c8'], { speed: 5, dir: Math.PI / 2, spread: 2.6, size: 0.24 }); },
    attach(e, s, w, tk) {
      lvView.wobbleHook(e.hook); frog.squash(0.72, s.angle); frog.jelly(3); frog.jiggle(4);
      candy(e.x, e.y, 8, [w.petal, w.bud, '#ffffff'], { speed: 6, size: 0.26, grav: 6 });
      fx.shock(e.x, e.y, 2.2, w.petal, 0.3);
      if (tk.id !== 'tongue') fx.burst(e.x, e.y, 10, { colors: tk.fx, speed: 5, size: 0.24, grav: tk.id === 'vine' ? 9 : 2, shape: [SH.CANDY, SH.CONFETTI, SH.BUBBLE, SH.BUBBLE][tk.fxShape] ?? SH.CANDY, life: 0.7 });
      small(Math.min(0.18, 0.05 + e.speed * 0.005));
    },
    release(s, speed) {
      frog.squash(1.4, Math.atan2(-s.vx, s.vy)); frog.jelly(4); frog.jiggle(5);
      G.fovKick = Math.min(9, 2 + speed * 0.22);
      small(Math.min(0.15, speed * 0.006));
      if (speed > 20) bubbles(s.x, s.y, 6, { speed: 4, grav: 0, life: 0.5 });
    },
    // 翻滾：圈數越高越隆重，7 圈＝全場最大（之後的第 8、9 圈回到 4 圈等級，不再重播大場面）
    flip(s, n) {
      const t = n >= 8 ? 4 : n;
      frog.jelly(2 + Math.min(t, 7));
      if (t === 1) { stars(s.x, s.y, 5, { size: 0.26, speed: 6 }); small(0.05); c.sfx('sparkle', { n: 1 }); return; }
      if (t === 2) { stars(s.x, s.y, 10); confetti(s.x, s.y, 14); fx.shock(s.x, s.y, 4, '#ffd23f', 0.4); small(0.12); c.sfx('sparkle', { n: 2 }); return; }
      if (t <= 4) {
        stars(s.x, s.y, 16 + (t - 3) * 6); confetti(s.x, s.y, 24 + (t - 3) * 6); candy(s.x, s.y, 10, CANDY, { grav: 10 });
        fx.shock(s.x, s.y, 5, '#ffd23f', 0.45); fx.shock(s.x, s.y, 3.5, '#ffffff', 0.4, false, 0.08);
        if (t === 3) { stop(0.04); c.slowmo(); c.flash(0.22); G.fovKick -= 6; c.vibrate(25); } else G.fovKick -= 4;
        big(0.2); c.sfx('sparkle', { n: t }); return;
      }
      if (t <= 6) {
        stars(s.x, s.y, 26); confetti(s.x, s.y, 38); bubbles(s.x, s.y, 10, { speed: 6 });
        ['#ffd23f', '#ff6fb5', '#ffffff'].forEach((cl, i) => fx.shock(s.x, s.y, 5 + i * 1.2, cl, 0.5, false, i * 0.07));
        stop(t === 5 ? 0.06 : 0.03); c.slowmo(t === 5 ? 1 : 0.7); c.flash(0.3); G.fovKick -= 8; big(0.28); c.vibrate(30);
        c.sfx('sparkle', { n: t }); if (t === 5) c.sfx('fanfare', { n: 1 }); return;
      }
      // 7 圈：停格 0.1 秒 → 1.6 秒慢動作、全螢幕閃、四圈彩色果凍環、閃星＋彩紙＋泡泡＋糖果、天上下彩紙雨、音樂壓低、大號角
      stop(0.1); c.slowmo(1.6); c.flash(0.5); G.fovKick -= 10; big(0.45); c.vibrate([30, 40, 80]);
      stars(s.x, s.y, 46, { speed: 13, size: 0.42 }); confetti(s.x, s.y, 60, { speed: 15 }); bubbles(s.x, s.y, 18, { speed: 8 }); candy(s.x, s.y, 20, CANDY, { speed: 12, grav: 8 });
      ['#ffd23f', '#ff6fb5', '#7be0ff', '#ffffff'].forEach((cl, i) => fx.shock(s.x, s.y, 6 + i * 1.6, cl, 0.6, false, i * 0.09));
      rain(60); frog.squash(1.55); c.sfx('fanfare', { n: 2 }); c.A.duckMusic(0.2, 1.4);
    },
    fly(e) { candy(e.x, e.y, 6, ['#3b3a58', '#ffffff', '#ffd23f'], { speed: 5, size: 0.18, grav: 4 }); stars(e.x, e.y, 3, { size: 0.2, speed: 4 }); frog.jelly(2); frog.jiggle(3); c.sfx('gulp'); },
    // 金幣入帳：3D 金幣從角色身上蹦出來、轉著往上掉（一次最多 8 枚）
    coins(x, y, n) {
      const k = Math.min(8, n);
      for (let i = 0; i < k; i++) fx.spawn(x, y + 0.6, 0.8, (Math.random() - 0.5) * 6, 9 + Math.random() * 5, 0, 0.9, 0.6, 22, 0.8, SH.COIN, '#ffd23f');
    },
    ring(e, slow) {
      lvView.takeRing(e.i); frog.jelly(4);
      stars(e.x, e.y, 16, { speed: 10 }); confetti(e.x, e.y, 10, { speed: 9 });
      fx.shock(e.x, e.y, 4.5, '#ffd23f', 0.5); fx.shock(e.x, e.y, 3, '#ffffff', 0.4, false, 0.07);
      c.slowmo(slow); G.fovKick -= 5; c.flash(0.15); small(0.12);
    },
    bounce(e, w) {
      lvView.squashMush(e.i); frog.squash(0.55, 0); frog.jelly(5); frog.jiggle(8);
      candy(e.x, e.y, 14, [w.cap, w.capSpot, '#ffffff'], { speed: 8, dir: Math.PI / 2, spread: 2.2 });
      bubbles(e.x, e.y, 5, { speed: 4 });
      fx.shock(e.x, e.y - 0.2, 3.2, '#ffffff', 0.35, true);
      stop(0.045); small(0.25); c.sfx('jelly');
    },
    close(e) { stars(e.x, e.y, 8, { colors: ['#ffffff', '#fff3a0'], speed: 7 }); fx.shock(e.x, e.y, 2.5, '#ffffff', 0.3); c.slowmo(0.35); frog.jiggle(6); c.sfx('whoosh'); },
    wall(s, w) { frog.squash(0.6, Math.PI / 2); frog.jelly(4); candy(s.x + 0.5, s.y, 6, [w.pad, w.vine], { speed: 5 }); small(0.22); },
    fan(s) { bubbles(s.x, s.y - 0.5, 5, { speed: 5, dir: Math.PI / 2, spread: 0.6, grav: -6 }); },
    // 成就（UI 線負責 DOM 大字；這裡只做場景配合）
    feat(kind, x, y) {
      const cl = FEAT_COL[kind] ?? CANDY;
      confetti(x, y, 36, { colors: cl, speed: 12 }); stars(x, y, 18, { colors: cl });
      fx.shock(x, y, 5.5, cl[0], 0.55); fx.shock(x, y, 4, '#ffffff', 0.45, false, 0.1);
      c.slowmo(0.5); c.flash(0.25); G.fovKick -= 4; frog.jelly(5);
    },
    win(s, g) {
      lvView.bouncePad(); frog.squash(0.5, 0); frog.jelly(6);
      confetti(s.x, s.y, 60, { speed: 14, dir: Math.PI / 2, spread: 2.4, life: 1.8, grav: 9 });
      stars(s.x, s.y, 20, { speed: 11 }); bubbles(s.x, g.y + 0.3, 8, { speed: 5 });
      fx.shock(s.x, g.y + 0.1, 6, '#ffffff', 0.6, true); fx.shock(s.x, g.y + 0.1, 4, '#ffd23f', 0.5, true, 0.12);
      c.slowmo(0.6); big(0.3); c.flash(0.3); G.fovKick -= 4; c.sfx('sparkle', { n: 4 });
    },
    dieWater(e, w) {
      stop(0.06); big(0.45); c.flash(0.25); c.view.post.amount = 0.012;
      candy(e.x, 0.2, 30, [w.water, '#ffffff', w.water], { speed: 13, dir: Math.PI / 2, spread: 1.4, size: 0.34, grav: 26 });
      bubbles(e.x, 0.3, 14, { speed: 3, jitter: 1.4 });
      fx.shock(e.x, 0.15, 4, '#ffffff', 0.5, true); fx.shock(e.x, 0.15, 2.5, w.water, 0.45, true, 0.1);
    },
    dieHazard(e, sk) {
      stop(0.11); big(0.7); c.flash(0.55); c.view.post.amount = 0.03;
      candy(e.x, e.y, 22, [sk.body, sk.belly, '#ff3b3b'], { speed: 12, size: 0.34, grav: 20 });
      fx.burst(e.x, e.y, 10, { colors: ['#ffffff', '#ffd23f'], speed: 16, size: 0.3, grav: 0, shape: SH.SPARK, life: 0.35 });
      stars(e.x, e.y, 8, { colors: ['#ffffff', '#ff6fb5'], speed: 10 });
      fx.shock(e.x, e.y, 3.5, '#ff5a5a', 0.35);
    },
    // 換關過場：物件由左到右彈出來、主角果凍出場、腳下冒一圈泡泡
    levelIn(s) { frog.popIn(); lvView.intro(s.x); bubbles(s.x, s.y - 0.6, 12, { speed: 4, jitter: 1.2 }); c.sfx('pop'); },
  };
}

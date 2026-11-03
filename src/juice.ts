// 事件特效配方（軟膠公仔語彙）：每個遊戲事件 → 果凍形變／糖果碎片／閃星／泡泡／彩紙＋停格、慢動作、FOV、震動、音效層。
// 分數、跳字、連擊在 main.ts。
import { SH } from './render/fx.ts';
import type { Fx, BurstOpts } from './render/fx.ts';
import type { Character } from './render/character.ts';
import type { LevelView } from './render/level.ts';
import type { World, Skin, TongueSpec } from './config.ts';
import type { Sim } from './types.ts';
import type { PlayOpts } from './audio.ts';

const CANDY = ['#ff6fb5', '#ffd23f', '#7be0ff', '#7ee08a', '#b58cff', '#ffffff']; // 糖果色（彩紙、閃星）
const GOLD = ['#ffd23f', '#fff3a0', '#ffffff'];
const FEAT_COL: Record<string, string[]> = {
  spin: ['#ffd23f', '#ff6fb5', '#ffffff'],
  tornado: ['#ffd23f', '#ff6fb5', '#7be0ff', '#b58cff'],
  flow: ['#7ee08a', '#ffffff', '#ffd23f'],
  speed: ['#7be0ff', '#ffffff', '#ffd23f'],
  skim: ['#7be0ff', '#bff4ff', '#ffffff'],
  shave: ['#ff6fb5', '#ffffff', '#ffd23f'],
};
interface Pos {
  x: number;
  y: number;
}
export interface JuiceDeps {
  fx: Fx;
  frog: Character;
  lvView: LevelView;
  G: { hitStop: number; fovKick: number; cam: { x: number; y: number } };
  sfx: (n: string, o?: PlayOpts) => void;
  duckMusic: (amount: number, hold: number) => void;
  slowmo: (t?: number) => void;
  flash: (a: number) => void;
  vibrate: (p: number | number[]) => void;
}

export function createJuice(c: JuiceDeps) {
  const { fx, frog, lvView, G } = c;
  const stop = (t: number) => {
    G.hitStop = Math.max(G.hitStop, t);
  }; // 停格取 max，不累加
  const small = (a: number) => fx.addTrauma(a); // 高頻小事件：取 max
  const big = (a: number) => fx.addTrauma(a, true); // 大事件：累加（上限 1）
  const stars = (x: number, y: number, n: number, o: BurstOpts = {}) => fx.burst(x, y, n, { colors: GOLD, speed: 9, size: 0.34, grav: 5, drag: 2.2, life: 0.9, shape: SH.STAR, ...o });
  const confetti = (x: number, y: number, n: number, o: BurstOpts = {}) => fx.burst(x, y, n, { colors: CANDY, speed: 11, size: 0.3, grav: 7, drag: 1.6, life: 1.4, shape: SH.CONFETTI, ...o });
  const bubbles = (x: number, y: number, n: number, o: BurstOpts = {}) =>
    fx.burst(x, y, n, { colors: ['#ffffff', '#bff4ff'], speed: 3, size: 0.4, grav: -4, drag: 2, life: 1.1, shape: SH.BUBBLE, ...o });
  const candy = (x: number, y: number, n: number, colors: readonly string[], o: BurstOpts = {}) => fx.burst(x, y, n, { colors, speed: 8, size: 0.32, grav: 18, life: 0.8, shape: SH.CANDY, ...o });
  // 從鏡頭上緣落下的彩紙雨（只給最大的時刻）
  function rain(n: number): void {
    const cx = G.cam.x,
      cy = G.cam.y + 9;
    for (let i = 0; i < n; i++)
      fx.spawn(
        cx + (Math.random() - 0.5) * 34,
        cy + Math.random() * 4,
        0,
        (Math.random() - 0.5) * 3,
        -2 - Math.random() * 3,
        0,
        2.4,
        0.32 + Math.random() * 0.15,
        3,
        1.2,
        SH.CONFETTI,
        CANDY[i % CANDY.length],
      );
  }

  return {
    jump(s: Sim, w: World) {
      frog.squash(1.45, Math.atan2(-s.vx, s.vy));
      candy(s.x, s.y - 0.5, 8, [w.wood, '#f5e6c8'], { speed: 5, dir: Math.PI / 2, spread: 2.6, size: 0.24 });
    },
    attach(e: Pos & { hook: number; speed: number }, s: Sim, w: World, tk: TongueSpec) {
      lvView.wobbleHook(e.hook);
      frog.squash(0.72, s.angle);
      frog.jelly(3);
      frog.jiggle(4);
      candy(e.x, e.y, 8, [w.petal, w.bud, '#ffffff'], { speed: 6, size: 0.26, grav: 6 });
      fx.shock(e.x, e.y, 2.2, w.petal, 0.3);
      if (tk.id !== 'tongue')
        fx.burst(e.x, e.y, 10, { colors: tk.fx, speed: 5, size: 0.24, grav: tk.id === 'vine' ? 9 : 2, shape: [SH.CANDY, SH.CONFETTI, SH.BUBBLE, SH.BUBBLE][tk.fxShape] ?? SH.CANDY, life: 0.7 });
      small(Math.min(0.18, 0.05 + e.speed * 0.005));
    },
    release(s: Sim, speed: number) {
      frog.squash(1.4, Math.atan2(-s.vx, s.vy));
      frog.jelly(4);
      frog.jiggle(5);
      G.fovKick = Math.min(9, 2 + speed * 0.22);
      small(Math.min(0.15, speed * 0.006));
      if (speed > 20) bubbles(s.x, s.y, 6, { speed: 4, grav: 0, life: 0.5 });
    },
    // 翻滾：圈數越高越隆重，7 圈＝全場最大（之後的第 8、9 圈回到 4 圈等級）
    flip(s: Sim, n: number) {
      const t = n >= 10 ? 7 : n >= 7 ? 5 : n >= 2 ? 2 : 1; // 門檻偏嚴：7 圈以下只有小特效，7–9 圈中等，10 圈才是大場面
      frog.jelly(2 + Math.min(t, 7));
      if (t === 1) {
        stars(s.x, s.y, 5, { size: 0.26, speed: 6 });
        small(0.05);
        c.sfx('sparkle', { n: 1 });
        return;
      }
      if (t === 2) {
        stars(s.x, s.y, 10);
        confetti(s.x, s.y, 14);
        fx.shock(s.x, s.y, 4, '#ffd23f', 0.4);
        small(0.12);
        c.sfx('sparkle', { n: 2 });
        return;
      }
      if (t === 5) {
        stars(s.x, s.y, 26);
        confetti(s.x, s.y, 38);
        bubbles(s.x, s.y, 10, { speed: 6 });
        ['#ffd23f', '#ff6fb5', '#ffffff'].forEach((cl, i) => fx.shock(s.x, s.y, 5 + i * 1.2, cl, 0.5, false, i * 0.07));
        stop(0.06);
        c.slowmo(1);
        c.flash(0.3);
        G.fovKick -= 8;
        big(0.28);
        c.vibrate(30);
        c.sfx('sparkle', { n: 5 });
        c.sfx('fanfare', { n: 1 });
        return;
      }
      // 10 圈：停格 → 1.6 秒慢動作、閃光、四圈彩色果凍環、閃星＋彩紙＋泡泡＋糖果、天上下彩紙雨、音樂壓低、大號角
      stop(0.1);
      c.slowmo(1.6);
      c.flash(0.5);
      G.fovKick -= 10;
      big(0.45);
      c.vibrate([30, 40, 80]);
      stars(s.x, s.y, 46, { speed: 13, size: 0.42 });
      confetti(s.x, s.y, 60, { speed: 15 });
      bubbles(s.x, s.y, 18, { speed: 8 });
      candy(s.x, s.y, 20, CANDY, { speed: 12, grav: 8 });
      ['#ffd23f', '#ff6fb5', '#7be0ff', '#ffffff'].forEach((cl, i) => fx.shock(s.x, s.y, 6 + i * 1.6, cl, 0.6, false, i * 0.09));
      rain(60);
      frog.squash(1.55);
      c.sfx('fanfare', { n: 2 });
      c.duckMusic(0.2, 1.4);
    },
    fly(e: Pos) {
      candy(e.x, e.y, 6, ['#3b3a58', '#ffffff', '#ffd23f'], { speed: 5, size: 0.18, grav: 4 });
      stars(e.x, e.y, 3, { size: 0.2, speed: 4 });
      frog.jelly(2);
      frog.jiggle(3);
      c.sfx('gulp');
    },
    // 金幣入帳：金幣從角色身上蹦出來、轉著往上掉（一次最多 8 枚）
    coins(x: number, y: number, n: number) {
      const k = Math.min(8, n);
      for (let i = 0; i < k; i++) fx.spawn(x, y + 0.6, 0, (Math.random() - 0.5) * 6, 9 + Math.random() * 5, 0, 0.9, 0.6, 22, 0.8, SH.COIN, '#ffd23f');
    },
    ring(e: Pos & { i: number }, slow: number) {
      lvView.takeRing(e.i);
      frog.jelly(4);
      stars(e.x, e.y, 16, { speed: 10 });
      confetti(e.x, e.y, 10, { speed: 9 });
      fx.shock(e.x, e.y, 4.5, '#ffd23f', 0.5);
      fx.shock(e.x, e.y, 3, '#ffffff', 0.4, false, 0.07);
      c.slowmo(slow);
      G.fovKick -= 5;
      c.flash(0.15);
      small(0.12);
    },
    // 沙丘軌跡上的金圈：比一般金圈輕，一排連吃不會洗版
    ringTrail(e: Pos & { i: number }) {
      lvView.takeRing(e.i);
      frog.jelly(2);
      stars(e.x, e.y, 5, { speed: 7, size: 0.24 });
      fx.shock(e.x, e.y, 3, '#ffd23f', 0.35);
      small(0.06);
    },
    bounce(e: Pos & { i: number }, w: World) {
      lvView.squashMush(e.i);
      frog.squash(0.55, 0);
      frog.jelly(5);
      frog.jiggle(8);
      candy(e.x, e.y, 14, [w.cap, w.capSpot, '#ffffff'], { speed: 8, dir: Math.PI / 2, spread: 2.2 });
      bubbles(e.x, e.y, 5, { speed: 4 });
      fx.shock(e.x, e.y - 0.2, 3.2, '#ffffff', 0.35, true);
      stop(0.045);
      small(0.25);
      c.sfx('jelly');
    },
    close(e: Pos) {
      stars(e.x, e.y, 8, { colors: ['#ffffff', '#fff3a0'], speed: 7 });
      fx.shock(e.x, e.y, 2.5, '#ffffff', 0.3);
      c.slowmo(0.35);
      frog.jiggle(6);
      c.sfx('whoosh');
    },
    wall(s: Sim, w: World) {
      frog.squash(0.6, Math.PI / 2);
      frog.jelly(4);
      candy(s.x + 0.5, s.y, 6, [w.pad, w.vine], { speed: 5 });
      small(0.22);
    },
    pad(e: Pos, w: World) {
      frog.squash(0.6, 0);
      frog.jelly(4);
      candy(e.x, e.y - 0.4, 6, [w.pad, '#ffffff', '#ffffff'], { speed: 6, dir: Math.PI / 2, spread: 2.4, size: 0.24 });
      bubbles(e.x, e.y - 0.4, 3, { speed: 3 });
      fx.shock(e.x, e.y - 0.5, 3.4, '#ffffff', 0.4, true);
      small(0.12);
    },
    boost(e: Pos & { dx: number; dy: number }, w: World) {
      const a = Math.atan2(e.dy, e.dx);
      stars(e.x, e.y, 8, { colors: [w.petal, '#ffffff', '#fff3a0'], speed: 12, dir: a, spread: 0.5, size: 0.28 });
      fx.shock(e.x, e.y, 3.6, w.petal, 0.4);
      frog.jiggle(5);
      G.fovKick = Math.max(G.fovKick, 6);
      small(0.1);
    },
    dune(e: Pos & { speed: number }, w: World) {
      const sd = w.sand ?? ['#f0a14a', '#ffd070', '#fff0b8'];
      frog.squash(0.7, 0);
      frog.jelly(3);
      candy(e.x, e.y - 0.5, 6, [sd[1], sd[2], sd[0]], { speed: 5, dir: Math.PI / 2, spread: 2.4, size: 0.24 });
      fx.shock(e.x, e.y - 0.5, 2.8, sd[2], 0.35, true);
      small(Math.min(0.14, 0.04 + e.speed * 0.004));
    },
    launch(e: Pos & { vx: number; vy: number }, w: World) {
      const sd = w.sand ?? ['#f0a14a', '#ffd070', '#fff0b8'],
        a = Math.atan2(e.vy, e.vx);
      fx.shock(e.x, e.y, 4.2, w.petal, 0.4);
      fx.shock(e.x, e.y, 2.6, '#ffffff', 0.3, false, 0.07);
      stars(e.x, e.y, 8, { colors: [w.petal, '#fff0b8', '#ffffff'], speed: 11, dir: a, spread: 0.7, size: 0.28 });
      candy(e.x, e.y - 0.4, 8, [sd[1], sd[2], sd[0]], { speed: 7, dir: a, spread: 1.6, size: 0.26 });
      frog.jiggle(5);
      G.fovKick = Math.max(G.fovKick, 5);
      small(0.14);
    },
    slide(s: Sim, w: World) {
      const sd = w.sand ?? ['#f0a14a', '#ffd070', '#fff0b8'];
      fx.burst(s.x - 0.5, s.y - 0.55, 1, { colors: [sd[1], sd[2], sd[0]], speed: 3, size: 0.2, grav: 9, life: 0.5, shape: SH.CANDY, dir: Math.PI * 0.75, spread: 1.2, jitter: 0.2 });
    },
    fan(s: Sim) {
      bubbles(s.x, s.y - 0.5, 5, { speed: 5, dir: Math.PI / 2, spread: 0.6, grav: -6 });
    },
    feat(kind: string, x: number, y: number) {
      const cl = FEAT_COL[kind] ?? CANDY;
      confetti(x, y, 36, { colors: cl, speed: 12 });
      stars(x, y, 18, { colors: cl });
      fx.shock(x, y, 5.5, cl[0], 0.55);
      fx.shock(x, y, 4, '#ffffff', 0.45, false, 0.1);
      c.slowmo(0.5);
      c.flash(0.25);
      G.fovKick -= 4;
      frog.jelly(5);
    },
    win(s: Sim, g: { y: number }) {
      lvView.bouncePad();
      frog.squash(0.5, 0);
      frog.jelly(6);
      confetti(s.x, s.y, 60, { speed: 14, dir: Math.PI / 2, spread: 2.4, life: 1.8, grav: 9 });
      stars(s.x, s.y, 20, { speed: 11 });
      bubbles(s.x, g.y + 0.3, 8, { speed: 5 });
      fx.shock(s.x, g.y + 0.1, 6, '#ffffff', 0.6, true);
      fx.shock(s.x, g.y + 0.1, 4, '#ffd23f', 0.5, true, 0.12);
      c.slowmo(0.6);
      big(0.3);
      c.flash(0.3);
      G.fovKick -= 4;
      c.sfx('sparkle', { n: 4 });
    },
    dieWater(e: Pos, w: World) {
      stop(0.06);
      big(0.45);
      c.flash(0.25);
      candy(e.x, 0.2, 30, [w.water, '#ffffff', w.water], { speed: 13, dir: Math.PI / 2, spread: 1.4, size: 0.34, grav: 26 });
      bubbles(e.x, 0.3, 14, { speed: 3, jitter: 1.4 });
      fx.shock(e.x, 0.15, 4, '#ffffff', 0.5, true);
      fx.shock(e.x, 0.15, 2.5, w.water, 0.45, true, 0.1);
    },
    // 撞到障礙物：溫和的「噗」——一團柔軟的雲（白與肚皮色）慢慢散開、幾顆小星、淡淡一閃。不噴碎片、沒有紅色（全年齡）
    dieHazard(e: Pos, sk: Skin) {
      stop(0.08);
      big(0.4);
      c.flash(0.22);
      fx.burst(e.x, e.y, 14, { colors: ['#ffffff', sk.belly, '#ffeef5'], speed: 3.5, size: 0.55, grav: -1.5, drag: 3, life: 0.9, jitter: 0.6, shape: SH.STEAM });
      stars(e.x, e.y + 0.5, 6, { colors: ['#ffffff', '#ffe08a'], speed: 5, size: 0.26, life: 0.7 });
      fx.shock(e.x, e.y, 2.8, '#ffffff', 0.3);
    },
    // 換關過場：物件由左到右彈出來、主角果凍出場、腳下冒一圈泡泡
    levelIn(s: Sim) {
      frog.popIn();
      lvView.intro(s.x);
      bubbles(s.x, s.y - 0.6, 12, { speed: 4, jitter: 1.2 });
      c.sfx('pop');
    },
  };
}
export type Juice = ReturnType<typeof createJuice>;

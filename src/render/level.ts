// 關卡物件：全部是從原版 3D 模型烘焙的精靈（世界圖集 w<i>.* ＋ 共用的蒼蠅、翻轉圈），擺在遊戲平面 z=0，用同一台透視鏡頭投影。
// 即時模式：每幀只為鏡頭範圍內的物件送四邊形，沒有物件池、沒有場景樹；無盡模式成本不隨距離增長。
// 在水線以下的部分（木樁、蘑菇柄、葉牆、荷葉）由著色器逐像素裁掉，看起來就是立在水裡。
import { WORLDS } from '../config.ts';
import { movePos, flyPos, burstOn, burstWarn, duneH, duneStart, duneEnd } from '../sim.ts';
import type { Dune, Level, Sim, XY } from '../types.ts';
import { rgba, NOCLIP } from './gl.ts';
import type { Frame, Tex } from './gl.ts';
import { WORLD_PAL, num, tintOf } from './palette.ts';
import { stripCanvas } from './paint.ts';
import { spring } from './spring.ts';
import type { View } from './view.ts';

/** 陣列裡第 i 個彈簧拉回 0；幾乎靜止就歸零（之後整個跳過） */
function settle(x: number[], v: number[], i: number, k: number, c: number, dt: number): void {
  const r = spring(x[i], v[i], 0, k, c, dt);
  if (Math.abs(r.x) + Math.abs(r.v) < 1e-4) { x[i] = 0; v[i] = 0; } else { x[i] = r.x; v[i] = r.v; }
}
const elastic = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(2, -9 * u) * Math.cos(u * 10.5));
const tmp: XY = { x: 0, y: 0 };
const TAU = Math.PI * 2, BLADE_PERIOD = TAU / 3;

export function createLevelView(view: View) {
  const F = view.frames, wf = view.wf, spr = view.spr;
  let lv: Level | null = null, wi = 0, intro = 9, introX = 0, goalBounce = 0, hazard = 0x333333, rock = 0xffffff, bfly = 0xffffff;
  let S: Sim | null = null, T = 0, mouth: XY = { x: 0, y: 0 };
  const st = { target: -1, attached: -1, flyGone: [] as number[], ringGone: [] as number[], boostGone: [] as number[], padOn: [] as number[], padBounce: [] as number[], hookWob: [] as number[], hookWobV: [] as number[], mushK: [] as number[], mushKV: [] as number[] };

  // 沙丘：每片一組取樣點（世界座標），每幀投影成一條帶子（上緣＝沙面、下緣＝流沙下）
  let sandTex: Tex | null = null;
  const duneCache = new Map<number, Float32Array>();
  function duneSamples(fl: Dune[]): Float32Array {
    const a = duneStart(fl[0]), b = duneEnd(fl[fl.length - 1]), N = Math.max(8, Math.ceil((b - a) / 0.4));
    const out = new Float32Array((N + 1) * 2);
    for (let i = 0; i <= N; i++) { const x = a + (b - a) * i / N; let h = 0; for (const d of fl) if (x >= duneStart(d) && x <= duneEnd(d)) { h = duneH(d, x); break; } out[i * 2] = x; out[i * 2 + 1] = h; }
    return out;
  }

  function setWorld(w: number): void {
    wi = Math.max(0, Math.min(WORLDS.length - 1, w));
    hazard = num(WORLD_PAL[wi].hazard); rock = tintOf(WORLD_PAL[wi].rock); bfly = tintOf(WORLD_PAL[wi].bfly); // 小形狀圖集是灰階基底，tintOf 補償
    const sand = WORLDS[5].sand!;
    sandTex ??= view.canvasTexture(stripCanvas(4, 64, (g, w2, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, sand[2]); gr.addColorStop(0.07, sand[1]); gr.addColorStop(0.4, sand[0]); gr.addColorStop(1, sand[3]); g.fillStyle = gr; g.fillRect(0, 0, w2, h); }));
  }
  function build(level: Level): void { lv = level; setWorld(level.world); duneCache.clear(); reset(); }
  function grow(): void {
    if (!lv) return;
    const fit = (a: number[], n: number) => { while (a.length < n) a.push(0); };
    fit(st.flyGone, lv.flies.length); fit(st.ringGone, lv.rings.length); fit(st.boostGone, lv.boosts.length); fit(st.padOn, lv.pads.length); fit(st.padBounce, lv.pads.length);
    fit(st.hookWob, lv.hooks.length); fit(st.hookWobV, lv.hooks.length); fit(st.mushK, lv.mush.length); fit(st.mushKV, lv.mush.length);
  }
  function reset(): void {
    if (!lv) return;
    for (const k of ['flyGone', 'ringGone', 'boostGone', 'padOn', 'padBounce', 'hookWob', 'hookWobV', 'mushK', 'mushKV'] as const) st[k].length = 0;
    grow(); st.attached = -1;
  }

  /** 每幀（物理之後）：彈簧、淡出動畫推進；畫在 drawBack／drawFront */
  function update(s: Sim, t: number, dt: number, m: XY): void {
    if (!lv) return;
    grow(); S = s; T = t; mouth = m; intro += dt;
    for (let i = 0; i < lv.hooks.length; i++) if (st.hookWob[i] !== 0 || st.hookWobV[i] !== 0) settle(st.hookWob, st.hookWobV, i, 320, 8, dt);
    for (let i = 0; i < lv.mush.length; i++) if (st.mushK[i] !== 0 || st.mushKV[i] !== 0) settle(st.mushK, st.mushKV, i, 260, 7, dt);
    for (let i = 0; i < st.ringGone.length; i++) if (st.ringGone[i] > 0) st.ringGone[i] = Math.min(1, st.ringGone[i] + dt * 3.2);
    for (let i = 0; i < st.flyGone.length; i++) if (st.flyGone[i] > 0) st.flyGone[i] = Math.min(1, st.flyGone[i] + dt * 8);
    for (let i = 0; i < st.boostGone.length; i++) if (st.boostGone[i] > 0) st.boostGone[i] = Math.min(1, st.boostGone[i] + dt * 2.6);
    for (let i = 0; i < st.padBounce.length; i++) st.padBounce[i] *= Math.exp(-dt * 4);
    goalBounce *= Math.exp(-dt * 4);
  }

  // 鏡頭範圍（遊戲平面）
  let x0 = 0, x1 = 0;
  const vis = (x: number, r = 3) => x + r > x0 && x - r < x1;
  const pop = (x: number) => elastic(intro - Math.max(0, Math.min(0.7, (x - introX) * 0.01)));
  const ringK = (i: number, t: number, trail: boolean) => {
    let k: number;
    if (st.ringGone[i] > 0) { const u = st.ringGone[i]; k = (1 + Math.sin(u * 14) * 0.25 * (1 - u) + u * 0.5) * (1 - u * u); }
    else k = 1 + Math.sin(t * 4 + i) * 0.04;
    return k * (trail ? 0.68 : 1);
  };

  function drawBack(): void {
    if (!lv || !S) return;
    const s = S, t = T, half = view.W / 2 / view.s + 6;
    x0 = view.cam.x - half; x1 = view.cam.x + half;
    const top = view.cam.y + view.H / 2 / view.s + 3;
    // 沙丘
    if (lv.dunes.length && sandTex) {
      const fields = new Map<number, Dune[]>();
      for (const d of lv.dunes) if (!d.off) { if (!fields.has(d.f)) fields.set(d.f, []); fields.get(d.f)!.push(d); }
      for (const [fi, fl] of fields) {
        if (!(duneEnd(fl[fl.length - 1]) > x0 && duneStart(fl[0]) < x1)) continue;
        let sm = duneCache.get(fi); if (!sm) { sm = duneSamples(fl); duneCache.set(fi, sm); }
        const n = sm.length / 2, R = view.R, mulc = rgba(0xffffff, 1), clip = view.waterline(view.cam.x, 0);
        let ax = 0, ay = 0, bx = 0, by = 0;
        for (let i = 0; i < n; i++) {
          const p = view.proj(sm[i * 2], sm[i * 2 + 1], 0), tx = p.x, ty = p.y, q = view.proj(sm[i * 2], -1.4, 0), u = i / (n - 1);
          if (i) R.quadUV(sandTex, ax, ay, u, 0, tx, ty, u, 0, bx, by, u, 1, q.x, q.y, u, 1, mulc, 0, clip);
          ax = tx; ay = ty; bx = q.x; by = q.y;
        }
      }
    }
    // 終點：葉牆（後面幾層）、大荷葉、旗子
    const g = lv.goal;
    if (vis(g.x, 16)) {
      for (const [dx, sx, sy, z] of [[6.0, 1.0, 0.78, -3.2], [3.6, 0.9, 0.62, -2.2], [1.0, 1.1, 1.0, -1.0]] as const) spr(wf('goalWall'), g.wall + dx - 1, 0, z, 0, sx, sy);
      spr(wf('flagPole'), g.x - 1.5, g.y + 3, -1.6, 0, 1, 1, 0xffffff, 1, false);
      spr(wf('flag'), g.x - 0.4, g.y + 5.2, -1.6, Math.sin(t * 6) * 0.06, 1, 1, 0xffffff, 1, false);
      const b = goalBounce * Math.sin(t * 26);
      spr(wf('goal'), g.x, g.y, 0, 0, g.w / 12, 1 - b * 0.55);
    }
    // 中途荷葉＋小旗（落地後換成點綴色）
    lv.pads.forEach((p, i) => {
      if (!vis(p.x, p.w)) return;
      spr(wf('flagPole'), p.x + 2.3, p.y + 2.25, -0.9, 0, 0.9, 0.75, 0xffffff, 1, false);
      spr(wf('flag'), p.x + 3.3, p.y + 3.7, -0.9, Math.sin(t * 5 + i) * 0.06, 0.95, 0.95, st.padOn[i] ? 0xffffff : 0xe6e6e6, 1, false, false, st.padOn[i] ? 0 : rgba(0x9a9a9a, 0));
      const bn = st.padBounce[i] * Math.sin(t * 26);
      spr(wf('pad'), p.x, p.y - 0.112, 0, 0, p.w / 2, 1 - bn * 0.5);
    });
    // 起點木樁
    if (vis(lv.start.x)) spr(wf('stump'), lv.start.x, lv.start.y - 2.25, 0, 0, 1, 1);
    // 風扇／蒸汽噴口：氣流柱＋底座＋葉片（四格輪播＝繞垂直軸轉）
    lv.fans.forEach((fn, i) => {
      if (!vis(fn.x, 4)) return;
      const k = (fn.w / 3.2) * pop(fn.x), on = fn.burst ? burstOn(fn.burst, s.t) : false, warn = fn.burst ? burstWarn(fn.burst, s.t) : false;
      spr(F.column, fn.x, (fn.y0 + fn.y1) / 2, -0.4, 0, fn.w / 1, (fn.y1 - fn.y0) / 1, 0xffffff, on ? 0.3 : 0.12 + Math.sin(t * 3 + i) * 0.03, false);
      if (wi === 3) { const sq = on ? 0.22 : warn ? Math.sin(t * 38) * 0.06 : 0; spr(wf('geyser'), fn.x, fn.y0, 0, 0, k * (1 - sq * 0.4), k * (1 + sq)); }
      else {
        spr(wf('fanBase'), fn.x, fn.y0, 0, 0, k, k);
        const ph = ((t * 14) % BLADE_PERIOD) / BLADE_PERIOD;
        spr(wf(`blade${Math.floor(ph * 4) % 4}`), fn.x, fn.y0, 0, 0, k, k, 0xffffff, 1, false);
      }
    });
    // 石頭（全年齡，原尖刺；碰撞不變）：立在水裡的石柱頂上，或從上面垂下來輕輕晃
    lv.spikes.forEach((sp, i) => {
      if (!vis(sp.x)) return;
      const y = sp.y + (sp.hang ? Math.sin(t * 1.6 + i) * 0.15 : 0), k = pop(sp.x);
      if (sp.pole) spr(wf('flagPole'), sp.x, (y - 1) / 2, -0.2, 0, 2.2, (y + 1) / 6, hazard);
      else spr(wf('flagPole'), sp.x, y + 20, -0.2, 0, 0.8, 40 / 6, hazard, 1, false);
      spr(F.rock, sp.x, y, 0, ((i % 3) - 1) * 0.3, k * (i % 2 ? 1 : -1), k, rock, 1, false);
    });
    // 蝴蝶（全年齡，原鋸片）：沿淡淡的軌道飛、拍翅、微微上下
    lv.saws.forEach((sw, i) => {
      if (!vis(sw.x, 5)) return;
      spr(F.track, sw.x, sw.y, -0.3, 0, sw.move.ax * 2 + 0.3, sw.move.ay * 2 + 0.3, 0xffffff, 0.1, false);
      movePos(sw, s.t, tmp);
      const k = (sw.r / 1.25) * pop(sw.x), flap = Math.sin(t * 20 + i * 1.7) > 0;
      spr(flap ? F.bfly1 : F.bfly0, tmp.x, tmp.y + Math.sin(t * 5 + i) * 0.12, 0, Math.sin(t * 2.5 + i) * 0.15, k, k, bfly, 1, false);
    });
    // 蘑菇：柄（拉長到水裡）＋傘（踩到時壓扁再彈回）
    lv.mush.forEach((m, i) => {
      if (!vis(m.x)) return;
      const k = st.mushK[i], sc = (m.r / 1.9) * pop(m.x), rot = Math.sin(t * 1.7 + i) * 0.04, stem = wf('mush.stem');
      if (stem) { const below = (stem.h - stem.ay) * stem.unit * sc; spr(stem, m.x, m.y - 0.15, 0, 0, sc, below > 0.01 ? (m.y + 0.85) / below * sc : sc); }
      spr(wf('mush.cap'), m.x, m.y - 0.15, 0, rot, sc * (1 - k * 0.6), sc * (1 + k));
    });
    // 鉤點：藤蔓（往上伸出畫面）＋葉子＋花；目標加白色光環
    for (let i = 0; i < lv.hooks.length; i++) {
      movePos(lv.hooks[i], s.t, tmp);
      if (!vis(tmp.x)) continue;
      const k = pop(tmp.x), wob = st.hookWob[i], sw = Math.sin(t * 1.3 + i) * 0.08 + wob * 0.5, big = i === st.target ? 1.12 : 1;
      const len = Math.max(0, top - tmp.y), lean = sw * 0.08;
      spr(wf('vine'), tmp.x, tmp.y + 0.55, -0.3, lean, 1, len, 0xffffff, 1, false);
      if (wi === 0) for (let j = 0; j < 2; j++) { const ly = tmp.y + 2.4 + j * 3.1; if (ly < top) spr(wf('leaf'), tmp.x - Math.sin(lean) * (ly - tmp.y), ly, -0.2, (j ? 2.5 : 0.6) + Math.sin(t * 2.2 + i + j * 2) * 0.12, 0.9, 0.9, 0xffffff, 1, false); }
      if (i === st.target && st.attached < 0) {
        spr(F.halo, tmp.x, tmp.y, 0.5, 0, 1 + Math.sin(t * 12) * 0.08, 1 + Math.sin(t * 12) * 0.08, 0xffffff, 0.9, false);
        const u = (t * 1.6) % 1; spr(F.halo, tmp.x, tmp.y, 0.5, 0, 1 + u * 0.9, 1 + u * 0.9, 0xffffff, 0.7 * (1 - u), false);
      }
      spr(wf('hook'), tmp.x, tmp.y, 0, sw, 1.15 * big * (1 - wob * 0.4) * k, 1.15 * big * (1 + wob) * k, 0xffffff, 1, false);
    }
    // 加速圈
    lv.boosts.forEach((b, i) => {
      if (b.off || !vis(b.x)) return;
      let k = 1 + Math.sin(t * 5 + i) * 0.06;
      if (st.boostGone[i] > 0) { const u = st.boostGone[i]; k *= (1 + u * 0.6) * (1 - u * u); }
      k *= pop(b.x);
      if (k > 0.001) spr(wf('boost'), b.x, b.y, 0, Math.atan2(b.dy, b.dx), k * (1 + Math.sin(t * 1.5 + i) * 0.06), k, 0xffffff, 1, false);
    });
    // 翻轉圈（整圈畫在角色後面；靠鏡頭那半圈在 drawFront 再畫一次）
    lv.rings.forEach((r, i) => { if (!vis(r.x)) return; const k = ringK(i, t, r.trail !== undefined) * pop(r.x); if (k > 0.001) spr(F.ring, r.x, r.y, 0, 0, k * (0.9 + Math.sin(t * 1.2 + i) * 0.1), k, 0xffffff, 1, false); });
    // 蒼蠅：翅膀快速拍動；被吃掉時飛進嘴裡縮掉
    lv.flies.forEach((fl, i) => {
      flyPos(fl, s.t, tmp);
      let x = tmp.x, y = tmp.y, k = 1;
      if (st.flyGone[i] > 0) { const u = st.flyGone[i]; x += (mouth.x - x) * u; y += (mouth.y - y) * u; k *= 1 - u; }
      if (k <= 0.01 || !vis(x)) return;
      k *= pop(x);
      const rot = Math.sin(t * 10 + i) * 0.2, flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 46 + i));
      spr(F['fly.wingL'], x, y, 0, rot, k, k * flap, 0xffffff, 0.85, false);
      spr(F['fly.body'], x, y, 0, rot, k, k, 0xffffff, 1, false);
      spr(F['fly.wingR'], x, y, 0, rot, k, k * flap, 0xffffff, 0.85, false);
    });
  }
  function drawFront(): void {
    if (!lv || !S) return;
    const t = T, fr = F.ring as Frame | undefined;
    if (!fr) return;
    lv.rings.forEach((r, i) => {
      if (!vis(r.x)) return;
      const k = ringK(i, t, r.trail !== undefined) * pop(r.x);
      if (k <= 0.001) return;
      const p = view.proj(r.x, r.y, 0), kk = p.k * fr.unit;
      view.R.sprite(fr, p.x, p.y, 0, kk * k * (0.9 + Math.sin(t * 1.2 + i) * 0.1), kk * k, rgba(0xffffff, 1), 0, NOCLIP, 0, 0.5);
    });
  }

  return {
    st, build, reset, update, setWorld, drawBack, drawFront,
    isGeyser: () => wi === 3,
    ballPos(i: number): [number, number] | null { if (!lv?.hooks[i]) return null; movePos(lv.hooks[i], 0, tmp); return [tmp.x, tmp.y]; },
    wobbleHook(i: number) { st.hookWobV[i] = (st.hookWobV[i] ?? 0) + 11; },
    squashMush(i: number) { st.mushK[i] = -0.5; st.mushKV[i] = 0; },
    eatFly(i: number) { st.flyGone[i] = 0.001; },
    takeRing(i: number) { st.ringGone[i] = 0.001; },
    bouncePad() { goalBounce = 1; },
    landPad(i: number) { st.padOn[i] = 1; st.padBounce[i] = 1; },
    takeBoost(i: number) { st.boostGone[i] = 0.001; },
    intro(x: number) { intro = 0; introX = x; },
  };
}
export type LevelView = ReturnType<typeof createLevelView>;

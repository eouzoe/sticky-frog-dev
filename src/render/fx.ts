// 特效：粒子（結構陣列，畫的時候才投影）、果凍衝擊環、速度線、拖尾緞帶（依時間取樣）、分級畫面震動。
// 介面沿用原版（burst／shock／spawn／addTrauma…），juice.ts 的配方不用改。
// 繪製分兩段：drawTrail（角色後面）、draw（粒子、衝擊環、速度線，最上層）。
import { TUNE as T } from '../config.ts';
import type { TrailSpec } from '../config.ts';
import type { Sim } from '../types.ts';
import { rgba, NOCLIP } from './gl.ts';
import type { Frame, Tex } from './gl.ts';
import { trailStrip } from './paint.ts';
import { tintOf } from './palette.ts';
import type { View } from './view.ts';

// shape：0 糖果碎片、1 彩紙、2 糖果火花、3 泡泡、4 閃星、5 金幣、6 蒸汽團
export const SH = { CANDY: 0, CONFETTI: 1, SPARK: 2, BUBBLE: 3, STAR: 4, COIN: 5, STEAM: 6 } as const;
const SHAPE_KEY = ['p_candy', 'p_confetti', 'p_spark', 'p_bubble', 'p_star', 'coin', 'p_steam'];
const MAX = 220;

export interface BurstOpts {
  colors?: readonly string[];
  speed?: number;
  size?: number;
  life?: number;
  dir?: number | null;
  spread?: number;
  jitter?: number;
  vx?: number;
  vy?: number;
  grav?: number;
  drag?: number;
  shape?: number;
}

export function createFx(view: View) {
  const F = view.frames,
    R = view.R;
  const tintCache = new Map<string, number>();
  const tintFor = (c: string) => {
    let v = tintCache.get(c);
    if (v === undefined) {
      v = tintOf(c);
      tintCache.set(c, v);
    }
    return v;
  };
  const shape: Frame[] = SHAPE_KEY.map((k) => F[k]);
  // 金幣是烘焙的 3D 金幣（真實顏色、尺寸是世界單位），其他是灰階小形狀（每單位 40 像素）：換算成同一個「大小 1＝1 世界單位寬」
  const shapeK = shape.map((f) => 1 / (f.w * f.unit));

  // ---- 粒子
  const P = {
    x: new Float32Array(MAX),
    y: new Float32Array(MAX),
    vx: new Float32Array(MAX),
    vy: new Float32Array(MAX),
    life: new Float32Array(MAX),
    max: new Float32Array(MAX),
    size: new Float32Array(MAX),
    rot: new Float32Array(MAX),
    rv: new Float32Array(MAX),
    g: new Float32Array(MAX),
    drag: new Float32Array(MAX),
    shape: new Uint8Array(MAX),
    tint: new Uint32Array(MAX),
    kx: new Float32Array(MAX),
    ky: new Float32Array(MAX),
    ra: new Float32Array(MAX),
    a: new Float32Array(MAX),
  };
  const live = new Uint8Array(MAX);
  let alive = 0,
    cap = MAX,
    cursor = 0;
  function spawn(x: number, y: number, _z: number, vx: number, vy: number, _vz: number, life: number, size: number, g: number, drag: number, sh: number, color: string): void {
    if (alive >= cap) return;
    let i = -1;
    for (let n = 0; n < MAX; n++) {
      const j = (cursor + n) % MAX;
      if (!live[j]) {
        i = j;
        break;
      }
    }
    if (i < 0) return;
    cursor = (i + 1) % MAX;
    live[i] = 1;
    alive++;
    P.x[i] = x;
    P.y[i] = y;
    P.vx[i] = vx;
    P.vy[i] = vy;
    P.life[i] = life;
    P.max[i] = life;
    P.size[i] = size;
    P.rot[i] = Math.random() * 6.28;
    P.rv[i] = (Math.random() - 0.5) * 14;
    P.g[i] = g;
    P.drag[i] = drag;
    P.shape[i] = sh;
    P.tint[i] = sh === SH.COIN ? 0xffffff : tintFor(color);
  }
  function burst(x: number, y: number, n: number, o: BurstOpts = {}): void {
    if (alive > cap * 0.7) n = Math.ceil(n / 2);
    const colors = o.colors ?? ['#ffffff'],
      sp = o.speed ?? 8,
      size = o.size ?? 0.25,
      life = o.life ?? 0.7;
    const dir = o.dir ?? null,
      spread = o.spread ?? Math.PI * 2,
      jit = o.jitter ?? 0.3;
    for (let k = 0; k < n; k++) {
      const a = dir === null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread,
        v = sp * (0.4 + Math.random() * 0.8);
      spawn(
        x + (Math.random() - 0.5) * jit,
        y + (Math.random() - 0.5) * jit,
        0,
        Math.cos(a) * v + (o.vx ?? 0),
        Math.sin(a) * v + (o.vy ?? 0),
        0,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        o.grav ?? 18,
        o.drag ?? 1.5,
        o.shape ?? 0,
        colors[k % colors.length],
      );
    }
  }

  // ---- 果凍衝擊環、速度線
  const rings = Array.from({ length: 8 }, () => ({ x: 0, y: 0, t: 1, dur: 0.4, size: 3, delay: 0, flat: false, tint: 0xffffff }));
  let ringI = 0;
  function shock(x: number, y: number, size = 3, color = '#ffffff', dur = 0.4, flat = false, delay = 0): void {
    const r = rings[ringI++ % rings.length];
    r.x = x;
    r.y = y;
    r.tint = tintFor(color);
    r.t = 0;
    r.dur = dur;
    r.size = size;
    r.delay = delay;
    r.flat = flat;
  }
  const lines = Array.from({ length: 24 }, () => ({ x: 0, y: 0, rot: 0, t: 1, len: 1 }));
  let lineI = 0,
    lineAcc = 0;

  // ---- 拖尾：頭在第 0 點；每 1/60 秒（依時間，不依幀數）推進一格
  const TN = 20,
    hist = Array.from({ length: TN }, () => ({ x: 0, y: 0 })),
    trailTex = new Map<string, Tex>();
  let trailAlpha = 0,
    trailId = 'none',
    trailSpec: TrailSpec | null = null,
    trailAcc = 0,
    trailW = 0.6;
  let tex: Tex = view.canvasTexture(trailStrip(['#ffffff']));
  function setTrail(t: TrailSpec): void {
    trailSpec = t;
    trailId = t.id;
    trailW = t.id === 'none' ? 0.6 : 0.95;
    let tx = trailTex.get(t.id);
    if (!tx) {
      tx = view.canvasTexture(trailStrip(t.id === 'none' ? ['#ffffff'] : t.colors));
      trailTex.set(t.id, tx);
    }
    tex = tx;
  }
  function resetTrail(x: number, y: number): void {
    hist.forEach((h, i) => {
      h.x = x - i * 0.002;
      h.y = y;
    });
  }

  const shake = { trauma: 0, t: 0, x: 0, y: 0, scale: 1 };
  const addTrauma = (a: number, big = false) => {
    shake.trauma = big ? Math.min(1, shake.trauma + a) : Math.max(shake.trauma, Math.min(1, a));
  };

  function update(dt: number, realDt: number, s: Sim | null, sx: number, sy: number, speed: number, active: boolean): void {
    for (let i = 0; i < MAX; i++) {
      if (!live[i]) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        live[i] = 0;
        alive--;
        continue;
      }
      const dr = 1 - P.drag[i] * dt,
        sh = P.shape[i];
      P.vx[i] *= dr;
      P.vy[i] = P.vy[i] * dr - P.g[i] * dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      P.rot[i] += P.rv[i] * dt;
      const u = P.life[i] / P.max[i],
        sz = P.size[i];
      const pop = Math.min(1, (1 - u) * 8),
        grow = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
      let kx: number,
        ky: number,
        rot = P.rot[i],
        a = 1;
      if (sh === SH.SPARK) {
        const v = Math.hypot(P.vx[i], P.vy[i]);
        rot = Math.atan2(P.vy[i], P.vx[i]);
        kx = sz * (1 + v * 0.1) * u;
        ky = sz * 0.9 * u;
      } else if (sh === SH.CONFETTI) {
        const k = sz * 1.3 * grow * (u < 0.3 ? u / 0.3 : 1);
        kx = k * Math.cos(P.rot[i] * 0.7);
        ky = k;
      } else if (sh === SH.BUBBLE) {
        const w = 1 + Math.sin(P.rot[i] * 3) * 0.08,
          k = sz * (1.5 - u * 0.5) * grow * (u < 0.12 ? 1 + (0.12 - u) * 4 : 1);
        kx = k * w;
        ky = k / w;
        rot = 0;
      } else if (sh === SH.STEAM) {
        const w = 1 + Math.sin(P.rot[i] * 2) * 0.07,
          k = sz * grow * (0.55 + 0.9 * Math.sqrt(u));
        kx = k * w;
        ky = k / w;
        rot = 0;
        a = Math.min(1, u * 2.5);
      } else if (sh === SH.STAR) {
        const k = sz * grow * (1 + Math.sin(P.rot[i] * 2.2) * 0.18) * Math.min(1, u * 2.5);
        kx = k;
        ky = k;
        rot = P.rot[i] * 0.25;
      } else if (sh === SH.COIN) {
        const k = sz * grow * Math.min(1, u * 3);
        kx = k * Math.cos(P.rot[i] * 1.6);
        ky = k;
        rot = 0;
      } else {
        const j = 1 + Math.sin(P.rot[i] * 2.5) * 0.15,
          k = sz * grow * u;
        kx = k * 1.15 * j;
        ky = (k * 0.9) / j;
      }
      P.kx[i] = kx;
      P.ky[i] = ky;
      P.ra[i] = rot;
      P.a[i] = a;
    }
    for (const r of rings) {
      if (r.t >= 1) continue;
      if (r.delay > 0) {
        r.delay -= realDt;
        if (r.delay > 0) continue;
      }
      r.t += realDt / r.dur;
    }
    if (s) {
      trailAcc += dt;
      while (trailAcc >= 1 / 60) {
        trailAcc -= 1 / 60;
        for (let i = TN - 1; i > 0; i--) {
          hist[i].x = hist[i - 1].x;
          hist[i].y = hist[i - 1].y;
        }
      }
      hist[0].x = sx;
      hist[0].y = sy;
      const target = active && speed > 7 && s.mode !== 'perch' ? Math.min(1, (speed - 7) / 10) : 0;
      trailAlpha += (target - trailAlpha) * Math.min(1, realDt * 6 + 0.02);
      if (trailAlpha > 0.3 && trailId !== 'none' && trailSpec && Math.random() < realDt * 30) {
        const c = trailSpec.colors[Math.floor(Math.random() * trailSpec.colors.length)];
        if (trailId === 'fire') spawn(sx, sy, 0, (Math.random() - 0.5) * 2, 2, 0, 0.4, 0.3, -4, 2, SH.CANDY, c);
        else if (trailId === 'bubble') spawn(sx, sy, 0, (Math.random() - 0.5) * 2, 1, 0, 0.7, 0.26, -3, 1, SH.BUBBLE, c);
        else spawn(sx, sy, 0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0, 0.5, 0.16, 0, 1, SH.STAR, c);
      }
      lineAcc += dt * (active && speed > 17 ? (speed - 17) * 2.2 : 0);
      while (lineAcc > 1) {
        lineAcc -= 1;
        const l = lines[lineI++ % lines.length],
          a = Math.atan2(s.vy, s.vx),
          off = (Math.random() - 0.5) * 7;
        l.x = sx + Math.cos(a) * (2 + Math.random() * 5) - Math.sin(a) * off;
        l.y = sy + Math.sin(a) * (2 + Math.random() * 5) + Math.cos(a) * off;
        l.rot = a;
        l.len = speed * 0.12;
        l.t = 0;
      }
    }
    for (const l of lines) if (l.t < 1) l.t += realDt * 4;
    shake.trauma = Math.max(0, shake.trauma - realDt * T.SHAKE_DECAY);
    shake.t += realDt * 32;
    const k = shake.trauma * shake.trauma * T.SHAKE_SCALE * shake.scale;
    shake.x = 0.9 * k * Math.sin(shake.t * 1.7);
    shake.y = 0.7 * k * Math.sin(shake.t * 2.3 + 1);
  }

  /** 拖尾緞帶（角色後面）：整張貼圖從頭（亮）拉到尾（淡） */
  function drawTrail(): void {
    const a = trailAlpha * (trailId === 'none' ? 0.45 : 0.9);
    if (a <= 0.01) return;
    const mulc = rgba(0xffffff, a);
    let ax = 0,
      ay = 0,
      bx = 0,
      by = 0;
    for (let i = 0; i < TN; i++) {
      const p = view.proj(hist[i].x, hist[i].y, -0.05),
        hk = (trailW / 2) * p.k * (1 - (i / TN) * 0.5);
      const j0 = Math.max(0, i - 1),
        j1 = Math.min(TN - 1, i + 1);
      const tx = hist[j1].x - hist[j0].x,
        ty = hist[j1].y - hist[j0].y,
        tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl,
        ny = -tx / tl,
        u = i / (TN - 1);
      const lx = p.x + nx * hk,
        ly = p.y + ny * hk,
        rx = p.x - nx * hk,
        ry = p.y - ny * hk;
      if (i) R.quadUV(tex, ax, ay, (i - 1) / (TN - 1), 0, lx, ly, u, 0, bx, by, (i - 1) / (TN - 1), 1, rx, ry, u, 1, mulc, 0, NOCLIP);
      ax = lx;
      ay = ly;
      bx = rx;
      by = ry;
    }
  }
  /** 粒子、衝擊環、速度線（最上層） */
  function draw(): void {
    for (let i = 0; i < MAX; i++) {
      if (!live[i]) continue;
      const sh = P.shape[i],
        f = shape[sh],
        p = view.proj(P.x[i], P.y[i], 0.1),
        kk = p.k * f.unit * shapeK[sh];
      R.sprite(f, p.x, p.y, -P.ra[i], kk * P.kx[i], kk * P.ky[i], rgba(P.tint[i], P.a[i]));
    }
    const sf = F.shock;
    for (const r of rings) {
      if (r.t >= 1 || r.delay > 0) continue;
      const e = 1 - Math.pow(1 - r.t, 3) + Math.sin(r.t * Math.PI) * 0.12,
        k = 0.3 + e * r.size,
        p = view.proj(r.x, r.y, 0.1),
        kk = p.k * sf.unit;
      R.sprite(sf, p.x, p.y, 0, kk * k, kk * k * (r.flat ? 0.28 : 1), rgba(r.tint, 0.9 * (1 - r.t)));
    }
    const lf = F.speedLine;
    for (const l of lines) {
      if (l.t >= 1) continue;
      const k = 1 - l.t,
        p = view.proj(l.x, l.y, 0.1),
        kk = p.k * lf.unit;
      R.sprite(lf, p.x, p.y, -l.rot, kk * l.len * k, kk * k, rgba(0xffffff, 1));
    }
  }
  function clear(): void {
    live.fill(0);
    alive = 0;
    for (const r of rings) r.t = 1;
    for (const l of lines) l.t = 1;
    shake.trauma = 0;
    trailAlpha = 0;
    lineAcc = 0;
  }
  return {
    burst,
    shock,
    spawn,
    update,
    draw,
    drawTrail,
    addTrauma,
    shake,
    setTrail,
    resetTrail,
    clear,
    setCap(n: number) {
      cap = Math.min(MAX, n);
    },
    count: () => alive,
  };
}
export type Fx = ReturnType<typeof createFx>;

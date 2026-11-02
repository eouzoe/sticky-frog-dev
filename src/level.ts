// 90 關程序產生（種子固定）：同一關每次長一樣。難度＝全域進度 + 世界內進度。
import { TUNE, THEME_LEVELS } from './config.ts';
import { duneH } from './sim.ts';
import type { Boost, Dune, Fan, GenCursor, Level, Move } from './types.ts';

export const LEVEL_COUNT = 90;
export const THEME_WORLD = 0; // 主題系列關卡（LEVEL_COUNT+1 起，每個主題 THEME_LEVELS 關）用的世界：道具由主題替換
export const isThemeLevel = (n: number) => n > LEVEL_COUNT;
export const worldOf = (n: number) => (isThemeLevel(n) ? THEME_WORLD : Math.min(7, Math.floor((n - 1) / 15)));
export const levelLabel = (n: number) => (isThemeLevel(n) ? `★-${((n - LEVEL_COUNT - 1) % THEME_LEVELS) + 1}` : `${worldOf(n) + 1}-${((n - 1) % 15) + 1}`);

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 基本元素的解鎖關卡（第一次可能出現的關）；開場「NEW」字卡就看這張表
export const UNLOCK = { mush: 3, swarm: 4, ring: 5, move: 6, spikeLow: 8, mushChain: 9, ringArc: 12, fan: 18, saw: 22, spikeHigh: 25, tunnel: 33, pad: 63, boost: 69, dune: 76 };
export type ElementId = keyof typeof UNLOCK;
// NEW 字卡出現的關卡＝元素「實際第一次出現」的關（tests/unlock-check.mjs 驗證）
export const NEW_AT: Record<ElementId, number> = { ...UNLOCK, move: 7, spikeLow: 9 };
// 這一關要顯示 NEW 字卡的元素 id 清單（沒有＝[]）
export const newElements = (n: number) => (Object.keys(NEW_AT) as ElementId[]).filter((k) => NEW_AT[k] === n);

/** 61 關以後每個世界內第幾關的節奏：teach＝教學關、calm＝喘息、pad／boost／dune＝保證放的段落（關卡長度的幾成處） */
interface PlanEntry { teach?: boolean; calm?: boolean; pad?: number[]; boost?: number[]; dune?: number[]; tall?: boolean; grab?: boolean; long?: boolean }
const PLAN: Record<number, PlanEntry> = {
  1: { teach: true }, 2: { calm: true }, 3: { pad: [0.5] }, 4: { calm: true, pad: [0.45] }, 6: { calm: true }, 7: { pad: [0.6] }, 8: { calm: true },
  9: { boost: [0.5] }, 11: { calm: true, boost: [0.4] }, 12: { boost: [0.35, 0.7] }, 14: { calm: true }, 15: { pad: [0.3], boost: [0.65] },
};
// 第 6 世界（76–90 關，夕陽沙丘）：tall＝坡頂更高更陡、grab＝下一根鉤點離坡頂近、long＝加長的沙丘
const PLAN6: Record<number, PlanEntry> = {
  1: { teach: true, long: true, dune: [0.14, 0.5] }, 2: { calm: true, dune: [0.14, 0.55] }, 3: { dune: [0.14, 0.55] }, 4: { calm: true, dune: [0.14, 0.55] }, 5: { dune: [0.14, 0.55], tall: true },
  6: { calm: true, dune: [0.14, 0.55] }, 7: { dune: [0.14, 0.55] }, 8: { calm: true, dune: [0.14, 0.55] }, 9: { dune: [0.14, 0.55] }, 10: { dune: [0.14, 0.55], long: true }, 11: { calm: true, dune: [0.14, 0.55] }, 12: { dune: [0.14, 0.55] },
  13: { dune: [0.14, 0.55], grab: true }, 14: { calm: true, dune: [0.14, 0.55] }, 15: { dune: [0.1, 0.4, 0.7], tall: true },
};
const HAZARD = new Set(['spikeLow', 'spikeHigh', 'fan', 'saw', 'tunnel']);
// 加速圈出口淨空：圈圈往前 BOOST_REACH、上下 BOOST_Y 的範圍內不能有尖刺／鋸片（含鋸片移動範圍），否則那顆加速圈關掉
export const BOOST_REACH = 19, BOOST_Y = 14;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// 部分關卡換種子（tests/sim-check.mjs 的自動玩家破不了或太難的）
export const SALT: Record<number, number> = { 12: 7, 19: 3, 31: 11, 50: 14, 20: 1, 23: 1, 25: 2, 26: 1, 29: 1, 32: 1, 33: 1, 37: 2, 38: 3, 41: 1, 42: 4, 43: 1, 44: 1, 46: 5, 51: 1, 54: 3, 56: 1, 58: 1, 60: 3, 61: 2, 62: 1, 63: 3, 64: 1, 65: 5, 66: 1, 68: 1, 69: 4, 70: 3, 71: 1, 74: 12, 77: 2, 80: 9, 84: 13, 85: 5, 89: 2, 81: 3, 78: 6, 82: 4, 87: 2 };

const emptyLevel = (n: number, world: number, diff: number): Level => ({
  n, world, diff,
  start: { x: 0, y: 3 },
  hooks: [], mush: [], spikes: [], saws: [], fans: [], rings: [], flies: [], pads: [], boosts: [], dunes: [],
  goal: { x: 0, y: 0, w: 0, wall: 0 }, length: 0, par: 0,
});

export function generateLevel(n: number, salt: number = SALT[n] ?? 0): Level {
  const r = mulberry32(n * 7919 + 1013 + salt * 100003);
  // 主題系列關卡：難度對應中段（第 33–60 關的元素種類與密度），由第幾關決定；nd＝拿來查解鎖表與長度的「等效關卡號」
  const k = isThemeLevel(n) ? ((n - LEVEL_COUNT - 1) % THEME_LEVELS) + 1 : 0, nd = k ? 30 + k * 3 : n;
  const local = ((nd - 1) % 15) / 14;
  // 前 60 關寫死 /59（LEVEL_COUNT 變動不能讓它們重新產生）；61 關以後每個世界從 0.45 爬到 0.85
  let diff = k ? 0.4 + ((k - 1) / Math.max(1, THEME_LEVELS - 1)) * 0.35 : nd <= 60 ? clamp(((nd - 1) / 59) * 0.75 + local * 0.3, 0, 1) : 0.45 + local * 0.4;
  const plan: PlanEntry | null = !k && nd > 60 ? ((nd > 75 ? PLAN6 : PLAN)[(nd - 1) % 15 + 1] ?? {}) : null;
  if (plan?.teach) diff = 0.1;
  else if (plan?.calm) diff = Math.max(0.1, diff - 0.1);
  const L = emptyLevel(n, worldOf(n), diff);
  const g: GenCursor = { r, x: 7, y: 11, prevType: 'hook' };
  firstHook(L, g);
  const targetLen = nd === 1 ? 46 : 52 + Math.min(nd, 60) * 3.4;
  const forces: [number, string][] = plan ? [...(plan.pad ?? []).map((f): [number, string] => [f, 'pad']), ...(plan.boost ?? []).map((f): [number, string] => [f, 'boost']), ...(plan.dune ?? []).map((f): [number, string] => [f, 'dune'])].sort((a, b) => a[0] - b[0]) : [];
  g.end = targetLen - 30; // 終點前不放沙丘段落
  while (g.x < targetLen) {
    if (!g.force && forces.length && g.x >= forces[0][0] * targetLen) g.force = forces.shift()![1];
    addSegment(L, g, nd, diff, plan);
  }
  const x = g.x;

  const gx = x + 12;
  L.goal = { x: gx, y: 1.3, w: 12, wall: gx + 6.2 }; // 荷葉後面有一面大葉子牆把飛過頭的青蛙擋回來
  flyOf(L, r)(gx - 4, 6);
  L.length = gx;
  L.par = Math.round(L.length / TUNE.PAR_SPEED + 3);
  if (L.world === 3) addBursts(L);
  markBoosts(L, Infinity);
  markDunes(L, Infinity);
  return L;
}

export function boostZoneClear(L: Level, b: Boost): boolean {
  const x0 = b.x - 1.5, x1 = b.x + BOOST_REACH, y0 = b.y - BOOST_Y, y1 = b.y + BOOST_Y;
  const hit = (x: number, y: number, r: number, ax = 0, ay = 0) => x + ax + r > x0 && x - ax - r < x1 && y + ay + r > y0 && y - ay - r < y1;
  return !L.spikes.some((s) => hit(s.x, s.y, s.r)) && !L.saws.some((s) => hit(s.x, s.y, s.r, s.move.ax, s.move.ay));
}
// 還沒檢查過、而且出口範圍已經全部產生完的加速圈：出口不乾淨就關掉
function markBoosts(L: Level, doneX: number): void {
  for (const b of L.boosts) if (!b.checked && b.x + BOOST_REACH + 3 < doneX) { b.checked = true; if (!boostZoneClear(L, b)) b.off = true; }
}

// 沙丘出口淨空：一整片沙丘從頭往前到最後一個 lip 再往前 DUNE_REACH 內，不能有尖刺、鋸片、蘑菇；不成立就整片關掉
export const DUNE_REACH = 30;
export function duneFieldClear(L: Level, fl: Dune[]): boolean {
  const x0 = fl[0].x0 - 4, x1 = fl[fl.length - 1].x1 + DUNE_REACH;
  const hit = (x: number, r: number, ax = 0) => x + ax + r > x0 && x - ax - r < x1;
  return !L.spikes.some((s) => hit(s.x, s.r)) && !L.saws.some((s) => hit(s.x, s.r, s.move.ax)) && !L.mush.some((m) => hit(m.x, m.r));
}
function markDunes(L: Level, doneX: number): void {
  for (const d of L.dunes) {
    if (!d.lip || d.checked || d.x1 + DUNE_REACH + 3 >= doneX) continue;
    const fl = L.dunes.filter((e) => e.f === d.f), bad = !duneFieldClear(L, fl);
    for (const e of fl) { e.checked = true; if (bad) e.off = true; }
  }
}

// 火山的風扇改成蒸汽噴泉。相位用編號算（不抽亂數，關卡幾何不變）。
const BURST_REACH = 14, BURST_UP = 16;
export function burstZoneClear(L: Level, f: Fan): boolean {
  const x0 = f.x - f.w / 2 - 1.5, x1 = f.x + f.w / 2 + BURST_REACH, y0 = f.y0 + 3, y1 = f.y1 + BURST_UP;
  const hit = (x: number, y: number, r: number, ax = 0, ay = 0) => x + ax + r > x0 && x - ax - r < x1 && y + ay + r > y0 && y - ay - r < y1;
  return !L.spikes.some((s) => hit(s.x, s.y, s.r)) && !L.saws.some((s) => hit(s.x, s.y, s.r, s.move.ax, s.move.ay));
}
// 相位微調（tests/burst-check.mjs 掃出來的）
export const BURST_SHIFT: Record<number, number> = { 49: 1 };
function addBursts(L: Level): void {
  L.fans.forEach((f, i) => {
    if (burstZoneClear(L, f)) f.burst = { P: 4.2 + (i % 3) * 0.4, ph: (L.n * 0.37 + i * 1.7 + (BURST_SHIFT[L.n] ?? 0) * 0.9) % 4.2, dur: 0.9 };
  });
}

const hookOf = (L: Level) => (x: number, y: number, move?: Move) => { L.hooks.push(move ? { x, y, move } : { x, y }); return L.hooks[L.hooks.length - 1]; };
const flyOf = (L: Level, r: () => number) => (x: number, y: number) => L.flies.push({ x, y, ph: r() * 6.28 });
function firstHook(L: Level, g: GenCursor): void { hookOf(L)(g.x, g.y); flyOf(L, g.r)(g.x + 4.5, g.y - 5.5); }

// 一個段落（關卡與無盡模式共用）：g＝產生器游標；n 決定解鎖哪些段落種類，diff 決定間距與危險度
export function addSegment(L: Level, g: GenCursor, n: number, diff: number, plan: PlanEntry | null = null): void {
  const r = g.r, pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const hook = hookOf(L), fly = flyOf(L, r);
  let x = g.x, y = g.y, prevType = g.prevType;
  // 依關卡解鎖段落種類
  const U = UNLOCK, types = ['hook', 'hook'];
  if (n >= U.mush) types.push('mush');
  if (n >= U.ring) types.push('ring');
  if (n >= U.move) types.push('move');
  if (n >= U.spikeLow) types.push('spikeLow');
  if (n >= U.fan) types.push('fan');
  if (n >= U.saw) types.push('saw');
  if (n >= U.spikeHigh) types.push('spikeHigh');
  if (n >= 27) types.push('spikeHigh', 'move'); // 加權：後段多一份
  if (n >= 30) types.push('saw', 'spikeLow');
  if (n >= U.swarm) types.push('swarm');
  if (n >= U.mushChain) types.push('mushChain');
  if (n >= U.ringArc) types.push('ringArc');
  if (n >= U.tunnel) types.push('tunnel');
  // 無盡模式（plan 是 null、n 夠大）才把荷葉、加速圈放進隨機池；61 關以後的正式關卡只放 PLAN 保證的那幾個
  if (!plan && n >= U.pad) types.push('pad');
  if (!plan && n >= U.boost) types.push('boost');
  // 沙丘（76 關起）：正式關卡隨機池裡有；無盡模式只在輪到夕陽沙丘世界的那一段才放
  if (n >= U.dune && !(g.end && g.x > g.end) && (plan || endlessWorld(g.x, 6) === 5)) types.push('dune', 'dune');
  let type = pick(types);
  // 保證段落（PLAN）與加速圈後的緩衝：亂數照樣抽，只換掉結果，所以不影響沒有這些東西的關卡
  if (g.force) { type = g.force; g.force = null; }
  else if (g.calm && g.calm > 0) { g.calm--; if (type !== 'hook') type = 'hook'; }
  // 節奏關（只有 61 關以後會帶 plan，前 60 關與無盡模式不經過這兩行，亂數序列不變）
  if (plan?.teach && HAZARD.has(type)) type = 'hook';
  else if (plan?.calm && HAZARD.has(type) && r() < 0.5) type = 'hook';
  if (type === prevType && type !== 'hook') type = 'hook';
  prevType = type;

  const dx = 8 + r() * 2.2 + diff * 2.6;
  const ny = clamp(y + (r() - 0.5) * (2 + diff * 5), 10.5, 16);

  if (type === 'hook') {
    x += dx; y = ny; hook(x, y);
    if (r() < 0.55) fly(x - dx * 0.5, y - 4 - r() * 3);
  } else if (type === 'move') {
    x += dx + 1; y = ny;
    const horiz = r() < 0.5;
    const amp = 1.6 + diff * 1.6;
    hook(x, y, { ax: horiz ? amp : 0, ay: horiz ? 0 : amp, f: 0.9 + diff * 0.9, ph: r() * 6.28 });
    fly(x, y - 6);
  } else if (type === 'mush') {
    // 寬一點的間隔，中間放一朵彈跳蘑菇接住下墜
    const gap = 14 + r() * 2 + diff * 2;
    const mx = x + gap * 0.5;
    L.mush.push({ x: mx, y: 1.6 + r() * 1.2, r: 1.9 });
    fly(mx, 7.5 + r() * 2);
    x += gap; y = ny; hook(x, y);
  } else if (type === 'ring') {
    x += dx + 1.5; const ry = Math.max(y, ny) + 3.2 + r() * 1.5;
    L.rings.push({ x: x - (dx + 1.5) * 0.5, y: ry });
    y = ny; hook(x, y);
  } else if (type === 'spikeLow') {
    x += dx; y = ny; hook(x, y);
    const sy = 1.6 + diff * 2.6;
    L.spikes.push({ x: x - dx * 0.5, y: sy, r: 0.95, pole: true });
    fly(x - dx * 0.5, sy + 4.5);
  } else if (type === 'spikeHigh') {
    x += dx; y = ny; hook(x, y);
    L.spikes.push({ x: x - dx * 0.5, y: y + 6.5 - diff * 1.2, r: 0.95, hang: true });
  } else if (type === 'fan') {
    // 間隔大到盪不過去，中間的風扇往上吹
    const gap = 16 + r() * 2 + diff * 3;
    const fx = x + gap * 0.5;
    L.fans.push({ x: fx, y0: 0.4, y1: 12 + r() * 2, w: 3.2 });
    fly(fx, 14.5);
    x += gap; y = ny; hook(x, y);
  } else if (type === 'swarm') {
    // 一串蒼蠅沿著擺盪弧線排開：想拿蒼蠅星就要盪低一點
    x += dx; y = ny; hook(x, y);
    for (let k = 0; k < 3; k++) fly(x - dx * (0.75 - k * 0.25), y - 6.2 + Math.abs(k - 1) * 1.4);
  } else if (type === 'mushChain') {
    // 連續蘑菇彈跳：BOING BOING BOING
    const cnt = 2 + (r() < 0.4 + diff * 0.4 ? 1 : 0);
    const hop = (2 * TUNE.MUSH_VX * TUNE.MUSH_VY) / TUNE.GRAVITY; // 一跳的水平距離
    let mx = x + 7;
    for (let k = 0; k < cnt; k++) { L.mush.push({ x: mx, y: 2, r: 1.9 }); fly(mx + hop * 0.5, 2 + 1.9 + TUNE.MUSH_VY ** 2 / (2 * TUNE.GRAVITY)); mx += hop; }
    mx -= hop;
    x = mx + 2; y = ny; hook(x, y);
  } else if (type === 'ringArc') {
    // 兩個往上排的圈圈：甩高一點就連穿
    x += dx + 3; const top = Math.max(y, ny);
    L.rings.push({ x: x - (dx + 3) * 0.62, y: top + 2.6 }, { x: x - (dx + 3) * 0.3, y: top + 4.6 });
    y = ny; hook(x, y);
  } else if (type === 'tunnel') {
    // 上下夾擊：盪太低或飛太高都會刺到
    x += dx + 0.5; y = ny; hook(x, y);
    const mx = x - (dx + 0.5) * 0.5;
    L.spikes.push({ x: mx, y: 2.6 + diff * 1.4, r: 0.95, pole: true }, { x: mx, y: y + 5.6, r: 0.95, hang: true });
    fly(mx, y - 1.5);
  } else if (type === 'pad') {
    // 中途荷葉：兩根鉤點之間拉寬，中間水面上放一片荷葉。落在荷葉上＝存檔
    const gap = 13 + r() * 2 + diff * 2;
    const px = x + gap * 0.5;
    L.pads.push({ x: px, y: 1.3, w: 7 });
    fly(px, 5 + r() * 2);
    x += gap; y = clamp(ny, 10.5, 13); hook(x, y);
  } else if (type === 'boost') {
    // 加速圈：放在兩根鉤點中間、擺盪弧線上，箭頭指向下一根鉤點；後面兩段只放普通鉤點
    const y0 = y;
    x += dx; y = ny; hook(x, y);
    const bx = x - dx * 0.55, by = Math.max(5, y0 - 7.5);
    const ex = x - bx, ey = y - by, el = Math.hypot(ex, ey);
    L.boosts.push({ x: bx, y: by, dx: ex / el, dy: ey / el });
    fly(bx + 1, by + 2);
    g.calm = 2;
  } else if (type === 'dune') {
    // 沙丘：跨三個鉤點間隔的一整片沙，幾座圓潤的凸起接一座尾端上翹的坡頂（lip）。沙丘只是安全網／捷徑
    const gs = [0, 1, 2].map(() => 11.5 + r() * 1.8 + diff * 1.0 + (plan?.long ? 0.8 : 0)), gap = gs[0] + gs[1] + gs[2];
    const mid = [gs[0], gs[0] + gs[1]].map((ddx) => ({ dx: ddx, y: clamp(y + (r() - 0.5) * (2 + diff * 5), 10.5, 16) }));
    const x0 = x + 2.8, x1 = x + gap - (plan?.grab ? 5.6 : 3.0), H2 = plan?.tall ? 4.3 : 3.0 + r() * 0.7, wl = plan?.tall ? 6.2 : 5.6;
    const R = x1 - wl - x0, nb = Math.max(1, Math.round(R / 8)), wb = R / nb;
    const f = L.dunes.length ? L.dunes[L.dunes.length - 1].f + 1 : 0;
    for (let k = 0; k < nb; k++) {
      const H1 = 1.8 + r() * 1.6, bx = x0 + wb * k;
      L.dunes.push({ x0: bx, x1: bx + wb, H: H1, f, first: k === 0 });
      fly(bx + wb * 0.5, H1 + 2.2);
    }
    L.dunes.push({ x0: x1 - wl, x1, H: H2, lip: true, f });
    fly(x1 - 0.8, H2 + 2.6);
    // 拾取物軌跡（金圈，最多 8 個）：放手 → 落在沙丘起點 → 沿沙面 → 從 lip 拋起的弧線。trail＝片區編號、k＝順序
    {
      const fl = L.dunes.filter((e) => e.f === f), hAt = (xx: number) => { for (const e of fl) if (xx >= e.x0 && xx <= e.x1) return duneH(e, xx); return 0; };
      const lipX0 = x1 - wl, nAlong = Math.min(5, Math.max(2, Math.floor((lipX0 - x0 - 3) / 5) + 1));
      let k = 0; const ring = (rx: number, ry: number) => L.rings.push({ x: rx, y: ry, trail: f, k: k++ });
      ring(x0 - 0.5, 4.6);
      for (let i = 0; i < nAlong; i++) { const rx = x0 + 3 + (lipX0 - x0 - 3) * (i + 0.5) / nAlong; ring(rx, hAt(rx) + 1.25); }
      ring(x1 - 1.2, hAt(x1 - 1.2) + 1.5);
      ring(x1 + 3.6, hAt(x1) + 2.2);
    }
    for (const m of mid) hook(x + m.dx, m.y);
    x += gap; y = ny; hook(x, y);
    g.calm = 3;
  } else if (type === 'saw') {
    x += dx + 0.5; y = ny; hook(x, y);
    const sx = x - (dx + 0.5) * 0.5;
    const vert = r() < 0.6;
    L.saws.push(vert
      ? { x: sx, y: 8.5, r: 1.25, move: { ax: 0, ay: 4.5, f: 0.8 + diff * 0.9, ph: r() * 6.28 } }
      : { x: sx, y: y + 5, r: 1.25, move: { ax: 2.5, ay: 0, f: 1 + diff, ph: r() * 6.28 } });
  }
  g.x = x; g.y = y; g.prevType = prevType;
}

// ---------- 無盡模式 ----------
// 同一個段落產生器無限往後接：難度隨距離上升（上限＝第 60 關的難度），每 ENDLESS_WORLD_LEN 換一個世界。
export const ENDLESS_WORLD_LEN = 450;
// 輪替幾個世界：預設前四個；打過第 60 關之後傳 5、打過第 75 關傳 6
export const endlessWorld = (x: number, count = 4) => Math.floor(Math.max(0, x) / ENDLESS_WORLD_LEN) % count;
export const endlessDiff = (x: number) => clamp(0.12 + x / 2600, 0, 1);
// cap＝玩家主線打過的關數（至少 60，最多 LEVEL_COUNT）：沒在主線學過的元素不會先在無盡模式出現
export const endlessUnlockN = (x: number, cap = 60) => clamp(Math.floor(3 + x / 22), 3, cap);
export function createEndless(seed: number, cap = 60): Level {
  const L: Level = {
    ...emptyLevel(0, 0, 0), endless: true, seed, cap,
    goal: { x: 1e6, y: -100, w: 1, wall: 1e6 + 6 }, // 沒有終點：放在碰不到的地方
    gen: { r: mulberry32(seed * 2654435761 + 7), x: 7, y: 11, prevType: 'hook' },
  };
  firstHook(L, L.gen!);
  extendEndless(L, 160);
  return L;
}
// 產生到 untilX 為止；回傳有沒有新增段落
export function extendEndless(L: Level, untilX: number): boolean {
  const g = L.gen!, x0 = g.x;
  while (g.x < untilX) addSegment(L, g, endlessUnlockN(g.x, L.cap), endlessDiff(g.x));
  markBoosts(L, g.x);
  markDunes(L, g.x);
  L.length = g.x;
  return g.x > x0;
}

// 75 關程序產生（種子固定）：同一關每次長一樣。難度＝全域進度 + 世界內進度。
import { TUNE } from './config.js';

export const LEVEL_COUNT = 75;
export const worldOf = (n) => Math.min(7, Math.floor((n - 1) / 15));
export const levelLabel = (n) => `${worldOf(n) + 1}-${((n - 1) % 15) + 1}`;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 基本元素的解鎖關卡（第一次可能出現的關）；開場「NEW」字卡就看這張表。風扇、鋸片、高處尖刺、上下夾擊往後挪（MECHANICS §16）
export const UNLOCK = { mush: 3, swarm: 4, ring: 5, move: 6, spikeLow: 8, mushChain: 9, ringArc: 12, fan: 18, saw: 22, spikeHigh: 25, tunnel: 33 };
// NEW 字卡出現的關卡＝元素「實際第一次出現」的關（tests/unlock-check.mjs 掃 generateLevel 驗證）。
// 跟 UNLOCK 不同的兩個（move 6→7、spikeLow 8→9）是解鎖那關剛好沒骰到，不改種子（前 10 關要保持不變）
export const NEW_AT = { ...UNLOCK, move: 7, spikeLow: 9 };
// 這一關要顯示 NEW 字卡的元素 id 清單（沒有＝[]）
export const newElements = (n) => Object.keys(NEW_AT).filter((k) => NEW_AT[k] === n);

// 61 關以後每個世界內第幾關的節奏（MECHANICS §12）：teach＝招牌教學關（原本給冰舌的位置：diff 0.1、不放危險物），calm＝喘息（diff −0.1、危險段落機率減半）。
// 冰舌、荷葉、加速圈這一階段都不做，所以沒有 NEW 標籤，只套節奏。
const PLAN = { 1: { teach: true }, 2: { calm: true }, 4: { calm: true }, 6: { calm: true }, 8: { calm: true }, 11: { calm: true }, 14: { calm: true } };
const HAZARD = new Set(['spikeLow', 'spikeHigh', 'fan', 'saw', 'tunnel']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 部分關卡換種子（tests/sim-check.mjs 的自動玩家破不了或太難的）
export const SALT = { 12: 7, 19: 3, 31: 11, 50: 14, 20: 1, 23: 1, 25: 2, 26: 1, 29: 1, 32: 1, 33: 1, 37: 2, 38: 3, 41: 1, 42: 4, 43: 1, 44: 1, 46: 5, 51: 1, 54: 3, 56: 1, 58: 1, 60: 3, 61: 2, 62: 1, 65: 5, 66: 1, 67: 1, 68: 1, 69: 6, 70: 3, 71: 1, 74: 12 };

export function generateLevel(n, salt = SALT[n] ?? 0) {
  const r = mulberry32(n * 7919 + 1013 + salt * 100003);
  const local = ((n - 1) % 15) / 14;
  // 前 60 關寫死 /59（LEVEL_COUNT 變動不能讓它們重新產生）；61 關以後每個世界從 0.45 爬到 0.85（MECHANICS §9.1）
  let diff = n <= 60 ? clamp(((n - 1) / 59) * 0.75 + local * 0.3, 0, 1) : 0.45 + local * 0.4;
  const plan = n > 60 ? PLAN[(n - 1) % 15 + 1] : null;
  if (plan?.teach) diff = 0.1;
  else if (plan?.calm) diff = Math.max(0.1, diff - 0.1);
  const L = {
    n, world: worldOf(n), diff,
    start: { x: 0, y: 3 },
    hooks: [], mush: [], spikes: [], saws: [], fans: [], rings: [], flies: [],
    goal: null, length: 0, par: 0,
  };
  const g = { r, x: 7, y: 11, prevType: 'hook' };
  firstHook(L, g);
  const targetLen = n === 1 ? 46 : 52 + Math.min(n, 60) * 3.4;
  while (g.x < targetLen) addSegment(L, g, n, diff, plan);
  const x = g.x;

  const gx = x + 12;
  L.goal = { x: gx, y: 1.3, w: 12, wall: gx + 6.2 }; // 荷葉後面有一面大葉子牆把飛過頭的青蛙擋回來
  flyOf(L, r)(gx - 4, 6);
  L.length = gx;
  L.par = Math.round(L.length / TUNE.PAR_SPEED + 3);
  if (L.world === 3) addBursts(L);
  return L;
}

// 火山的風扇改成蒸汽噴泉。相位用編號算（不抽亂數，關卡幾何不變）。
// 保證：噴發會把人推上去的範圍（fan 旁到前方 BURST_REACH、y0+3 到 y1+BURST_UP）內沒有任何尖刺／鋸片（含鋸片的移動範圍），否則那座維持普通風扇。
const BURST_REACH = 14, BURST_UP = 16;
export function burstZoneClear(L, f) {
  const x0 = f.x - f.w / 2 - 1.5, x1 = f.x + f.w / 2 + BURST_REACH, y0 = f.y0 + 3, y1 = f.y1 + BURST_UP;
  const hit = (x, y, r, ax = 0, ay = 0) => x + ax + r > x0 && x - ax - r < x1 && y + ay + r > y0 && y - ay - r < y1;
  return !L.spikes.some((s) => hit(s.x, s.y, s.r)) && !L.saws.some((s) => hit(s.x, s.y, s.r, s.move.ax, s.move.ay));
}
// 相位微調（tests/burst-check.mjs 的「推過後 1.5 秒內死亡＝0」對某些關的相位很敏感，像 SALT 一樣掃出來）
export const BURST_SHIFT = { 49: 1 };
function addBursts(L) {
  L.fans.forEach((f, i) => {
    if (burstZoneClear(L, f)) f.burst = { P: 4.2 + (i % 3) * 0.4, ph: (L.n * 0.37 + i * 1.7 + (BURST_SHIFT[L.n] ?? 0) * 0.9) % 4.2, dur: 0.9 };
  });
}

const hookOf = (L) => (x, y, move) => { L.hooks.push({ x, y, move }); return L.hooks[L.hooks.length - 1]; };
const flyOf = (L, r) => (x, y) => L.flies.push({ x, y, ph: r() * 6.28 });
function firstHook(L, g) { hookOf(L)(g.x, g.y); flyOf(L, g.r)(g.x + 4.5, g.y - 5.5); }

// 一個段落（關卡與無盡模式共用）：g＝{ r, x, y, prevType } 產生器游標；n 決定解鎖哪些段落種類，diff 決定間距與危險度
export function addSegment(L, g, n, diff, plan = null) {
  const r = g.r, pick = (arr) => arr[Math.floor(r() * arr.length)];
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
  let type = pick(types);
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
// 同一個段落產生器無限往後接：難度隨距離上升（上限＝第 60 關的難度，sim-check 驗過的範圍內），每 ENDLESS_WORLD_LEN 換一個世界。
export const ENDLESS_WORLD_LEN = 450;
// 輪替幾個世界：預設前四個；打過第 60 關（解鎖了冰峰）之後 main.js 傳 5（MECHANICS §15）
export const endlessWorld = (x, count = 4) => Math.floor(Math.max(0, x) / ENDLESS_WORLD_LEN) % count;
export const endlessDiff = (x) => clamp(0.12 + x / 2600, 0, 1);
export const endlessUnlockN = (x) => clamp(Math.floor(3 + x / 22), 3, 60);
export function createEndless(seed) {
  const L = {
    n: 0, endless: true, seed, world: 0, diff: 0,
    start: { x: 0, y: 3 },
    hooks: [], mush: [], spikes: [], saws: [], fans: [], rings: [], flies: [],
    goal: { x: 1e6, y: -100, w: 1, wall: 1e6 + 6 }, // 沒有終點：放在碰不到的地方，sim 的落地／後牆判定永遠不成立
    length: 0, par: 0,
    gen: { r: mulberry32(seed * 2654435761 + 7), x: 7, y: 11, prevType: 'hook' },
  };
  firstHook(L, L.gen);
  extendEndless(L, 160);
  return L;
}
// 產生到 untilX 為止；回傳有沒有新增段落
export function extendEndless(L, untilX) {
  const g = L.gen, x0 = g.x;
  while (g.x < untilX) addSegment(L, g, endlessUnlockN(g.x), endlessDiff(g.x));
  L.length = g.x;
  return g.x > x0;
}

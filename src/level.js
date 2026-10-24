// 60 關程序產生（種子固定）：同一關每次長一樣。難度＝全域進度 + 世界內進度。
import { TUNE } from './config.js';

export const LEVEL_COUNT = 60;
export const worldOf = (n) => Math.min(3, Math.floor((n - 1) / 15));
export const levelLabel = (n) => `${worldOf(n) + 1}-${((n - 1) % 15) + 1}`;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 部分關卡換種子（tests/sim-check.mjs 的自動玩家破不了或太難的）
export const SALT = { 20: 1, 26: 1, 44: 1, 50: 1, 57: 1 };

export function generateLevel(n, salt = SALT[n] ?? 0) {
  const r = mulberry32(n * 7919 + 1013 + salt * 100003);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const local = ((n - 1) % 15) / 14;
  const diff = clamp(((n - 1) / (LEVEL_COUNT - 1)) * 0.75 + local * 0.3, 0, 1);
  const L = {
    n, world: worldOf(n), diff,
    start: { x: 0, y: 3 },
    hooks: [], mush: [], spikes: [], saws: [], fans: [], rings: [], flies: [],
    goal: null, length: 0, par: 0,
  };
  const hook = (x, y, move) => { L.hooks.push({ x, y, move }); return L.hooks[L.hooks.length - 1]; };
  const fly = (x, y) => L.flies.push({ x, y, ph: r() * 6.28 });

  const targetLen = n === 1 ? 46 : 52 + n * 3.4;
  let x = 7, y = 11;
  hook(x, y);
  fly(x + 4.5, y - 5.5);
  let prevType = 'hook';

  while (x < targetLen) {
    // 依關卡解鎖段落種類
    const types = ['hook', 'hook'];
    if (n >= 3) types.push('mush');
    if (n >= 5) types.push('ring');
    if (n >= 6) types.push('move');
    if (n >= 8) types.push('spikeLow');
    if (n >= 11) types.push('fan');
    if (n >= 14) types.push('saw');
    if (n >= 20) types.push('spikeHigh', 'move');
    if (n >= 26) types.push('saw', 'spikeLow');
    if (n >= 4) types.push('swarm');
    if (n >= 9) types.push('mushChain');
    if (n >= 12) types.push('ringArc');
    if (n >= 24) types.push('tunnel');
    let type = pick(types);
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
  }

  const gx = x + 12;
  L.goal = { x: gx, y: 1.3, w: 12, wall: gx + 6.2 }; // 荷葉後面有一面大葉子牆把飛過頭的青蛙擋回來
  fly(gx - 4, 6);
  L.length = gx;
  L.par = Math.round(L.length / TUNE.PAR_SPEED + 3);
  return L;
}

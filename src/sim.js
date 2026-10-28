// 純物理模擬（不依賴 three，可在 Node 跑自動玩家驗證關卡）。
// 青蛙是質點；黏住鉤點時是「只拉不推」的繩子（距離 > L 才約束）。事件推進 s.events，由呼叫端每幀清空。
import { TUNE as T } from './config.js';

const TAU = Math.PI * 2;
const tmp = { x: 0, y: 0 };

export function movePos(o, t, out) {
  if (o.move) {
    const k = Math.sin(t * o.move.f + o.move.ph);
    out.x = o.x + o.move.ax * k; out.y = o.y + o.move.ay * k;
  } else { out.x = o.x; out.y = o.y; }
  return out;
}
export function flyPos(f, t, out) {
  out.x = f.x + Math.sin(t * 3.1 + f.ph) * 0.7;
  out.y = f.y + Math.sin(t * 4.7 + f.ph * 1.3) * 0.45;
  return out;
}

// 蒸汽噴泉（火山）：fan.burst = { P 週期, ph 相位, dur 噴發長度 }；噴發中推力 ×2（只多不少），噴發前 BURST_WARN 秒是預兆（純視覺）
export const BURST_WARN = 0.6;
const burstPhase = (b, t) => (((t - b.ph) % b.P) + b.P) % b.P;
export const burstOn = (b, t) => burstPhase(b, t) < b.dur;
export const burstWarn = (b, t) => burstPhase(b, t) > b.P - BURST_WARN;

// 沙丘（夕陽沙丘世界）：lv.dunes = [{ x0, x1, H, lip }]。一般沙丘＝cosine 凸起（兩端 0、中間 H）；lip＝尾端上翹坡頂（四分之一 cosine 一路翹到 x1，之後垂直落到 0）。
// 相鄰沙丘首尾相接；off＝出口淨空不成立（level.js markDunes），整片當作沒有。
// 片區左緣（d.first）有 DUNE_APRON 長的緩坡從 0 升到 DUNE_BASE；lip 後面有 DUNE_BACK 長的背坡從坡頂圓滑降到 0（沒有垂直切面）。
export const duneStart = (d) => (d.first ? d.x0 - T.DUNE_APRON : d.x0);
export const duneEnd = (d) => (d.lip ? d.x1 + T.DUNE_BACK : d.x1);
export function duneH(d, x) {
  if (d.first && x < d.x0) { if (x < d.x0 - T.DUNE_APRON) return 0; return T.DUNE_BASE * 0.5 * (1 - Math.cos(Math.PI * (x - d.x0 + T.DUNE_APRON) / T.DUNE_APRON)); }
  if (d.lip && x > d.x1) { if (x > d.x1 + T.DUNE_BACK) return 0; return (T.DUNE_BASE + d.H) * 0.5 * (1 + Math.cos(Math.PI * (x - d.x1) / T.DUNE_BACK)); }
  if (x < d.x0 || x > d.x1) return 0;
  const u = (x - d.x0) / (d.x1 - d.x0);
  return T.DUNE_BASE + (d.lip ? d.H * (1 - Math.cos(u * Math.PI * 0.5)) : d.H * 0.5 * (1 - Math.cos(u * TAU)));
}
export function duneSlope(d, x) {
  if (d.first && x < d.x0) { if (x < d.x0 - T.DUNE_APRON) return 0; return T.DUNE_BASE * 0.5 * Math.PI / T.DUNE_APRON * Math.sin(Math.PI * (x - d.x0 + T.DUNE_APRON) / T.DUNE_APRON); }
  if (d.lip && x > d.x1) { if (x > d.x1 + T.DUNE_BACK) return 0; return -(T.DUNE_BASE + d.H) * 0.5 * Math.PI / T.DUNE_BACK * Math.sin(Math.PI * (x - d.x1) / T.DUNE_BACK); }
  if (x < d.x0 || x > d.x1) return 0;
  const w = d.x1 - d.x0, u = (x - d.x0) / w;
  return d.lip ? d.H * Math.PI * 0.5 / w * Math.sin(u * Math.PI * 0.5) : d.H * Math.PI / w * Math.sin(u * TAU);
}
export function duneAt(lv, x) {
  const ds = lv.dunes;
  if (ds) for (let i = 0; i < ds.length; i++) { const d = ds[i]; if (!d.off && x >= duneStart(d) && x <= duneEnd(d)) return i; }
  return -1;
}

// from＝荷葉存檔（main.js 在荷葉落地時存下的快照 { pad, flies, rings, boostUsed, fliesGot, time }）：從那座荷葉重生，已吃的蒼蠅、圈圈、加速圈照快照
export function createSim(level, from = null) {
  const s = {
    level, t: 0, time: 0, started: false,
    x: level.start.x, y: level.start.y + T.FROG_R, vx: 0, vy: 0,
    angle: 0, omega: 0,
    mode: 'perch', crouch: 0,
    prevHold: false, hold: false,
    target: -1,
    tongue: { state: 'idle', hook: -1, tip: 0, rest: 0, dx: 1, dy: 0, tx: 0, ty: 0, L: 0, ax: 0, ay: 0 },
    airRot: 0, airFlips: 0, airTime: 0,
    flies: level.flies.map(() => false), rings: level.rings.map(() => false),
    fliesGot: 0, attaches: 0, flipsTotal: 0, bounces: 0, maxX: level.start.x,
    fanIn: -1, cause: null, near: [], nearMin: [], // 一般陣列：無盡模式會一直往關卡尾端加危險物
    onDune: -1, duneT: -99, backT: -99, checkpoint: -1, boostUsed: (level.boosts ?? []).map(() => false), boosts: 0, boostT: -99,
    events: [],
  };
  if (from) {
    const p = level.pads[from.pad];
    s.x = p.x; s.y = p.y + T.FROG_R; s.maxX = p.x; s.started = true; s.checkpoint = from.pad;
    s.flies = from.flies.slice(); s.rings = from.rings.slice(); s.boostUsed = from.boostUsed.slice();
    s.fliesGot = from.fliesGot; s.time = from.time;
  }
  return s;
}

// 荷葉存檔快照（main.js 在 'pad' 事件時存，tests/pad-check.mjs 也用）：createSim(level, snapshot) 從那座荷葉重生
export const padSnapshot = (s) => ({ pad: s.checkpoint, flies: s.flies.slice(), rings: s.rings.slice(), boostUsed: s.boostUsed.slice(), fliesGot: s.fliesGot, time: s.time });

function pickTarget(s) {
  const hooks = s.level.hooks;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < hooks.length; i++) {
    movePos(hooks[i], s.t, tmp);
    const dx = tmp.x - s.x, dy = tmp.y - s.y;
    if (dx < -10 || dx > T.TONGUE_RANGE) continue;
    const d = Math.hypot(dx, dy);
    if (d > T.TONGUE_RANGE) continue;
    const score = d + (dx < -1 ? 8 : 0) + (dy < -1 ? 4 : 0) - Math.min(Math.max(dx, 0), 6) * 0.4;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  s.target = best;
}

function shoot(s) {
  const tg = s.tongue;
  if (tg.state === 'stuck') return;
  pickTarget(s);
  tg.tip = 0;
  if (s.target < 0) {
    tg.state = 'miss'; tg.dx = s.vx >= 0 ? 0.7 : -0.7; tg.dy = 0.7;
    s.events.push({ type: 'miss' });
    return;
  }
  tg.state = 'shoot'; tg.hook = s.target;
  s.events.push({ type: 'shoot', hook: s.target });
}

function detach(s) {
  const tg = s.tongue;
  const rx = s.x - tg.ax, ry = s.y - tg.ay;
  const w = (rx * s.vy - ry * s.vx) / Math.max(1, rx * rx + ry * ry); // 擺盪角速度（逆時針為正）
  s.vx *= T.RELEASE_BOOST; s.vy *= T.RELEASE_BOOST;
  if (s.vy > 0) s.vy += T.RELEASE_UP;
  const sp = Math.hypot(s.vx, s.vy);
  s.omega = Math.sign(w || 1) * Math.min(T.SPIN_MAX, sp * T.SPIN_PER_SPEED);
  tg.state = 'retract'; tg.tip = Math.hypot(rx, ry);
  tg.dx = -rx / (tg.tip || 1); tg.dy = -ry / (tg.tip || 1);
  s.mode = 'air'; s.airRot = 0; s.airFlips = 0; s.airTime = 0;
  s.events.push({ type: 'release', speed: sp, hook: tg.hook });
}

function die(s, cause) {
  if (s.mode === 'dead' || s.mode === 'won') return;
  s.mode = 'dead'; s.cause = cause;
  s.tongue.state = 'idle';
  s.events.push({ type: 'die', cause, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
}

export function step(s, dt, hold) {
  s.t += dt;
  if (s.mode === 'dead' || s.mode === 'won') return;
  if (s.started) s.time += dt;
  const lv = s.level, tg = s.tongue;

  if (hold && !s.prevHold) {
    if (s.mode === 'perch') {
      if (s.crouch <= 0) { s.crouch = T.JUMP_DELAY; s.started = true; s.events.push({ type: 'crouch' }); }
    } else shoot(s);
  }
  if (!hold && s.prevHold) {
    if (tg.state === 'stuck') detach(s);
    else if (tg.state === 'shoot') { tg.state = 'retract'; }
  }
  s.prevHold = hold; s.hold = hold;

  if (s.mode === 'perch') {
    pickTarget(s);
    if (s.crouch > 0) {
      s.crouch -= dt;
      if (s.crouch <= 0) {
        s.mode = 'air'; s.vx = T.JUMP_V[0]; s.vy = T.JUMP_V[1];
        s.events.push({ type: 'jump' });
        if (hold) shoot(s);
      }
    }
    return;
  }

  // 舌頭
  if (tg.state === 'shoot') {
    movePos(lv.hooks[tg.hook], s.t, tmp);
    const dx = tmp.x - s.x, dy = tmp.y - s.y, d = Math.hypot(dx, dy);
    tg.tip += T.TONGUE_SPEED * dt;
    tg.dx = dx / d; tg.dy = dy / d;
    if (d > T.TONGUE_RANGE * 1.25) tg.state = 'retract';
    else if (tg.tip >= d) {
      tg.state = 'stuck'; tg.L = Math.min(T.ROPE_MAX, Math.max(T.ROPE_MIN, d)); tg.rest = Math.min(tg.L, T.ROPE_REST); tg.ax = tmp.x; tg.ay = tmp.y;
      s.mode = 'swing'; s.attaches++;
      s.events.push({ type: 'attach', hook: tg.hook, x: tmp.x, y: tmp.y, speed: Math.hypot(s.vx, s.vy), flips: s.airFlips, fy: s.y, fvy: s.vy });
      s.airFlips = 0; s.airRot = 0;
    }
  } else if (tg.state === 'retract') {
    tg.tip -= T.TONGUE_SPEED * 1.4 * dt;
    if (tg.tip <= 0) { tg.tip = 0; tg.state = 'idle'; }
  } else if (tg.state === 'miss') {
    tg.tip += 40 * dt;
    if (tg.tip > 3.2) tg.state = 'retract';
  }
  if (tg.state !== 'stuck' && tg.state !== 'shoot') pickTarget(s);

  // 力
  s.vy -= T.GRAVITY * dt;
  let inFan = -1;
  for (let i = 0; i < lv.fans.length; i++) {
    const f = lv.fans[i];
    if (Math.abs(s.x - f.x) < f.w * 0.5 && s.y > f.y0 && s.y < f.y1) {
      const k = 1.25 - 0.55 * (s.y - f.y0) / (f.y1 - f.y0);
      s.vy += T.FAN_ACC * k * (f.burst && burstOn(f.burst, s.t) ? 2 : 1) * dt; inFan = i;
    }
  }
  if (inFan >= 0 && s.fanIn !== inFan) s.events.push({ type: 'fan', i: inFan });
  s.fanIn = inFan;

  if (tg.state === 'stuck') {
    movePos(lv.hooks[tg.hook], s.t, tmp);
    tg.ax = tmp.x; tg.ay = tmp.y;
    const rx = s.x - tg.ax, ry = s.y - tg.ay, d = Math.hypot(rx, ry) || 1;
    const nx = rx / d, ny = ry / d, tx = -ny, ty = nx;
    let vt = s.vx * tx + s.vy * ty;
    const taut = d > tg.L - 0.05;
    if (tg.L > tg.rest) tg.L = Math.max(tg.rest, tg.L - T.ELASTIC_RATE * dt);
    else if (hold && taut && tg.L > T.ROPE_MIN) {
      const nL = Math.max(T.ROPE_MIN, tg.L - T.PUMP_RATE * dt);
      const k = tg.L / nL; // 角動量守恆：收短 → 轉更快
      s.vx += tx * vt * (k - 1); s.vy += ty * vt * (k - 1); vt *= k;
      tg.L = nL;
    }
    if (taut && ny < 0.2 && Math.abs(vt) > 0.5) {
      const a = Math.sign(vt) * T.SWING_ASSIST * dt;
      s.vx += tx * a; s.vy += ty * a;
    }
  }

  const drag = 1 - T.AIR_DRAG * dt;
  s.vx *= drag; s.vy *= drag;
  const sp = Math.hypot(s.vx, s.vy);
  if (sp > T.MAX_SPEED) { s.vx *= T.MAX_SPEED / sp; s.vy *= T.MAX_SPEED / sp; }
  s.x += s.vx * dt; s.y += s.vy * dt;

  if (tg.state === 'stuck') {
    const rx = s.x - tg.ax, ry = s.y - tg.ay, d = Math.hypot(rx, ry);
    if (d > tg.L) {
      const nx = rx / d, ny = ry / d;
      s.x = tg.ax + nx * tg.L; s.y = tg.ay + ny * tg.L;
      const vr = s.vx * nx + s.vy * ny;
      if (vr > 0) { s.vx -= vr * nx; s.vy -= vr * ny; }
    }
    // 頭朝鉤點
    const ta = Math.atan2(-(tg.ax - s.x), tg.ay - s.y);
    let da = ta - s.angle; da -= Math.round(da / TAU) * TAU;
    s.angle += da * (1 - Math.exp(-dt * 22));
  } else {
    s.angle += s.omega * dt;
    s.airRot += s.omega * dt;
    s.omega *= 1 - T.SPIN_DAMP * dt;
    s.airTime += dt;
    while (Math.abs(s.airRot) >= (s.airFlips + 1) * TAU - T.FLIP_TOLERANCE) {
      s.airFlips++; s.flipsTotal++;
      s.events.push({ type: 'flip', n: s.airFlips, x: s.x, y: s.y });
    }
  }
  if (s.x > s.maxX) s.maxX = s.x;

  const R = T.FROG_R;
  for (let i = 0; i < lv.mush.length; i++) {
    const m = lv.mush[i];
    const dx = s.x - m.x, dy = s.y - m.y, rr = m.r + R;
    if (dx * dx + dy * dy < rr * rr) {
      const d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const vn = s.vx * nx + s.vy * ny;
      if (vn < 0) {
        const out = Math.max(T.MUSH_MIN_BOUNCE, -vn * T.MUSH_REST);
        if (ny > 0.25) {
          // 從上面踩到＝彈跳床：固定的往前上方彈出，可預測（玩家要練的是「落在蘑菇上」，不是賭彈多遠）
          s.vx = (s.vx >= -0.5 ? 1 : -1) * T.MUSH_VX; s.vy = T.MUSH_VY;
        } else {
          s.vx -= vn * nx; s.vy -= vn * ny;
          s.vx += nx * out; s.vy += ny * out;
        }
        s.omega += (s.vx >= 0 ? -1 : 1) * 3;
        s.bounces++;
        s.events.push({ type: 'bounce', i, speed: out, x: m.x, y: m.y + m.r });
      }
      s.x = m.x + nx * rr; s.y = m.y + ny * rr;
    }
  }
  // 沙丘：只在 lv.dunes 存在時執行（第 1–75 關沒有，軌跡逐位元不變）。把位置推回沙面、去掉朝內的法向速度；模式維持 air，所以滑行中照常能出舌。
  // 空中（舌頭沒黏住）貼著沙面時，沿坡面往前的速度至少 DUNE_FLOOR（lip 上 DUNE_LIP_FLOOR）：不會卡在谷底、尾端把青蛙往前上方拋出去。
  if (lv.dunes?.length) {
    const di = duneAt(lv, s.x), prev = s.onDune;
    let touch = -1;
    if (di >= 0) {
      const d = lv.dunes[di], h = duneH(d, s.x), gap = s.y - R - h;
      // 貼地：上一步貼著沙面、離沙面不到 DUNE_SNAP、而且沒有明顯往上離開（沿法向 < 14）時，繼續貼著（凸起的坡頂不會把青蛙彈成一跳一跳）；lip 與背坡不貼（lip 要把青蛙拋出去）
      let snap = false;
      if (gap >= 0 && gap < T.DUNE_SNAP && prev >= 0 && !d.lip && tg.state !== 'stuck') { const k = duneSlope(d, s.x); snap = (s.vy - s.vx * k) / Math.hypot(1, k) < 14; }
      if (gap < 0 || snap) {
        touch = di;
        const sl = duneSlope(d, s.x), inv = 1 / Math.hypot(1, sl), nx = -sl * inv, ny = inv;
        const impact = -(s.vx * nx + s.vy * ny);
        s.y = h + R;
        const vn = s.vx * nx + s.vy * ny;
        if (vn < 0) { s.vx -= vn * nx; s.vy -= vn * ny; }
        // 速度下限連舌頭黏住（擺盪）時也算：鉤點下方的弧線掃到沙面時，沙面把青蛙順著坡往前送，不會卡在坡上晃
        const inBack = d.lip && s.x > d.x1;
        if (inBack) { // 背坡：落在 lip 後面的青蛙也往前上方拋出去（不會順著背坡滑進流沙）
          if (s.vx < T.DUNE_BACK_VX) s.vx = T.DUNE_BACK_VX;
          if (s.vy < T.DUNE_BACK_VY) s.vy = T.DUNE_BACK_VY;
          if (s.t - s.backT > 0.3) s.events.push({ type: 'launch', i: di, x: s.x, y: s.y, vx: s.vx, vy: s.vy, back: true });
          s.backT = s.t;
        }
        const fl = d.lip && !inBack ? T.DUNE_LIP_FLOOR : T.DUNE_FLOOR, vt = s.vx * inv + s.vy * sl * inv;
        if (!inBack && vt < fl) { s.vx += (fl - vt) * inv; s.vy += (fl - vt) * sl * inv; }
        if (tg.state !== 'stuck') {
          // 貼坡：角速度歸零、角度順著坡面（翻滾計數不會因為貼坡亂跳）
          s.omega = 0; s.airRot = 0; s.airFlips = 0;
          let da = Math.atan(sl) - s.angle; da -= Math.round(da / TAU) * TAU;
          s.angle += da * (1 - Math.exp(-dt * 24));
        }
        if (prev < 0 && s.t - s.duneT > 0.25) s.events.push({ type: 'dune', i: di, x: s.x, y: s.y, speed: Math.max(0, impact), vx: s.vx });
        s.duneT = s.t;
      }
    }
    if (touch < 0 && prev >= 0 && lv.dunes[prev].lip && s.x > lv.dunes[prev].x1 - 1.5 && s.vx > 8 && s.t - s.backT > 0.3) s.events.push({ type: 'launch', i: prev, x: s.x, y: s.y, vx: s.vx, vy: s.vy });
    s.onDune = touch;
  }
  // 危險物：碰到就死；擦身而過（進入 1 單位內又離開）＝ CLOSE CALL
  const nS = lv.spikes.length;
  for (let i = 0; i < nS + lv.saws.length; i++) {
    const h = i < nS ? lv.spikes[i] : movePos(lv.saws[i - nS], s.t, tmp);
    const r = i < nS ? lv.spikes[i].r : lv.saws[i - nS].r;
    const d = Math.hypot(s.x - h.x, s.y - h.y), rr = r + R * 0.8;
    if (d < rr) return die(s, i < nS ? 'spike' : 'saw');
    if (d < rr + 1.1) { s.nearMin[i] = s.near[i] === 1 ? Math.min(s.nearMin[i], d - rr) : d - rr; s.near[i] = 1; }
    else if (s.near[i] === 1 && d > rr + 2) { s.near[i] = 2; s.events.push({ type: 'close', x: s.x, y: s.y, gap: s.nearMin[i] }); }
  }
  for (let i = 0; i < lv.rings.length; i++) {
    if (s.rings[i]) continue;
    const g = lv.rings[i];
    if (Math.hypot(s.x - g.x, s.y - g.y) < T.RING_R) {
      s.rings[i] = true;
      s.events.push({ type: 'ring', i, x: g.x, y: g.y, speed: Math.hypot(s.vx, s.vy), flips: s.airFlips });
    }
  }
  for (let i = 0; i < lv.flies.length; i++) {
    if (s.flies[i]) continue;
    flyPos(lv.flies[i], s.t, tmp);
    if (Math.hypot(s.x - tmp.x, s.y - tmp.y) < T.FLY_EAT_R) {
      s.flies[i] = true; s.fliesGot++;
      s.events.push({ type: 'fly', i, x: tmp.x, y: tmp.y });
    }
  }
  for (let i = 0; i < lv.boosts.length; i++) {
    const b = lv.boosts[i];
    if (b.off || s.boostUsed[i]) continue;
    if (Math.hypot(s.x - b.x, s.y - b.y) < T.BOOST_R) {
      s.boostUsed[i] = true; s.boosts++; s.boostT = s.t;
      s.vx += b.dx * T.BOOST_V; s.vy += b.dy * T.BOOST_V;
      s.events.push({ type: 'boost', i, x: b.x, y: b.y, dx: b.dx, dy: b.dy, speed: Math.hypot(s.vx, s.vy) });
    }
  }
  // 中途荷葉：跟終點同一套落地判定，但不結束關卡，變回站著（可以重新起跳）並記下存檔
  for (let i = 0; i < lv.pads.length; i++) {
    const p = lv.pads[i];
    if (Math.abs(s.x - p.x) < p.w * 0.5 && s.y - R <= p.y + 0.1 && s.y > p.y - 1.4 && s.vy <= 0.5) {
      const sp = Math.hypot(s.vx, s.vy);
      s.mode = 'perch'; s.crouch = 0; s.vx = 0; s.vy = 0; s.omega = 0; s.angle = 0; s.y = p.y + R;
      tg.state = 'idle'; tg.tip = 0; s.checkpoint = i;
      s.events.push({ type: 'pad', i, x: s.x, y: s.y, speed: sp });
      return;
    }
  }
  const g = lv.goal;
  if (s.x > g.wall - R && s.y < 22) {
    s.x = g.wall - R; if (s.vx > 0) { s.vx = -s.vx * 0.35; s.events.push({ type: 'wall', x: s.x, y: s.y }); }
    if (tg.state === 'stuck') detach(s);
  }
  if (Math.abs(s.x - g.x) < g.w * 0.5 && s.y - R <= g.y + 0.1 && s.y > g.y - 1.4 && s.vy <= 0.5) {
    s.mode = 'won'; s.y = g.y + R;
    if (tg.state !== 'idle') tg.state = 'retract';
    s.events.push({ type: 'win', x: s.x, y: s.y, vx: s.vx, vy: s.vy });
    return;
  }
  if (s.y < T.WATER_Y + 0.15) die(s, 'water');
}

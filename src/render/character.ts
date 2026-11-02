// 主角：原版 3D 模型烘焙出來的零件圖層（身體、四條腿、眼白、虹膜、高光、嘴、配件），依烘焙時的深度由遠到近疊回去。
// 動畫在 2D 做：擠壓伸展（沿速度軸）、出場彈性放大、眼睛看目標＋加速度晃瞳孔、眨眼、張嘴、腿縮放／張開。
// 旋轉貓＝oiia 迷因：平常是站姿照片；離地換成揣手手的 9 個角度、依翻滾角度逐格播（迷因綠幕範本的動作），著地切回站姿。
// 舌頭：從嘴（tongue_anchor）到舌尖的緞帶（圓管明暗貼圖沿長度重複）＋舌尖糖果；水面上有一團柔影。
import type { Skin, TongueSpec } from '../config.ts';
import { TUNE } from '../config.ts';
import type { Sim, XY } from '../types.ts';
import { mat, mul, setTRS, rgba, NOCLIP } from './gl.ts';
import type { Frame, Mat, Tex } from './gl.ts';
import { tongueStrip } from './paint.ts';
import { tintOf } from './palette.ts';
import { spring } from './spring.ts';
import type { View } from './view.ts';

const TAU = Math.PI * 2, VIS = TUNE.FROG_VIS;
export interface Mood { lookX: number; lookY: number; mouth: boolean; tongueWob: number; tipPop: number; scared: boolean }
interface Part { f: Frame; tag: string }
const SKIN_IDS = new Set(['tree', 'dart', 'tomato', 'candy', 'glass', 'ninja', 'gold', 'astro', 'king', 'silkfrog', 'ape']);
const CAT_MOUTH: [number, number] = [0.342, 0.262]; // 照片裡嘴巴相對身體中心（世界單位）
const CAT_TURNS = 1.5; // 翻一圈貓轉幾圈：翻滾每秒 2–3.5 圈 → 貓 3–5 圈（迷因原片每秒 3.3–5.5 圈）

export function createCharacter(view: View) {
  const F = view.frames, R = view.R;
  let parts: Part[] = [], kind: 'frog' | 'cat' | 'ape' = 'frog', mouthPv: [number, number] = [0.7, -0.1], visible = true, catSpin: Frame[] = [];
  let tk: TongueSpec | null = null, tongueTex: Tex | null = null, tongueMul = 0, tipMul = 0;
  const tongueTexs: Record<string, Tex> = {};
  const st = {
    k: 1, kv: 0, axis: 0, blinkT: 2, blink: 0, pupX: 0, pupY: 0, pupVX: 0, pupVY: 0, eyeS: 1, eyeSV: 0,
    pvx: 0, pvy: 0, mouthOpen: 0, tuck: 0, pop: 1, skin: null as Skin | null,
    spin: 0, spinBase: 0, spinPrev: 0, wasAir: false, spinning: false,
  };
  // 這一幀算好的姿勢（draw 用）
  const pose = { x: 0, y: 0, ang: 0, sc: 1, legB: 0, legF: 0, lookX: 0, lookY: 0, eyeK: 1, lid: 1, open: 0, tip: null as XY | null, tipScale: 1 };
  const N = 14, pts = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

  function setSkin(sk: Skin): void {
    st.skin = sk; kind = sk.kind ?? 'frog';
    // 造型圖集／貓照片用到才載：還沒到就先不畫，載好再套一次（只套目前的造型）
    if (kind === 'cat') {
      const p = F.c_photo;
      if (!p) { parts = []; void view.ensureCat().then(() => { if (st.skin === sk) setSkin(sk); }); return; }
      parts = [{ f: p, tag: 'photo' }];
      catSpin = []; for (let i = 0; F[`c_spin${i}`]; i++) catSpin.push(F[`c_spin${i}`]);
      return;
    }
    const id = SKIN_IDS.has(sk.id) ? sk.id : 'tree', pre = `${id}.`;
    if (!F[`${pre}body`]) { parts = []; void view.ensureSkin(id).then(() => { if (st.skin === sk) setSkin(sk); }); return; }
    parts = Object.keys(F).filter((k) => k.startsWith(pre)).map((k) => ({ f: F[k], tag: k.slice(pre.length) })).sort((a, b) => (a.f.d ?? 0) - (b.f.d ?? 0));
    const o = F[`${id}.open`] ?? F[`${id}.smile`];
    // 嘴（舌頭起點）：張嘴層的關節點＝tongue_anchor，換算成世界單位（相對角色原點、y 往上）
    if (o?.px !== undefined) mouthPv = [(o.px - o.ax) * o.unit * VIS, -(o.py! - o.ay) * o.unit * VIS];
  }
  function setTongue(spec: TongueSpec): void {
    tk = spec;
    const key = spec.tex ?? 'plain';
    tongueTex = tongueTexs[key] ??= view.canvasTexture(tongueStrip(spec.tex ?? null), true);
    tongueMul = rgba(spec.tex ? 0xffffff : tintOf(spec.color), 1); tipMul = rgba(tintOf(spec.tip), 1);
  }
  function squash(k: number, axis?: number): void { st.k = k; st.kv = 0; if (axis !== undefined) st.axis = axis; st.eyeS = 1.25; st.eyeSV = 0; }
  function jiggle(a: number): void { st.pupVX += (Math.random() - 0.5) * a; st.pupVY += (Math.random() - 0.5) * a; }
  function jelly(a: number): void { st.kv += a; st.eyeSV += a * 2; }
  function popIn(): void { st.pop = 0; }
  /** 嘴巴的世界座標（舌頭起點） */
  function mouthWorld(x: number, y: number, ang: number, out: XY): XY {
    const [mx, my] = kind === 'cat' ? CAT_MOUTH : mouthPv, c = Math.cos(ang), s = Math.sin(ang);
    out.x = x + mx * c - my * s; out.y = y + mx * s + my * c;
    return out;
  }
  const mouth: XY = { x: 0, y: 0 };

  function update(s: Sim, px: number, py: number, pa: number, dt: number, t: number, tipXY: XY | null, mood: Mood): XY {
    let ang = pa;
    const air = s.mode === 'air' && s.tongue.state !== 'stuck';
    if (kind === 'cat') {
      if (air && !st.wasAir) st.spinBase = pa;
      if (air) { st.spin = pa - st.spinBase; ang = 0; } // 迷因裡貓一直是正的：離地就站正，只換旋轉格
      else st.spin *= Math.exp(-dt * 14);
      st.wasAir = air;
      const rate = dt > 0 ? Math.abs(st.spin - st.spinPrev) / dt : 0; st.spinPrev = st.spin;
      st.spinning = air && rate > 4; // 給音效用：轉起來才唱 oiia
    }
    let sc = 1;
    if (st.pop < 1) { st.pop = Math.min(1, st.pop + dt / 0.5); const u = st.pop; sc = 1 - Math.pow(1 - u, 3) * Math.cos(u * 9); }
    const sp = Math.hypot(s.vx, s.vy);
    // 擠壓伸展彈簧（阻尼偏低＝果凍感）
    let target = 1, axis = st.axis;
    if (s.mode === 'air' && sp > 6 && kind !== 'cat') { target = 1 + Math.min(0.28, sp * 0.009); axis = Math.atan2(-s.vx, s.vy); } // 貓的旋轉格是照片，不沿速度拉長
    else if (s.mode === 'swing') { target = 1 + Math.min(0.2, sp * 0.006); axis = ang; }
    else if (s.mode === 'perch') target = s.crouch > 0 ? 0.7 : 1 + Math.sin(t * 3.2) * 0.035;
    let r = spring(st.k, st.kv, target, 280, 9, dt); st.k = r.x; st.kv = r.v;
    let da = axis - st.axis; da -= Math.round(da / TAU) * TAU; st.axis += da * Math.min(1, dt * 18);
    // 加速度 → 瞳孔晃動（彈簧）
    const ax = (s.vx - st.pvx) / Math.max(dt, 1e-4), ay = (s.vy - st.pvy) / Math.max(dt, 1e-4);
    st.pvx = s.vx; st.pvy = s.vy;
    if (dt > 0) {
      const c = Math.cos(-ang), sn = Math.sin(-ang), lx = ax * c - ay * sn, ly = ax * sn + ay * c;
      r = spring(st.pupX, st.pupVX, 0, 180, 9, dt, -lx * 0.00012); st.pupX = Math.max(-0.07, Math.min(0.07, r.x)); st.pupVX = r.v;
      r = spring(st.pupY, st.pupVY, 0, 180, 9, dt, -ly * 0.00012); st.pupY = Math.max(-0.07, Math.min(0.07, r.x)); st.pupVY = r.v;
      r = spring(st.eyeS, st.eyeSV, 1, 300, 10, dt); st.eyeS = r.x; st.eyeSV = r.v;
    }
    st.blinkT -= dt;
    if (st.blinkT < 0) { st.blink = 0.12; st.blinkT = 1.8 + Math.random() * 2.8; }
    st.blink -= dt;
    st.mouthOpen += ((mood.mouth ? 1 : 0) - st.mouthOpen) * Math.min(1, dt * 20);
    const tuckT = s.mode === 'air' && Math.abs(s.omega) > 6 ? 1 : 0;
    st.tuck += (tuckT - st.tuck) * Math.min(1, dt * 10);
    const spread = s.mode === 'swing' ? 0.5 + Math.sin(t * 9) * 0.15 : s.mode === 'air' ? 0.3 : 0;
    Object.assign(pose, {
      x: px, y: py, ang, sc,
      legB: -(spread * (1 - st.tuck)) * 0.6 + st.tuck * 0.5, legF: spread * (1 - st.tuck) * 0.5 - st.tuck * 0.45,
      lookX: mood.lookX + st.pupX * 16, lookY: mood.lookY + st.pupY * 16,
      eyeK: st.eyeS * (mood.scared ? 1.15 : 1), lid: st.blink > 0 ? 0.12 : 1, open: st.mouthOpen,
      tip: tipXY, tipScale: 0.42 * (mood.tipPop ?? 1) * (tk?.tipScale ?? 1),
    });
    mouthWorld(px, py, ang, mouth);
    // 舌頭的點：從嘴到舌尖，射出時抖、黏住時沿長度帶一點捲曲
    if (tipXY && tk) {
      const dx = tipXY.x - mouth.x, dy = tipXY.y - mouth.y, len = Math.hypot(dx, dy) || 0.001, nx = -dy / len, ny = dx / len;
      const amp = mood.tongueWob * Math.min(1, len * 0.15);
      for (let i = 0; i < N; i++) { const u = i / (N - 1), off = Math.sin(u * Math.PI) * (Math.sin(u * 9 - t * 38) * amp + Math.sin(u * len * 1.3) * tk.wave); pts[i].x = mouth.x + dx * u + nx * off; pts[i].y = mouth.y + dy * u + ny * off; }
    }
    return mouth;
  }

  // ---- 繪製
  const root = mat(), sq = mat(), tmpM = mat(), part = mat(), loc = mat();
  function draw(): void {
    if (!visible || !parts.length) return;
    // 注意：proj 回傳共用物件，先取值再做下一次投影
    const p0 = view.proj(pose.x, pose.y, 0), cx = p0.x, cy = p0.y, k = p0.k;
    // 水面柔影：離水越高越淡
    const h = pose.y; if (h > -0.5 && h < 12) { const w = view.proj(pose.x, 0.02, 0); R.sprite(F.shadow, w.x, w.y, 0, w.k * F.shadow.unit * 1.5, w.k * F.shadow.unit * 0.42, rgba(0xffffff, Math.max(0, 0.55 - h * 0.05))); }
    // 根矩陣：位置 → 角度 → 擠壓（沿軸）→ 放大
    const unit = parts[0].f.unit, base = k * VIS * unit * pose.sc;
    const rel = -(st.axis - pose.ang), kk = Math.max(0.45, Math.min(1.75, st.k));
    setTRS(root, cx, cy, -pose.ang, 1, 1);
    setTRS(tmpM, 0, 0, rel, 1, 1); mul(root, root, tmpM);
    setTRS(tmpM, 0, 0, 0, 1 / Math.sqrt(kk), kk); mul(root, root, tmpM);
    setTRS(tmpM, 0, 0, -rel, base, base); mul(sq, root, tmpM);
    const clip = view.waterline(pose.x, 0);
    for (const q of parts) {
      const f = q.f, tag = q.tag, white = rgba(0xffffff, 1);
      if (kind === 'cat') {
        // 離地：依翻滾角度挑旋轉格（反向翻就倒著播）；著地：站姿照片
        let g = f;
        if (st.wasAir && catSpin.length) { const n = catSpin.length, i = Math.floor(((st.spin * CAT_TURNS) / TAU) * n); g = catSpin[((i % n) + n) % n]; }
        const cs = (k * (g.unit * VIS) * pose.sc) / base; // 這一格自己的單位
        setTRS(loc, 0, 0, 0, cs, cs); mul(part, sq, loc);
        R.spriteM(g, part, white, 0, clip);
        continue;
      }
      if (tag === 'smile' && pose.open > 0.3) continue;
      if (tag === 'open' && pose.open <= 0.3) continue;
      if ((tag === 'glintL' || tag === 'glintR') && pose.lid < 0.5) continue;
      const lx = (f.px ?? f.ax) - f.ax, ly = (f.py ?? f.ay) - f.ay; // 關節點（相對錨點，像素）
      if (tag.startsWith('leg')) {
        const a = tag.startsWith('legB') ? pose.legB : pose.legF;
        setTRS(loc, lx, ly, -a, 1, 1); setTRS(tmpM, -lx, -ly, 0, 1, 1); mul(loc, loc, tmpM); mul(part, sq, loc);
      } else if (tag.startsWith('eye') || tag.startsWith('iris') || tag.startsWith('glint')) {
        const ex = tag.startsWith('iris') ? pose.lookX * 6 : 0, ey = tag.startsWith('iris') ? -pose.lookY * 6 : 0;
        setTRS(loc, lx + ex, ly + ey, 0, pose.eyeK, pose.eyeK * pose.lid); setTRS(tmpM, -lx, -ly, 0, 1, 1); mul(loc, loc, tmpM); mul(part, sq, loc);
      } else if (tag === 'open') {
        const m = 0.6 + pose.open * 0.5;
        setTRS(loc, lx, ly, 0, m, m); setTRS(tmpM, -lx, -ly, 0, 1, 1); mul(loc, loc, tmpM); mul(part, sq, loc);
      } else part.set(sq);
      R.spriteM(f, part, white, 0, clip);
    }
    // 舌頭
    if (pose.tip && tk && tongueTex) {
      const w2 = 0.21 * tk.width, period = 0.84 * tk.width;
      let ax = 0, ay = 0, bx = 0, by = 0, u = 0, px = 0, pyy = 0;
      for (let i = 0; i < N; i++) {
        const a = view.proj(pts[i].x, pts[i].y, 0.05), sx = a.x, sy = a.y, hk = w2 * a.k;
        const j0 = Math.max(0, i - 1), j1 = Math.min(N - 1, i + 1);
        const tx = pts[j1].x - pts[j0].x, ty = pts[j1].y - pts[j0].y, tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = -tx / tl; // 螢幕空間法線（y 往下）
        const lx2 = sx + nx * hk, ly2 = sy + ny * hk, rx2 = sx - nx * hk, ry2 = sy - ny * hk;
        if (i) { u += Math.hypot(pts[i].x - px, pts[i].y - pyy) / period; R.quadUV(tongueTex, ax, ay, u - Math.hypot(pts[i].x - px, pts[i].y - pyy) / period, 0, lx2, ly2, u, 0, bx, by, u - Math.hypot(pts[i].x - px, pts[i].y - pyy) / period, 1, rx2, ry2, u, 1, tongueMul, 0, NOCLIP); }
        ax = lx2; ay = ly2; bx = rx2; by = ry2; px = pts[i].x; pyy = pts[i].y;
      }
      const tp = view.proj(pose.tip.x, pose.tip.y, 0.06), tf = F.p_candy;
      R.sprite(tf, tp.x, tp.y, 0, tp.k * tf.unit * pose.tipScale * 2.2, tp.k * tf.unit * pose.tipScale * 2.2, tipMul);
    }
  }

  return { st, setSkin, setTongue, squash, jiggle, jelly, popIn, update, draw, mouthWorld, get kind() { return kind; }, set visible(v: boolean) { visible = v; } };
}
export type Character = ReturnType<typeof createCharacter>;
export type { Mat };

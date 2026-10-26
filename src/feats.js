// 成就＝當下的捧場：sim 吐事件、這裡判斷「玩家剛剛做了一件自己都覺得很強的事」。純邏輯（不碰 DOM／three），Node 測試直接餵事件。
// 門檻由 tests/feat-dist.mjs 的自動玩家分布訂（分布與理由寫在 _out/hook-hero/round2/play/DONE.md）。
import { TUNE as T } from './config.js';

export const FEAT_T = {
  SPIN: 5, // 一次滯空轉滿幾圈（自動玩家最多 5 圈、1.3% 的局）
  TORNADO: 7, // 使用者點名的 7 圈：另一個更稀有的成就
  FLOW_STALL: 0.1, // 速度 < 13 的總秒數（自動玩家勝局 p50＝2.35 秒） // 整關「停滯」（速度 < STALL_V）總秒數 ≤ 這個值
  STALL_V: 13,
  FLOW_MIN_LEN: 60, // 太短的關不算
  SPEED: 18, // 平均水平速度（單位/秒）≥ 這個值＝超快通關
  SKIM_Y: 1.0, // 青蛙中心離「落水線」只剩這麼高又飛回去
  SKIM_BACK: 4, // 回到這個高度以上才算救回來
  SHAVE: 0.12, // 擦過尖刺／鋸片：最近距離離碰撞邊緣 ≤ 這個值
  CLUTCH_Y: 3.5, // 黏住的瞬間青蛙中心低於這個高度、而且正在往下掉
  CLUTCH_VY: -6,
  CLUTCH_BACK: 6, // 之後回到這個高度以上才算拉回
};

// better：'max'＝數字越大越強、'min'＝越小越強；fmt 給紀錄頁顯示
export const FEATS = [
  { id: 'spin', name: 'SPIN DOCTOR!', line: 'Five spins in one jump. Dizzy yet?', coins: 25, better: 'max', fmt: (v) => `${v} spins` },
  { id: 'tornado', name: 'FROGNADO!!', line: 'SEVEN spins in one jump. Unreal.', coins: 60, better: 'max', fmt: (v) => `${v} spins` },
  { id: 'flow', name: 'NONSTOP!', line: 'A whole level without slowing down.', coins: 25, better: 'min', fmt: (v) => `${v.toFixed(2)}s stalled` },
  { id: 'speed', name: 'SPEED DEMON!', line: 'That was way too fast.', coins: 25, better: 'max', fmt: (v) => `${v.toFixed(1)} m/s` },
  { id: 'skim', name: 'WAVE KISSER!', line: 'Touched the water and lived.', coins: 20, better: 'min', fmt: (v) => `${v.toFixed(2)} m above` },
  { id: 'shave', name: 'CLOSE SHAVE!', line: 'A hair away from the spikes.', coins: 20, better: 'min', fmt: (v) => `${v.toFixed(2)} m gap` },
  { id: 'clutch', name: 'CLUTCH SAVE!', line: 'Grabbed it at the very last second!', coins: 25, better: 'min', fmt: (v) => `${v.toFixed(2)} m high` },
];
export const featById = (id) => FEATS.find((f) => f.id === id);

const WATER = T.WATER_Y + 0.15; // sim 的落水判定線（青蛙中心）

export function createFeatTracker(K = FEAT_T) {
  const st = { stall: 0, dip: Infinity, clutch: null };
  const out = [];
  return {
    st,
    reset() { st.stall = 0; st.dip = Infinity; st.clutch = null; },
    // 每個 sim 步呼叫一次；回傳這一步達成的成就
    tick(s, dt) {
      out.length = 0;
      if (s.mode !== 'air' && s.mode !== 'swing') return out;
      if (s.attaches > 1 && Math.hypot(s.vx, s.vy) < K.STALL_V) st.stall += dt; // 起跳後第一個鉤點（一定會慢一下）不算
      const h = s.y - WATER;
      if (h < 3) st.dip = Math.min(st.dip, h);
      else if (h > K.SKIM_BACK && st.dip < Infinity) {
        if (st.dip <= K.SKIM_Y) out.push({ id: 'skim', value: st.dip });
        st.dip = Infinity;
      }
      if (st.clutch !== null && h > K.CLUTCH_BACK) { out.push({ id: 'clutch', value: st.clutch }); st.clutch = null; }
      return out;
    },
    // sim 事件；回傳達成的成就（silent＝只更新紀錄、不再跳一次）
    event(e, s) {
      out.length = 0;
      if (e.type === 'flip' && e.n >= K.SPIN) {
        out.push({ id: 'spin', value: e.n, silent: e.n > K.SPIN });
        if (e.n >= K.TORNADO) out.push({ id: 'tornado', value: e.n, silent: e.n > K.TORNADO });
      }
      else if (e.type === 'close' && e.gap !== undefined && e.gap <= K.SHAVE) out.push({ id: 'shave', value: Math.max(0, e.gap) });
      else if (e.type === 'attach' && e.fy !== undefined && e.fy - WATER < K.CLUTCH_Y && e.fvy < K.CLUTCH_VY) st.clutch = e.fy - WATER;
      else if (e.type === 'die') { st.dip = Infinity; st.clutch = null; }
      else if (e.type === 'win' && !s.level.endless) {
        const len = s.level.goal.x - s.level.start.x;
        if (len >= K.FLOW_MIN_LEN && st.stall <= K.FLOW_STALL) out.push({ id: 'flow', value: st.stall });
        if (s.time > 0 && len / s.time >= K.SPEED) out.push({ id: 'speed', value: len / s.time });
      }
      return out;
    },
  };
}

// 紀錄頁：第一次達成日期（本地年月日）、最佳數值、次數
export function recordFeat(rec, id, value, now = new Date()) {
  const f = featById(id), r = rec[id];
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!r) { rec[id] = { first: day, best: value, count: 1 }; return true; }
  const better = f.better === 'max' ? value > r.best : value < r.best;
  if (better) r.best = value;
  r.count++;
  return better;
}

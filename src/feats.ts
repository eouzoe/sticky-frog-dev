// 成就＝當下的捧場：sim 吐事件、這裡判斷「玩家剛剛做了一件自己都覺得很強的事」。純邏輯，Node 測試直接餵事件。
import { TUNE as T } from './config.ts';
import { duneAt } from './sim.ts';
import type { Sim, SimEvent } from './types.ts';

// 門檻一律偏嚴：成就是「自己都覺得很強」的瞬間，太容易拿就廉價，跳太頻繁會打斷手感
export const FEAT_T = {
  SPIN: 7, // 一次滯空轉滿幾圈
  TORNADO: 10, // 10 圈：另一個更稀有的成就
  FLOW_STALL: 0.05, // 整關「停滯」（速度 < STALL_V）總秒數 ≤ 這個值
  STALL_V: 13,
  FLOW_MIN_LEN: 60, // 太短的關不算
  SPEED: 22, // 平均水平速度（單位/秒）≥ 這個值＝超快通關
  SKIM_Y: 0.45, // 青蛙中心離「落水線」只剩這麼高又飛回去
  SKIM_BACK: 5, // 回到這個高度以上才算救回來
  SHAVE: 0.06, // 擦過尖刺／鋸片：最近距離離碰撞邊緣 ≤ 這個值
};
export type FeatThresholds = typeof FEAT_T;

export type FeatId = 'spin' | 'tornado' | 'flow' | 'speed' | 'skim' | 'shave';
/** 大貼紙＋慢動作＋號角只給這兩個；其他成就簡單跳一下字就好（使用者：醒目提示留給 7 圈以上） */
export const BIG_FEATS: ReadonlySet<FeatId> = new Set<FeatId>(['spin', 'tornado']);
export interface FeatDef { id: FeatId; name: string; line: string; coins: number; better: 'max' | 'min'; fmt: (v: number) => string }
// better：'max'＝數字越大越強、'min'＝越小越強；fmt 給紀錄頁顯示（英文備援）
export const FEATS: readonly FeatDef[] = [
  { id: 'spin', name: 'SPIN DOCTOR!', line: 'Seven spins in one jump. Dizzy yet?', coins: 25, better: 'max', fmt: (v) => `${v} spins` },
  { id: 'tornado', name: 'FROGNADO!!', line: 'TEN spins in one jump. Unreal.', coins: 60, better: 'max', fmt: (v) => `${v} spins` },
  { id: 'flow', name: 'NONSTOP!', line: 'A whole level without slowing down.', coins: 25, better: 'min', fmt: (v) => `${v.toFixed(2)}s stalled` },
  { id: 'speed', name: 'SPEED DEMON!', line: 'That was way too fast.', coins: 25, better: 'max', fmt: (v) => `${v.toFixed(1)} m/s` },
  { id: 'skim', name: 'WAVE KISSER!', line: 'Touched the water and lived.', coins: 20, better: 'min', fmt: (v) => `${v.toFixed(2)} m above` },
  { id: 'shave', name: 'CLOSE SHAVE!', line: 'A hair away from the rocks.', coins: 20, better: 'min', fmt: (v) => `${v.toFixed(2)} m gap` },
];
export const featById = (id: string): FeatDef | undefined => FEATS.find((f) => f.id === id);

/** silent＝只更新紀錄、不再跳一次（同一跳的第 6、7 圈不重複捧場） */
export interface FeatHit { id: FeatId; value: number; silent?: boolean }
export interface FeatRecord { first: string; best: number; count: number }

const WATER = T.WATER_Y + 0.15; // sim 的落水判定線（青蛙中心）

export function createFeatTracker(K: FeatThresholds = FEAT_T) {
  // padded＝這一輪停過中途荷葉：荷葉＝停下來過，不能拿 NONSTOP
  const st = { stall: 0, dip: Infinity, padded: false };
  return {
    st,
    reset() { st.stall = 0; st.dip = Infinity; st.padded = false; },
    // 每個 sim 步呼叫一次；回傳這一步達成的成就（每次回傳新陣列，呼叫端迭代時不怕被清掉）
    tick(s: Sim, dt: number): FeatHit[] {
      if (s.mode !== 'air' && s.mode !== 'swing') return [];
      const out: FeatHit[] = [];
      // 滑沙（貼著沙面）不算停下；起跳後第一個鉤點（一定會慢一下）不算
      if (s.attaches > 1 && Math.hypot(s.vx, s.vy) < K.STALL_V && !(s.onDune >= 0)) st.stall += dt;
      const h = s.y - WATER, sand = duneAt(s.level, s.x) >= 0; // 沙丘上方不是水
      if (sand) st.dip = Infinity;
      else if (h < 3) st.dip = Math.min(st.dip, h);
      else if (h > K.SKIM_BACK && st.dip < Infinity) {
        if (st.dip <= K.SKIM_Y) out.push({ id: 'skim', value: st.dip });
        st.dip = Infinity;
      }
      return out;
    },
    event(e: SimEvent, s: Sim): FeatHit[] {
      const out: FeatHit[] = [];
      if (e.type === 'flip' && e.n >= K.SPIN) {
        out.push({ id: 'spin', value: e.n, silent: e.n > K.SPIN });
        if (e.n >= K.TORNADO) out.push({ id: 'tornado', value: e.n, silent: e.n > K.TORNADO });
      }
      else if (e.type === 'close' && e.gap !== undefined && e.gap <= K.SHAVE) out.push({ id: 'shave', value: Math.max(0, e.gap) });
      else if (e.type === 'die') st.dip = Infinity;
      else if (e.type === 'pad') st.padded = true;
      else if (e.type === 'win' && !s.level.endless) {
        const len = s.level.goal.x - s.level.start.x;
        if (len >= K.FLOW_MIN_LEN && st.stall <= K.FLOW_STALL && !st.padded) out.push({ id: 'flow', value: st.stall });
        if (s.time > 0 && len / s.time >= K.SPEED) out.push({ id: 'speed', value: len / s.time });
      }
      return out;
    },
  };
}
export type FeatTracker = ReturnType<typeof createFeatTracker>;

// 紀錄頁：第一次達成日期（本地年月日）、最佳數值、次數。回傳這次是否刷新最佳
export function recordFeat(rec: Record<string, FeatRecord>, id: FeatId, value: number, now = new Date()): boolean {
  const f = featById(id)!, r = rec[id];
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!r) { rec[id] = { first: day, best: value, count: 1 }; return true; }
  const better = f.better === 'max' ? value > r.best : value < r.best;
  if (better) r.best = value;
  r.count++;
  return better;
}

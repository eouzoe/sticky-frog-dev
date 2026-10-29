// 存檔：預設值、讀檔正規化（舊存檔相容）、選單「下一步」推薦。純邏輯，Node 可測（tests/save-check.mjs）。
import { SKINS, TRAILS, TONGUES } from './config.js';

export const SAVE_KEY = 'sticky-frog-v1';
export const ENDLESS_UNLOCK = 5; // 破第 5 關解鎖無盡模式
export const DEFAULT_SAVE = {
  unlocked: 1, stars: {}, best: {}, coins: 0, skin: 'tree', trail: 'none', tongue: 'tongue', owned: ['tree', 'none', 'tongue'],
  music: true, sfx: true, grabs: 0, last: 1, worldsDone: [], clears: 0,
  feats: {}, lb: [], endlessBest: 0, endlessRuns: 0,
  seen: { endless: false, world: 0 }, // 玩家在選單上「已經看過」的解鎖（推薦只推新的）
  tutTouch: false, // 手機觸控教學看過了
  lang: '', // 玩家自己選的介面語言（空＝自動偵測）
  privSeen: false, // 遊玩數據的隱私通知看過了
};

const int = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : d);
const obj = (v) => (typeof v === 'object' && v && !Array.isArray(v) ? { ...v } : {});

// 任何來源（舊版有 results 欄位、壞掉的 JSON 片段）都整理成合法存檔；不認得的欄位丟掉。stars（每關最佳星數 1–3）沿用舊存檔
export function normalizeSave(raw, levelCount) {
  const r = obj(raw), s = { ...DEFAULT_SAVE };
  s.unlocked = int(r.unlocked, 1, levelCount, 1); s.last = int(r.last, 1, levelCount, 1);
  const unlocked0 = s.unlocked;
  s.coins = int(r.coins, 0, 1e9, 0); s.grabs = int(r.grabs, 0, 1e9, 0); s.clears = int(r.clears ?? r.results, 0, 1e9, 0);
  s.endlessBest = int(r.endlessBest, 0, 1e9, 0); s.endlessRuns = int(r.endlessRuns, 0, 1e9, 0);
  s.music = r.music !== false; s.sfx = r.sfx !== false; s.tutTouch = r.tutTouch === true; s.privSeen = r.privSeen === true;
  s.best = obj(r.best); s.feats = obj(r.feats); s.lang = typeof r.lang === 'string' ? r.lang.slice(0, 12) : '';
  s.stars = {};
  for (const [k, v] of Object.entries(obj(r.stars))) { const n = Number(k), st = int(v, 0, 3, 0); if (Number.isInteger(n) && n >= 1 && n <= levelCount && st >= 1) s.stars[n] = st; }
  const ids = new Set([...SKINS, ...TRAILS, ...TONGUES].map((i) => i.id));
  s.owned = [...new Set([...DEFAULT_SAVE.owned, ...(Array.isArray(r.owned) ? r.owned : []).filter((id) => ids.has(id))])];
  // 擁有角色就擁有它的招牌舌頭（舊存檔買過的角色沒有舌頭欄位）
  for (const k of SKINS) if (k.tongue && s.owned.includes(k.id) && !s.owned.includes(k.tongue)) s.owned.push(k.tongue);
  s.skin = SKINS.some((k) => k.id === r.skin) && s.owned.includes(r.skin) ? r.skin : 'tree';
  s.trail = TRAILS.some((k) => k.id === r.trail) && s.owned.includes(r.trail) ? r.trail : 'none';
  s.tongue = TONGUES.some((k) => k.id === r.tongue) && s.owned.includes(r.tongue) ? r.tongue : 'tongue';
  s.worldsDone = Array.isArray(r.worldsDone) ? r.worldsDone.filter(Number.isFinite) : [];
  s.lb = Array.isArray(r.lb) ? r.lb.filter((e) => e && Number.isFinite(e.score)).slice(0, 10).map((e) => ({ score: e.score, dist: int(e.dist, 0, 1e9, 0), day: String(e.day ?? '') })) : [];
  const seen = obj(r.seen);
  // 舊存檔：已經解鎖的東西當作看過（不要一升級就推一堆）
  // 60 關時代的存檔：第 60 關破了但 unlocked 被舊上限壓在 60 → 補成 61（第 5 世界開放）；seen.world 用補之前的算，這樣冰峰會被推薦成新世界
  if (levelCount > 60 && s.unlocked === 60 && s.stars[60]) s.unlocked = 61;
  s.seen = { endless: seen.endless ?? s.unlocked > ENDLESS_UNLOCK, world: int(seen.world, 0, Math.floor((levelCount - 1) / 15), Math.floor((unlocked0 - 1) / 15)) };
  return s;
}

export const allItems = () => [...SKINS.map((it) => ({ ...it, tab: 'skins' })), ...TONGUES.map((it) => ({ ...it, tab: 'tongues' })), ...TRAILS.map((it) => ({ ...it, tab: 'trails' }))];
// 買得起、還沒買的最好一件：看板角色優先，其次最貴的（剛好買得起的大獎最有感）
export function bestAffordable(s) {
  const c = allItems().filter((it) => !s.owned.includes(it.id) && it.price > 0 && it.price <= s.coins);
  c.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.price - a.price);
  return c[0] ?? null;
}

// 退回選單時推哪一個「下一步」：新模式 → 新世界 → 買得起的東西 → 沒有
export function nextStep(s) {
  if (s.unlocked > ENDLESS_UNLOCK && !s.seen.endless) return { kind: 'endless' };
  const w = Math.floor((s.unlocked - 1) / 15);
  if (w > s.seen.world) return { kind: 'world', world: w, level: w * 15 + 1 };
  const it = bestAffordable(s);
  if (it) return { kind: 'shop', item: it };
  return null;
}

// 評星（沿用第一輪）：1 顆＝過關、2＝吃到 ≥ 70% 的蒼蠅、3＝在標準時間 par（關卡長度 / PAR_SPEED + 3 秒）內
export function rateStars({ flies, fliesTotal, time, par }) {
  const fliesNeed = Math.ceil(fliesTotal * 0.7), fliesOk = flies >= fliesNeed, timeOk = time <= par;
  return { stars: 1 + (fliesOk ? 1 : 0) + (timeOk ? 1 : 0), fliesNeed, fliesOk, timeOk };
}
// 每關只留最佳星數：新的比舊的低不覆蓋。回傳這次是否刷新
export function recordStars(save, n, stars) {
  const prev = save.stars[n] ?? 0;
  if (stars > prev) save.stars[n] = stars;
  return stars > prev;
}

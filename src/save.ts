// 存檔：預設值、讀檔正規化（舊存檔相容）、選單「下一步」推薦。純邏輯，Node 可測（tests/save-check.mjs）。
import { SKINS, TRAILS, TONGUES, THEMES, THEME_LEVELS, themeKey, ownsTheme } from './config.ts';
import type { Skin, TongueSpec, TrailSpec } from './config.ts';
import type { FeatRecord } from './feats.ts';

export const SAVE_KEY = 'sticky-frog-v1';
export const SAVE_VERSION = 2; // 2：加 v 與 updatedAt（本機與雲端合併用）
export const ENDLESS_UNLOCK = 5; // 破第 5 關解鎖無盡模式

export interface LbEntry { score: number; dist: number; day: string }
export interface Save {
  v: number; updatedAt: number; // 存檔格式版本、最後寫入時間（ms）；mergeSave 用來決定「狀態類」欄位聽誰的
  unlocked: number; stars: Record<number, number>; best: Record<number, number>; coins: number;
  skin: string; trail: string; tongue: string; owned: string[];
  theme: string; saleAt: number; // 套用中的主題（空＝沒有；道具與音效替換跟著它）、組合包特價的起算時間（第一次開商店，0＝還沒）
  music: boolean; sfx: boolean; grabs: number; last: number; worldsDone: number[]; clears: number;
  feats: Record<string, FeatRecord>; lb: LbEntry[]; endlessBest: number; endlessRuns: number;
  seen: { endless: boolean; world: number }; // 玩家在選單上「已經看過」的解鎖（推薦只推新的）
  tutTouch: boolean; // 手機觸控教學看過了
  lang: string; // 玩家自己選的介面語言（空＝自動偵測）
  privSeen: boolean; // 遊玩數據的隱私通知看過了
}
export const DEFAULT_SAVE: Readonly<Save> = {
  v: SAVE_VERSION, updatedAt: 0,
  unlocked: 1, stars: {}, best: {}, coins: 0, skin: 'tree', trail: 'none', tongue: 'tongue', owned: ['tree', 'none', 'tongue'],
  music: true, sfx: true, grabs: 0, last: 1, worldsDone: [], clears: 0,
  feats: {}, lb: [], endlessBest: 0, endlessRuns: 0,
  seen: { endless: false, world: 0 },
  tutTouch: false, lang: '', privSeen: false, theme: '', saleAt: 0,
};

const int = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.floor(Number(v)))) : d);
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});

// 任何來源（舊版有 results 欄位、壞掉的 JSON 片段、手改的存檔）都整理成合法存檔；不認得的欄位丟掉
export function normalizeSave(raw: unknown, levelCount: number): Save {
  const r = obj(raw);
  const s: Save = { ...DEFAULT_SAVE, stars: {}, best: {}, owned: [], worldsDone: [], feats: {}, lb: [], seen: { ...DEFAULT_SAVE.seen } };
  s.v = SAVE_VERSION; s.updatedAt = int(r.updatedAt, 0, 4102444800000, 0); // 舊存檔沒有時間戳＝0，合併時視為最舊
  s.unlocked = int(r.unlocked, 1, levelCount, 1); s.last = int(r.last, 1, levelCount, 1);
  const unlocked0 = s.unlocked;
  s.coins = int(r.coins, 0, 1e9, 0); s.grabs = int(r.grabs, 0, 1e9, 0); s.clears = int(r.clears ?? r.results, 0, 1e9, 0);
  s.endlessBest = int(r.endlessBest, 0, 1e9, 0); s.endlessRuns = int(r.endlessRuns, 0, 1e9, 0);
  s.music = r.music !== false; s.sfx = r.sfx !== false; s.tutTouch = r.tutTouch === true; s.privSeen = r.privSeen === true;
  s.lang = typeof r.lang === 'string' ? r.lang.slice(0, 12) : '';
  const maxLv = levelCount + THEMES.length * THEME_LEVELS; // 主線之後是各主題的系列關卡
  for (const [k, v] of Object.entries(obj(r.stars))) { const n = Number(k), st = int(v, 0, 3, 0); if (Number.isInteger(n) && n >= 1 && n <= maxLv && st >= 1) s.stars[n] = st; }
  // 每關最佳分數：只收合法的關卡號與非負有限數
  for (const [k, v] of Object.entries(obj(r.best))) { const n = Number(k), b = Number(v); if (Number.isInteger(n) && n >= 1 && n <= maxLv && Number.isFinite(b) && b >= 0) s.best[n] = Math.floor(b); }
  // 成就紀錄：只收認得形狀的（壞掉的紀錄會讓 recordFeat 在主迴圈裡丟例外）
  for (const [k, v] of Object.entries(obj(r.feats))) {
    const f = obj(v), best = Number(f.best), count = int(f.count, 0, 1e9, 0);
    if (Number.isFinite(best) && count >= 1) s.feats[k] = { first: String(f.first ?? ''), best, count };
  }
  const ids = new Set([...[...SKINS, ...TRAILS, ...TONGUES].map((i) => i.id), ...THEMES.map((th) => themeKey(th.id))]);
  s.owned = [...new Set([...DEFAULT_SAVE.owned, ...(Array.isArray(r.owned) ? r.owned : []).filter((id): id is string => typeof id === 'string' && ids.has(id))])];
  // 擁有角色就擁有它的招牌舌頭（舊存檔買過的角色沒有舌頭欄位）
  for (const k of SKINS) if (k.tongue && s.owned.includes(k.id) && !s.owned.includes(k.tongue)) s.owned.push(k.tongue);
  const pickOwned = (list: readonly { id: string }[], v: unknown, d: string) => (typeof v === 'string' && list.some((k) => k.id === v) && s.owned.includes(v) ? v : d);
  s.skin = pickOwned(SKINS, r.skin, 'tree'); s.trail = pickOwned(TRAILS, r.trail, 'none'); s.tongue = pickOwned(TONGUES, r.tongue, 'tongue');
  s.theme = THEMES.some((th) => th.id === r.theme && ownsTheme(s.owned, th)) ? String(r.theme) : ''; // 擁有整套才能套用
  s.saleAt = int(r.saleAt, 0, 4102444800000, 0);
  s.worldsDone = Array.isArray(r.worldsDone) ? r.worldsDone.filter((x): x is number => Number.isFinite(x)) : [];
  s.lb = Array.isArray(r.lb) ? r.lb.filter((e) => e && Number.isFinite(e.score)).slice(0, 10).map((e) => ({ score: e.score, dist: int(e.dist, 0, 1e9, 0), day: String(e.day ?? '') })) : [];
  const seen = obj(r.seen);
  // 60 關時代的存檔：第 60 關破了但 unlocked 被舊上限壓在 60 → 補成 61（第 5 世界開放）
  if (levelCount > 60 && s.unlocked === 60 && s.stars[60]) s.unlocked = 61;
  // 75 關時代的存檔 → 補成 76（第 6 世界夕陽沙丘開放）
  if (levelCount > 75 && s.unlocked === 75 && s.stars[75]) s.unlocked = 76;
  s.seen = { endless: typeof seen.endless === 'boolean' ? seen.endless : s.unlocked > ENDLESS_UNLOCK, world: int(seen.world, 0, Math.floor((levelCount - 1) / 15), Math.floor((unlocked0 - 1) / 15)) };
  return s;
}

// 兩份存檔合併（本機 vs 雲端、兩台裝置）。原則：永遠不丟進度。
// - 成就類（解鎖、星數、最佳分、成就、榜、無盡紀錄、擁有物、看過的教學）取並集／最大值
// - 狀態類（金幣、目前關卡、裝備、設定、語言）聽 updatedAt 較新的那份；金幣不能取最大值（會把花掉的錢變回來）
// 兩台裝置真的分岔時，較舊那邊「最後一次同步之後」賺的金幣會丟，星數和解鎖不會
export function mergeSave(a: Save, b: Save, levelCount: number): Save {
  const n = a.updatedAt >= b.updatedAt ? a : b; // 較新
  const s = normalizeSave({ ...n }, levelCount);
  s.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  s.unlocked = Math.max(a.unlocked, b.unlocked); s.last = Math.min(n.last, s.unlocked);
  s.grabs = Math.max(a.grabs, b.grabs); s.clears = Math.max(a.clears, b.clears);
  s.endlessBest = Math.max(a.endlessBest, b.endlessBest); s.endlessRuns = Math.max(a.endlessRuns, b.endlessRuns);
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src.stars)) { const i = Number(k); if (v > (s.stars[i] ?? 0)) s.stars[i] = v; }
    for (const [k, v] of Object.entries(src.best)) { const i = Number(k); if (v > (s.best[i] ?? 0)) s.best[i] = v; }
    // 成就的 best 有「越大越好」也有「越小越好」（feats.ts 的 better），這裡不知道方向：拿次數多的那份，同次數聽較新的
    for (const [k, f] of Object.entries(src.feats)) { const cur = s.feats[k]; if (!cur || f.count > cur.count || (f.count === cur.count && src === n)) s.feats[k] = { ...f }; }
  }
  s.owned = [...new Set([...s.owned, ...a.owned, ...b.owned])];
  s.theme = THEMES.some((th) => th.id === n.theme && ownsTheme(s.owned, th)) ? n.theme : ''; // 聽較新的，但要並集後真的擁有
  s.saleAt = a.saleAt && b.saleAt ? Math.min(a.saleAt, b.saleAt) : a.saleAt || b.saleAt; // 特價從最早看到的那一刻算
  s.worldsDone = [...new Set([...a.worldsDone, ...b.worldsDone])];
  s.lb = [...a.lb, ...b.lb].filter((e, i, arr) => arr.findIndex((x) => x.score === e.score && x.dist === e.dist && x.day === e.day) === i).sort((x, y) => y.score - x.score).slice(0, 10);
  s.seen = { endless: a.seen.endless || b.seen.endless, world: Math.max(a.seen.world, b.seen.world) };
  s.tutTouch = a.tutTouch || b.tutTouch; s.privSeen = a.privSeen || b.privSeen;
  return s;
}

export type ShopTab = 'skins' | 'tongues' | 'trails';
export type ShopItem = (Skin | TongueSpec | TrailSpec) & { tab: ShopTab };
export const allItems = (): ShopItem[] => [...SKINS.map((it) => ({ ...it, tab: 'skins' as const })), ...TONGUES.map((it) => ({ ...it, tab: 'tongues' as const })), ...TRAILS.map((it) => ({ ...it, tab: 'trails' as const }))];
// 買得起、還沒買的最好一件：看板角色優先，其次最貴的
export function bestAffordable(s: Save): ShopItem | null {
  const c = allItems().filter((it) => !s.owned.includes(it.id) && it.price > 0 && it.price <= s.coins);
  c.sort((a, b) => (('featured' in b && b.featured) ? 1 : 0) - (('featured' in a && a.featured) ? 1 : 0) || b.price - a.price);
  return c[0] ?? null;
}

export type NextStep = { kind: 'endless' } | { kind: 'world'; world: number; level: number } | { kind: 'shop'; item: ShopItem };
// 退回選單時推哪一個「下一步」：新模式 → 新世界 → 買得起的東西 → 沒有
export function nextStep(s: Save): NextStep | null {
  if (s.unlocked > ENDLESS_UNLOCK && !s.seen.endless) return { kind: 'endless' };
  const w = Math.floor((s.unlocked - 1) / 15);
  if (w > s.seen.world) return { kind: 'world', world: w, level: w * 15 + 1 };
  const it = bestAffordable(s);
  if (it) return { kind: 'shop', item: it };
  return null;
}

// 評星：1 顆＝過關、2＝吃到 ≥ 70% 的蒼蠅、3＝在標準時間 par 內
export function rateStars({ flies, fliesTotal, time, par }: { flies: number; fliesTotal: number; time: number; par: number }) {
  const fliesNeed = Math.ceil(fliesTotal * 0.7), fliesOk = flies >= fliesNeed, timeOk = time <= par;
  return { stars: 1 + (fliesOk ? 1 : 0) + (timeOk ? 1 : 0), fliesNeed, fliesOk, timeOk };
}
// 每關只留最佳星數：新的比舊的低不覆蓋。回傳這次是否刷新
export function recordStars(save: Save, n: number, stars: number): boolean {
  const prev = save.stars[n] ?? 0;
  if (stars > prev) save.stars[n] = stars;
  return stars > prev;
}

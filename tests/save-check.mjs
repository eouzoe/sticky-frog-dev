// 存檔正規化＋下一步推薦＋星數：舊存檔（有 stars／results）載入不報錯、星數沿用、欄位合法。用法：node tests/save-check.mjs
import { normalizeSave, mergeSave, nextStep, DEFAULT_SAVE, ENDLESS_UNLOCK, rateStars, recordStars } from '../src/save.js';
import { addLocal } from '../src/leaderboard.js';
let fails = 0;
const check = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); };
// 第一輪的存檔長這樣
const old = { unlocked: 9, stars: { 1: 3, 2: 2, 3: 1 }, best: { 1: 1200 }, coins: 340, skin: 'dart', trail: 'rainbow', owned: ['tree', 'none', 'dart', 'rainbow'], music: false, sfx: true, results: 8, grabs: 77, last: 8, worldsDone: [] };
const s = normalizeSave(JSON.parse(JSON.stringify(old)), 60);
check('舊存檔：stars 沿用、results 丟掉', s.stars[1] === 3 && s.stars[2] === 2 && s.stars[3] === 1 && !('results' in s));
check('舊存檔：進度、金幣、造型保留', s.unlocked === 9 && s.coins === 340 && s.skin === 'dart' && s.trail === 'rainbow' && s.music === false && s.clears === 8);
check('舊存檔：補上新欄位（舌頭、成就、榜）', s.tongue === 'tongue' && s.owned.includes('tongue') && typeof s.feats === 'object' && Array.isArray(s.lb));
check('舊存檔：已解鎖的無盡模式當作看過、不重推', s.seen.endless === true && nextStep(s)?.kind === 'shop');
check('壞資料不丟例外', ['x', null, 42, [], { unlocked: 'abc', owned: 'no', skin: 'hack', lb: [{ score: 'x' }, { score: 5 }] }].every((r) => { try { const n = normalizeSave(r, 60); return n.unlocked === 1 && n.skin === 'tree' && n.lb.length <= 1; } catch { return false; } }));
check('沒買的角色不能裝備', normalizeSave({ skin: 'cat', owned: ['tree'] }, 60).skin === 'tree');
check('擁有角色＝擁有招牌舌頭', normalizeSave({ owned: ['cat'] }, 60).owned.includes('yarn'));
// 下一步推薦
const base = normalizeSave({}, 60);
check('新玩家沒錢：沒有推薦', nextStep(base) === null);
check('剛破第 5 關：推無盡模式', nextStep({ ...base, unlocked: ENDLESS_UNLOCK + 1 })?.kind === 'endless');
check('剛進新世界：推那個世界', (() => { const n = nextStep({ ...base, unlocked: 16, seen: { endless: true, world: 0 } }); return n?.kind === 'world' && n.level === 16; })());
check('金幣夠買貓：推看板角色', nextStep({ ...base, coins: 320 })?.item?.id === 'cat');
check('金幣夠買拖尾但不夠買貓：推買得起的', nextStep({ ...base, coins: 160 })?.item?.price <= 160);
// 本機榜
const lb = [];
for (const sc of [50, 10, 90, 30]) addLocal(lb, { score: sc });
check('本機榜：排序、名次', lb.map((e) => e.score).join() === '90,50,30,10' && addLocal(lb, { score: 60 }) === 2);
for (let i = 0; i < 20; i++) addLocal(lb, { score: 100 + i });
check('本機榜：只留 10 名、沒進榜回 0', lb.length === 10 && addLocal(lb, { score: 1 }) === 0);
check('DEFAULT_SAVE 的 stars 是空的', typeof DEFAULT_SAVE.stars === 'object' && Object.keys(DEFAULT_SAVE.stars).length === 0);
// 星數
check('壞的 stars 欄位被清掉', (() => { const n = normalizeSave({ stars: { 1: 9, 2: 'x', abc: 2, 999: 3, 4: 0 } }, 60).stars; return n[1] === 3 && !(2 in n) && !(999 in n) && !(4 in n) && Object.keys(n).length === 1; })());
check('新的星數比舊的低時不會覆蓋', (() => { const sv = normalizeSave(old, 60); const up = recordStars(sv, 1, 2); return sv.stars[1] === 3 && up === false; })());
check('新的星數比較高才覆蓋', (() => { const sv = normalizeSave(old, 60); return recordStars(sv, 3, 2) === true && sv.stars[3] === 2 && recordStars(sv, 5, 1) && sv.stars[5] === 1; })());
check('評星：過關 1、蒼蠅 ≥ 70% +1、標準時間內 +1', rateStars({ flies: 0, fliesTotal: 6, time: 99, par: 20 }).stars === 1 && rateStars({ flies: 5, fliesTotal: 6, time: 99, par: 20 }).stars === 2
  && rateStars({ flies: 4, fliesTotal: 6, time: 20, par: 20 }).stars === 2 && rateStars({ flies: 5, fliesTotal: 6, time: 19, par: 20 }).stars === 3 && rateStars({ flies: 0, fliesTotal: 0, time: 1, par: 20 }).stars === 3);
// 8f3974b（60 關上限）格式的存檔：60 關全破＋星數，載入到 75 關的版本
const old60 = { unlocked: 60, stars: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i + 1, 1 + (i % 3)])), best: { 60: 999 }, coins: 5000, skin: 'tree', trail: 'none', owned: ['tree', 'none', 'tongue'], worldsDone: [15, 30, 45, 60], last: 60, seen: { endless: true, world: 3 }, clears: 70 };
const n60 = normalizeSave(JSON.parse(JSON.stringify(old60)), 75);
check('60 關舊存檔：前 60 關星數逐關不變', Array.from({ length: 60 }, (_, i) => n60.stars[i + 1] === 1 + (i % 3)).every(Boolean) && Object.keys(n60.stars).length === 60);
check('60 關舊存檔：第 5 世界解鎖（unlocked=61）', n60.unlocked === 61);
check('60 關舊存檔：下一步推薦冰峰 5-1', (() => { const n = nextStep(n60); return n?.kind === 'world' && n.world === 4 && n.level === 61; })());
check('60 關舊存檔：金幣、最佳分數、已完成世界保留', n60.coins === 5000 && n60.best[60] === 999 && n60.worldsDone.join() === '15,30,45,60');
check('59 關進度的舊存檔：不會被多開世界', normalizeSave({ unlocked: 59, stars: { 58: 2 } }, 75).unlocked === 59);
check('第 60 關沒破（unlocked=60 但沒星）：不開第 5 世界', normalizeSave({ unlocked: 60, stars: { 59: 3 } }, 75).unlocked === 60);
check('新存檔正規化到 75 關：從 1 開始、seen.world=0', (() => { const n = normalizeSave({}, 75); return n.unlocked === 1 && n.seen.world === 0; })());
check('75 關上限：unlocked 超過 75 會被夾回', normalizeSave({ unlocked: 99 }, 75).unlocked === 75 && normalizeSave({ stars: { 75: 2, 76: 3 } }, 75).stars[75] === 2);
check('已進第 5 世界的新存檔：不重複推薦', nextStep({ ...n60, coins: 0, unlocked: 63, seen: { endless: true, world: 4 } }) === null);
// fadd436（75 關上限）格式的存檔：75 關全破＋星數，載入到 90 關的版本
const old75 = { unlocked: 75, stars: Object.fromEntries(Array.from({ length: 75 }, (_, i) => [i + 1, 1 + (i % 3)])), best: { 75: 1234 }, coins: 7000, skin: 'tree', trail: 'none', owned: ['tree', 'none', 'tongue'], worldsDone: [15, 30, 45, 60, 75], last: 75, seen: { endless: true, world: 4 } };
const n75 = normalizeSave(JSON.parse(JSON.stringify(old75)), 90);
check('75 關舊存檔：前 75 關星數逐關不變', Array.from({ length: 75 }, (_, i) => n75.stars[i + 1] === 1 + (i % 3)).every(Boolean) && Object.keys(n75.stars).length === 75);
check('75 關舊存檔：第 6 世界解鎖（unlocked=76）', n75.unlocked === 76);
check('75 關舊存檔：下一步推薦夕陽沙丘 6-1（第 76 關）', (() => { const n = nextStep(n75); return n?.kind === 'world' && n.world === 5 && n.level === 76; })());
check('75 關舊存檔：金幣、最佳分數、已完成世界保留', n75.coins === 7000 && n75.best[75] === 1234 && n75.worldsDone.join() === '15,30,45,60,75');
check('74 關進度的舊存檔：不會被多開世界', normalizeSave({ unlocked: 74, stars: { 73: 2 } }, 90).unlocked === 74);
check('第 75 關沒破（unlocked=75 但沒星）：不開第 6 世界', normalizeSave({ unlocked: 75, stars: { 74: 3 } }, 90).unlocked === 75);
check('90 關上限：unlocked 超過 90 會被夾回', normalizeSave({ unlocked: 999 }, 90).unlocked === 90 && normalizeSave({ stars: { 90: 2, 91: 3 } }, 90).stars[90] === 2);
check('已進第 6 世界的存檔：不重複推薦', nextStep({ ...n75, coins: 0, unlocked: 78, seen: { endless: true, world: 5 } }) === null);
check('60 關舊存檔載入 90 關版：仍然只補到 61、推薦冰峰', (() => { const n = normalizeSave(JSON.parse(JSON.stringify(old60)), 90); return n.unlocked === 61 && nextStep(n)?.world === 4; })());
// Local vs cloud merge (late SDK, two devices): achievements union/max, state follows the newer copy, progress is never lost
const L = normalizeSave({ unlocked: 12, stars: { 1: 3, 2: 2, 11: 1 }, best: { 1: 500 }, coins: 90, owned: ['tree', 'none', 'tongue', 'dart'], skin: 'dart', updatedAt: 2000, feats: { a: { first: '2026-01-02', best: 5, count: 3 } }, lb: [{ score: 50, dist: 10, day: 'd1' }], endlessBest: 300, last: 12 }, 90);
const C = normalizeSave({ unlocked: 9, stars: { 1: 2, 2: 3, 5: 2 }, best: { 1: 800, 5: 100 }, coins: 400, owned: ['tree', 'none', 'tongue', 'rainbow'], trail: 'rainbow', updatedAt: 1000, feats: { a: { first: '2026-01-01', best: 9, count: 1 }, b: { first: '2026-01-03', best: 1, count: 1 } }, lb: [{ score: 70, dist: 20, day: 'd2' }, { score: 50, dist: 10, day: 'd1' }], endlessBest: 100, last: 9, seen: { endless: true, world: 0 } }, 90);
const M = mergeSave(L, C, 90);
check('merge: unlocked, stars, best take the maximum', M.unlocked === 12 && M.stars[1] === 3 && M.stars[2] === 3 && M.stars[5] === 2 && M.stars[11] === 1 && M.best[1] === 800 && M.best[5] === 100);
check('merge: coins, current level, equipment follow the newer copy (local)', M.coins === 90 && M.last === 12 && M.skin === 'dart' && M.trail === 'none');
check('merge: owned is the union, endless best the maximum, seen flags OR', M.owned.includes('dart') && M.owned.includes('rainbow') && M.endlessBest === 300 && M.seen.endless === true);
check('merge: feats keep the copy with more completions, missing ones are added', M.feats.a.count === 3 && M.feats.a.best === 5 && M.feats.b.count === 1);
check('merge: leaderboard merged, deduplicated, sorted', M.lb.map((e) => e.score).join() === '70,50');
check('merge: updatedAt is the maximum and the result is order independent', M.updatedAt === 2000 && JSON.stringify(mergeSave(C, L, 90)) === JSON.stringify(M));
const fresh = normalizeSave({}, 90);
check('new device (empty local) with cloud progress uses the cloud copy', (() => { const m = mergeSave(fresh, C, 90); return m.unlocked === 9 && m.coins === 400 && m.trail === 'rainbow'; })());
check('empty cloud never discards local progress', (() => { const m = mergeSave(L, fresh, 90); return m.unlocked === 12 && m.coins === 90 && m.skin === 'dart'; })());
check('legacy save without a timestamp counts as oldest: progress kept, state from the newer copy', (() => { const legacy = normalizeSave({ unlocked: 20, coins: 999 }, 90); const m = mergeSave(L, legacy, 90); return m.unlocked === 20 && m.coins === 90 && m.updatedAt === 2000; })());
console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);

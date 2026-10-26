// 存檔正規化＋下一步推薦＋星數：舊存檔（有 stars／results）載入不報錯、星數沿用、欄位合法。用法：node tests/save-check.mjs
import { normalizeSave, nextStep, DEFAULT_SAVE, ENDLESS_UNLOCK, rateStars, recordStars } from '../src/save.js';
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
console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);

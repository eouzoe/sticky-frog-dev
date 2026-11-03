// 存檔正規化＋下一步推薦＋星數：舊存檔（有 stars／results）載入不報錯、星數沿用、欄位合法。
import { describe, expect, it } from 'vitest';
import { normalizeSave, mergeSave, nextStep, DEFAULT_SAVE, ENDLESS_UNLOCK, rateStars, recordStars, type LbEntry } from '../src/save.ts';
import { addLocal } from '../src/leaderboard.ts';

// 第一輪的存檔長這樣
const old = {
  unlocked: 9,
  stars: { 1: 3, 2: 2, 3: 1 },
  best: { 1: 1200 },
  coins: 340,
  skin: 'dart',
  trail: 'rainbow',
  owned: ['tree', 'none', 'dart', 'rainbow'],
  music: false,
  sfx: true,
  results: 8,
  grabs: 77,
  last: 8,
  worldsDone: [],
};
const s = normalizeSave(JSON.parse(JSON.stringify(old)), 60);

describe('舊存檔正規化', () => {
  it('舊存檔：stars 沿用、results 丟掉', () => {
    expect(s.stars[1] === 3 && s.stars[2] === 2 && s.stars[3] === 1 && !('results' in s)).toBe(true);
  });
  it('舊存檔：進度、金幣、造型保留', () => {
    expect(s.unlocked === 9 && s.coins === 340 && s.skin === 'dart' && s.trail === 'rainbow' && s.music === false && s.clears === 8).toBe(true);
  });
  it('舊存檔：補上新欄位（舌頭、成就、榜）', () => {
    expect(s.tongue === 'tongue' && s.owned.includes('tongue') && typeof s.feats === 'object' && Array.isArray(s.lb)).toBe(true);
  });
  it('舊存檔：已解鎖的無盡模式當作看過、不重推', () => {
    expect(s.seen.endless === true && nextStep(s)?.kind === 'shop').toBe(true);
  });
  it('壞資料不丟例外', () => {
    expect(
      ['x', null, 42, [], { unlocked: 'abc', owned: 'no', skin: 'hack', lb: [{ score: 'x' }, { score: 5 }] }].every((r) => {
        try {
          const n = normalizeSave(r, 60);
          return n.unlocked === 1 && n.skin === 'tree' && n.lb.length <= 1;
        } catch {
          return false;
        }
      }),
    ).toBe(true);
  });
  it('沒買的角色不能裝備', () => {
    expect(normalizeSave({ skin: 'cat', owned: ['tree'] }, 60).skin).toBe('tree');
  });
  it('擁有角色＝擁有招牌舌頭', () => {
    expect(normalizeSave({ owned: ['cat'] }, 60).owned.includes('yarn')).toBe(true);
  });
});

// 下一步推薦
const base = normalizeSave({}, 60);
describe('下一步推薦', () => {
  it('新玩家沒錢：沒有推薦', () => {
    expect(nextStep(base)).toBe(null);
  });
  it('剛破第 5 關：推無盡模式', () => {
    expect(nextStep({ ...base, unlocked: ENDLESS_UNLOCK + 1 })?.kind).toBe('endless');
  });
  it('剛進新世界：推那個世界', () => {
    const n = nextStep({ ...base, unlocked: 16, seen: { endless: true, world: 0 } });
    expect(n?.kind === 'world' && n.level === 16).toBe(true);
  });
  it('金幣夠買貓：推看板角色', () => {
    const n = nextStep({ ...base, coins: 320 });
    expect(n?.kind === 'shop' && n.item.id === 'cat').toBe(true);
  });
  it('金幣夠買拖尾但不夠買貓：推買得起的', () => {
    const n = nextStep({ ...base, coins: 160 });
    expect(n?.kind === 'shop' && n.item.price <= 160).toBe(true);
  });
});

describe('本機榜', () => {
  const lb: LbEntry[] = [];
  const entry = (score: number): LbEntry => ({ score, dist: 0, day: '' });
  it('本機榜：排序、名次', () => {
    for (const sc of [50, 10, 90, 30]) addLocal(lb, entry(sc));
    expect(lb.map((e) => e.score).join() === '90,50,30,10' && addLocal(lb, entry(60)) === 2).toBe(true);
  });
  it('本機榜：只留 10 名、沒進榜回 0', () => {
    for (let i = 0; i < 20; i++) addLocal(lb, entry(100 + i));
    expect(lb.length === 10 && addLocal(lb, entry(1)) === 0).toBe(true);
  });
  it('DEFAULT_SAVE 的 stars 是空的', () => {
    expect(typeof DEFAULT_SAVE.stars === 'object' && Object.keys(DEFAULT_SAVE.stars).length === 0).toBe(true);
  });
});

describe('星數', () => {
  it('壞的 stars 欄位被清掉', () => {
    const n = normalizeSave({ stars: { 1: 9, 2: 'x', abc: 2, 999: 3, 4: 0 } }, 60).stars;
    expect(n[1] === 3 && !(2 in n) && !(999 in n) && !(4 in n) && Object.keys(n).length === 1).toBe(true);
  });
  it('新的星數比舊的低時不會覆蓋', () => {
    const sv = normalizeSave(old, 60);
    const up = recordStars(sv, 1, 2);
    expect(sv.stars[1] === 3 && up === false).toBe(true);
  });
  it('新的星數比較高才覆蓋', () => {
    const sv = normalizeSave(old, 60);
    expect(recordStars(sv, 3, 2) === true && sv.stars[3] === 2 && recordStars(sv, 5, 1) && sv.stars[5] === 1).toBe(true);
  });
  it('評星：過關 1、蒼蠅 ≥ 70% +1、標準時間內 +1', () => {
    expect(
      rateStars({ flies: 0, fliesTotal: 6, time: 99, par: 20 }).stars === 1 &&
        rateStars({ flies: 5, fliesTotal: 6, time: 99, par: 20 }).stars === 2 &&
        rateStars({ flies: 4, fliesTotal: 6, time: 20, par: 20 }).stars === 2 &&
        rateStars({ flies: 5, fliesTotal: 6, time: 19, par: 20 }).stars === 3 &&
        rateStars({ flies: 0, fliesTotal: 0, time: 1, par: 20 }).stars === 3,
    ).toBe(true);
  });
});

// 8f3974b（60 關上限）格式的存檔：60 關全破＋星數，載入到 75 關的版本
const old60 = {
  unlocked: 60,
  stars: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i + 1, 1 + (i % 3)])),
  best: { 60: 999 },
  coins: 5000,
  skin: 'tree',
  trail: 'none',
  owned: ['tree', 'none', 'tongue'],
  worldsDone: [15, 30, 45, 60],
  last: 60,
  seen: { endless: true, world: 3 },
  clears: 70,
};
const n60 = normalizeSave(JSON.parse(JSON.stringify(old60)), 75);
describe('60 關上限格式的舊存檔載入 75 關版', () => {
  it('60 關舊存檔：前 60 關星數逐關不變', () => {
    expect(Array.from({ length: 60 }, (_, i) => n60.stars[i + 1] === 1 + (i % 3)).every(Boolean) && Object.keys(n60.stars).length === 60).toBe(true);
  });
  it('60 關舊存檔：第 5 世界解鎖（unlocked=61）', () => {
    expect(n60.unlocked).toBe(61);
  });
  it('60 關舊存檔：下一步推薦冰峰 5-1', () => {
    const n = nextStep(n60);
    expect(n?.kind === 'world' && n.world === 4 && n.level === 61).toBe(true);
  });
  it('60 關舊存檔：金幣、最佳分數、已完成世界保留', () => {
    expect(n60.coins === 5000 && n60.best[60] === 999 && n60.worldsDone.join() === '15,30,45,60').toBe(true);
  });
  it('59 關進度的舊存檔：不會被多開世界', () => {
    expect(normalizeSave({ unlocked: 59, stars: { 58: 2 } }, 75).unlocked).toBe(59);
  });
  it('第 60 關沒破（unlocked=60 但沒星）：不開第 5 世界', () => {
    expect(normalizeSave({ unlocked: 60, stars: { 59: 3 } }, 75).unlocked).toBe(60);
  });
  it('新存檔正規化到 75 關：從 1 開始、seen.world=0', () => {
    const n = normalizeSave({}, 75);
    expect(n.unlocked === 1 && n.seen.world === 0).toBe(true);
  });
  it('75 關上限：unlocked 超過 75 會被夾回', () => {
    expect(normalizeSave({ unlocked: 99 }, 75).unlocked === 75 && normalizeSave({ stars: { 75: 2, 76: 3 } }, 75).stars[75] === 2).toBe(true);
  });
  it('已進第 5 世界的新存檔：不重複推薦', () => {
    expect(nextStep({ ...n60, coins: 0, unlocked: 63, seen: { endless: true, world: 4 } })).toBe(null);
  });
});

// fadd436（75 關上限）格式的存檔：75 關全破＋星數，載入到 90 關的版本
const old75 = {
  unlocked: 75,
  stars: Object.fromEntries(Array.from({ length: 75 }, (_, i) => [i + 1, 1 + (i % 3)])),
  best: { 75: 1234 },
  coins: 7000,
  skin: 'tree',
  trail: 'none',
  owned: ['tree', 'none', 'tongue'],
  worldsDone: [15, 30, 45, 60, 75],
  last: 75,
  seen: { endless: true, world: 4 },
};
const n75 = normalizeSave(JSON.parse(JSON.stringify(old75)), 90);
describe('75 關上限格式的舊存檔載入 90 關版', () => {
  it('75 關舊存檔：前 75 關星數逐關不變', () => {
    expect(Array.from({ length: 75 }, (_, i) => n75.stars[i + 1] === 1 + (i % 3)).every(Boolean) && Object.keys(n75.stars).length === 75).toBe(true);
  });
  it('75 關舊存檔：第 6 世界解鎖（unlocked=76）', () => {
    expect(n75.unlocked).toBe(76);
  });
  it('75 關舊存檔：下一步推薦夕陽沙丘 6-1（第 76 關）', () => {
    const n = nextStep(n75);
    expect(n?.kind === 'world' && n.world === 5 && n.level === 76).toBe(true);
  });
  it('75 關舊存檔：金幣、最佳分數、已完成世界保留', () => {
    expect(n75.coins === 7000 && n75.best[75] === 1234 && n75.worldsDone.join() === '15,30,45,60,75').toBe(true);
  });
  it('74 關進度的舊存檔：不會被多開世界', () => {
    expect(normalizeSave({ unlocked: 74, stars: { 73: 2 } }, 90).unlocked).toBe(74);
  });
  it('第 75 關沒破（unlocked=75 但沒星）：不開第 6 世界', () => {
    expect(normalizeSave({ unlocked: 75, stars: { 74: 3 } }, 90).unlocked).toBe(75);
  });
  it('90 關上限：unlocked 超過 90 會被夾回', () => {
    expect(normalizeSave({ unlocked: 999 }, 90).unlocked === 90 && normalizeSave({ stars: { 90: 2, 91: 3 } }, 90).stars[90] === 2).toBe(true);
  });
  it('已進第 6 世界的存檔：不重複推薦', () => {
    expect(nextStep({ ...n75, coins: 0, unlocked: 78, seen: { endless: true, world: 5 } })).toBe(null);
  });
  it('60 關舊存檔載入 90 關版：仍然只補到 61、推薦冰峰', () => {
    const n = normalizeSave(JSON.parse(JSON.stringify(old60)), 90);
    const step = nextStep(n);
    expect(n.unlocked === 61 && step?.kind === 'world' && step.world === 4).toBe(true);
  });
});

// 本機與雲端合併（SDK 晚到、兩台裝置）：成就取並集／最大、狀態聽較新的、永遠不丟進度
const L = normalizeSave(
  {
    unlocked: 12,
    stars: { 1: 3, 2: 2, 11: 1 },
    best: { 1: 500 },
    coins: 90,
    owned: ['tree', 'none', 'tongue', 'dart'],
    skin: 'dart',
    updatedAt: 2000,
    feats: { a: { first: '2026-01-02', best: 5, count: 3 } },
    lb: [{ score: 50, dist: 10, day: 'd1' }],
    endlessBest: 300,
    last: 12,
  },
  90,
);
const C = normalizeSave(
  {
    unlocked: 9,
    stars: { 1: 2, 2: 3, 5: 2 },
    best: { 1: 800, 5: 100 },
    coins: 400,
    owned: ['tree', 'none', 'tongue', 'rainbow'],
    trail: 'rainbow',
    updatedAt: 1000,
    feats: { a: { first: '2026-01-01', best: 9, count: 1 }, b: { first: '2026-01-03', best: 1, count: 1 } },
    lb: [
      { score: 70, dist: 20, day: 'd2' },
      { score: 50, dist: 10, day: 'd1' },
    ],
    endlessBest: 100,
    last: 9,
    seen: { endless: true, world: 0 },
  },
  90,
);
const M = mergeSave(L, C, 90);
describe('本機與雲端合併', () => {
  it('合併：解鎖、星數、最佳分取最大', () => {
    expect(M.unlocked === 12 && M.stars[1] === 3 && M.stars[2] === 3 && M.stars[5] === 2 && M.stars[11] === 1 && M.best[1] === 800 && M.best[5] === 100).toBe(true);
  });
  it('合併：金幣、目前關卡、裝備聽較新的（本機）', () => {
    expect(M.coins === 90 && M.last === 12 && M.skin === 'dart' && M.trail === 'none').toBe(true);
  });
  it('合併：擁有物取並集、無盡紀錄取最大、看過的取 OR', () => {
    expect(M.owned.includes('dart') && M.owned.includes('rainbow') && M.endlessBest === 300 && M.seen.endless === true).toBe(true);
  });
  it('合併：成就拿次數多的那份、沒有的補上', () => {
    expect(M.feats.a.count === 3 && M.feats.a.best === 5 && M.feats.b.count === 1).toBe(true);
  });
  it('合併：榜合併、去重、排序', () => {
    expect(M.lb.map((e) => e.score).join()).toBe('70,50');
  });
  it('合併：updatedAt 取最大、順序無關', () => {
    expect(M.updatedAt === 2000 && JSON.stringify(mergeSave(C, L, 90)) === JSON.stringify(M)).toBe(true);
  });
  const fresh = normalizeSave({}, 90);
  it('新裝置（本機空的）：雲端有進度 → 用雲端的', () => {
    const m = mergeSave(fresh, C, 90);
    expect(m.unlocked === 9 && m.coins === 400 && m.trail === 'rainbow').toBe(true);
  });
  it('雲端是空的：本機進度不會被丟掉', () => {
    const m = mergeSave(L, fresh, 90);
    expect(m.unlocked === 12 && m.coins === 90 && m.skin === 'dart').toBe(true);
  });
  it('舊格式存檔（沒時間戳）視為最舊：進度保留、狀態聽新的', () => {
    const legacy = normalizeSave({ unlocked: 20, coins: 999 }, 90);
    const m = mergeSave(L, legacy, 90);
    expect(m.unlocked === 20 && m.coins === 90 && m.updatedAt === 2000).toBe(true);
  });
});

// 主題資料包（旋轉貓組合包）：擁有＝買整套（set:cat）或單品集齊；theme 只在擁有時保留；系列關卡 91–100 的星數收、101 丟
describe('主題資料包', () => {
  it('主題：單品集齊＝擁有整套、theme 保留、系列關卡星數保留、超出的丟掉', () => {
    const th = normalizeSave({ owned: ['tree', 'none', 'tongue', 'cat', 'yarn', 'wool'], theme: 'cat', skin: 'cat', stars: { 91: 2, 100: 3, 101: 1 }, best: { 95: 10 } }, 90);
    expect(th.theme === 'cat' && th.stars[91] === 2 && th.stars[100] === 3 && !(101 in th.stars) && th.best[95] === 10).toBe(true);
  });
  it('主題：沒擁有就不能套用；買整套的 id 也算', () => {
    expect(normalizeSave({ theme: 'cat' }, 90).theme === '' && normalizeSave({ theme: 'cat', owned: ['set:cat'] }, 90).theme === 'cat').toBe(true);
  });
  it('主題：合併聽較新的、特價起算取最早的非零', () => {
    const A = normalizeSave({ updatedAt: 2, theme: 'cat', owned: ['cat', 'yarn', 'wool'] }, 90),
      B = normalizeSave({ updatedAt: 1, saleAt: 300 }, 90);
    const M2 = mergeSave(A, B, 90);
    expect(M2.theme === 'cat' && M2.saleAt === 300 && mergeSave(B, A, 90).theme === 'cat').toBe(true);
  });
});

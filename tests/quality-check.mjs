// 畫質分級的純邏輯檢查：開局訊號 → 級別、自動調整的降／升／禁止反覆。用法：node tests/quality-check.mjs
import assert from 'node:assert/strict';
import { pickTier, createGovernor, TIERS, ORDER } from '../src/quality.ts';

const pick = (o) => pickTier({ search: '', ...o }).tier;
assert.equal(pick({ coarse: false, cores: 12, mem: 8 }), 'high', '強桌機 → high');
assert.equal(pick({ coarse: false, cores: 4, mem: 8 }), 'mid', '4 核桌機 → mid');
assert.equal(pick({ coarse: true, cores: 8, mem: 0 }), 'mid', 'iPhone 類（沒有 deviceMemory）→ mid');
assert.equal(pick({ coarse: true, cores: 8, mem: 4 }), 'low', '4GB 安卓 → low');
assert.equal(pick({ coarse: true, cores: 4, mem: 8 }), 'low', '4 核手機 → low');
assert.equal(pickTier({ search: '?q=mid', coarse: false, cores: 12, mem: 8 }).forced, true, '?q= 強制');
assert.equal(pickTier({ coarse: true, cores: 8, mem: 8, search: '' }).max, 'mid', '手機最高 mid');
for (const k of ORDER) assert.ok(TIERS[k].dpr > 0 && TIERS[k].fx > 0, `${k} 欄位齊全`);

const run = (g, fpsList) => fpsList.map((f) => g.tick(f));
// 降：單秒 20 fps 立刻降；連續 2 秒 45 fps 降；單秒 45 fps 不降
let g = createGovernor({ tier: 'high' });
assert.equal(g.tick(20), 'mid', '單秒 < 36 立刻降');
g = createGovernor({ tier: 'high' });
assert.deepEqual(run(g, [45, 60, 45]), [null, null, null], '45 不連續 → 不降');
g = createGovernor({ tier: 'high' });
assert.deepEqual(run(g, [45, 45]), [null, 'mid'], '連續 2 秒 < 48 → 降');
assert.equal(createGovernor({ tier: 'low' }).tick(10), null, 'low 不會再降');
// 升：19 秒好不升，第 20 秒好且距離上次換級 ≥ 30 才升
g = createGovernor({ tier: 'mid', max: 'high' });
const seq = Array(29).fill(60); assert.ok(run(g, seq).every((x) => x === null), '30 秒內不升');
assert.equal(g.tick(60), 'high', '開局 30 秒後且連續 20 秒好 → 升');
g = createGovernor({ tier: 'mid', max: 'mid' });
assert.ok(run(g, Array(100).fill(60)).every((x) => x === null), '到達 max 不再升');
// 升上去 25 秒內又掉 → 禁止，之後再怎麼好都不升回去
g = createGovernor({ tier: 'mid', max: 'high' });
run(g, Array(30).fill(60)); // 第 30 秒升到 high
assert.equal(g.tier, 'high');
assert.equal(g.tick(20), 'mid', '升上去馬上掉 → 降');
assert.ok(run(g, Array(200).fill(60)).every((x) => x === null), 'high 被禁止，不再升回');
// forced 不動
g = createGovernor({ tier: 'high', forced: true });
assert.ok(run(g, Array(10).fill(5)).every((x) => x === null), '強制級別不自動調整');
console.log('quality-check OK');

// 成就偵測模組：每種成就各餵一段「達成」與「差一點沒達成」的事件序列。用法：node tests/feats-check.mjs
import { FEAT_T as K, FEATS, createFeatTracker, recordFeat } from '../src/feats.ts';
import { TUNE as T } from '../src/config.ts';

const W = T.WATER_Y + 0.15;
const lv = (len = 100) => ({ endless: false, start: { x: 0 }, goal: { x: len } });
const sim = (o = {}) => ({ mode: 'air', x: 0, y: 8, vx: 20, vy: 0, attaches: 3, time: 5, level: lv(), ...o });
let fails = 0;
function check(name, want, got) {
  const ok = JSON.stringify(want) === JSON.stringify(got);
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} → ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(want)})`}`);
}
const ids = (arr) => arr.filter((f) => !f.silent).map((f) => f.id);
// 跑一段：steps＝[[sim 欄位, 事件|null], …]，回傳全部達成的 id
function play(steps, s0 = sim()) {
  const ft = createFeatTracker(), got = [], s = { ...s0 };
  for (const [patch, e] of steps) {
    Object.assign(s, patch);
    got.push(...ids(ft.tick(s, 1 / 120)));
    if (e) got.push(...ids(ft.event(e, s)));
  }
  return got;
}

// spin／tornado
check('spin 達成（5 圈）', ['spin'], play([1, 2, 3, 4, 5].map((n) => [{}, { type: 'flip', n }])));
check('spin 差一點（4 圈）', [], play([1, 2, 3, 4].map((n) => [{}, { type: 'flip', n }])));
check('tornado 達成（7 圈，spin 只跳一次）', ['spin', 'tornado'], play([1, 2, 3, 4, 5, 6, 7].map((n) => [{}, { type: 'flip', n }])));
check('tornado 差一點（6 圈）', ['spin'], play([1, 2, 3, 4, 5, 6].map((n) => [{}, { type: 'flip', n }])));

// flow：停滯總秒數
const fast = Array.from({ length: 600 }, () => [{ vx: 20 }, null]);
const slow = (sec) => Array.from({ length: Math.round(sec * 120) }, () => [{ vx: 3 }, null]);
const win = [[{}, { type: 'win' }]];
check('flow 達成（停滯 0.05 秒）', ['flow'], play([...fast, ...slow(0.05), ...fast, ...win], sim({ time: 99 })));
check('flow 差一點（停滯 0.15 秒）', [], play([...fast, ...slow(0.15), ...fast, ...win], sim({ time: 99 })));

// speed：平均速度＝長度／時間
check('speed 達成', ['speed'], play(win, sim({ time: 100 / (K.SPEED + 0.2) })).filter((id) => id === 'speed'));
check('speed 差一點', [], play(win, sim({ time: 100 / (K.SPEED - 0.2) })).filter((id) => id === 'speed'));

// skim：掉到離落水線 SKIM_Y 以內又飛回去
const dip = (low) => [[{ y: W + 2.5, vx: 3 }, null], [{ y: W + low }, null], [{ y: W + 2 }, null], [{ y: W + K.SKIM_BACK + 0.5 }, null]];
check('skim 達成', ['skim'], play(dip(K.SKIM_Y - 0.1)));
// 沙丘上方不是水：同樣的低飛，level 有沙丘蓋住那個 x 就不算，沒有就照算
const sandLv = { ...lv(), dunes: [{ x0: -5, x1: 5, H: 2, lip: false }] };
check('skim：低飛在沙丘上方不算 WAVE KISSER', [], play(dip(K.SKIM_Y - 0.1).map(([p, e]) => [{ ...p, level: sandLv }, e])));
check('skim 差一點（太高）', [], play(dip(K.SKIM_Y + 0.1)));
check('skim 沒救回來（落水）', [], play([[{ y: W + 2.5 }, null], [{ y: W + 0.1 }, null], [{ mode: 'dead' }, { type: 'die' }], [{ mode: 'air', y: 9 }, null]]));

// shave：擦過危險物的最近距離
check('shave 達成', ['shave'], play([[{}, { type: 'close', gap: K.SHAVE - 0.02 }]]));
check('shave 差一點', [], play([[{}, { type: 'close', gap: K.SHAVE + 0.02 }]]));

// clutch：快落水時黏住、之後拉回高處
const clutch = (fy, fvy) => [[{}, { type: 'attach', fy: W + fy, fvy }], [{ mode: 'swing', y: W + 3 }, null], [{ y: W + K.CLUTCH_BACK + 0.5 }, null]];
check('clutch 達成', ['clutch'], play(clutch(K.CLUTCH_Y - 0.3, K.CLUTCH_VY - 3)));
check('clutch 差一點（黏得太高）', [], play(clutch(K.CLUTCH_Y + 0.3, K.CLUTCH_VY - 3)));
check('clutch：在沙丘上方黏住不算 CLUTCH SAVE', [], play(clutch(K.CLUTCH_Y - 0.3, K.CLUTCH_VY - 3).map(([p, e]) => [{ ...p, level: sandLv }, e]), sim({ level: sandLv })));
check('clutch 差一點（沒在往下掉）', [], play(clutch(K.CLUTCH_Y - 0.3, K.CLUTCH_VY + 3)));

// 紀錄：第一次日期、最佳值、次數
const rec = {};
recordFeat(rec, 'shave', 0.1, new Date(2026, 9, 26)); recordFeat(rec, 'shave', 0.05); recordFeat(rec, 'shave', 0.2);
check('紀錄：首次日期本地、最佳取小、次數', { first: '2026-10-26', best: 0.05, count: 3 }, rec.shave);
// 滑沙不算停下：同樣停滯 0.2 秒的速度（< STALL_V），貼著沙面（onDune ≥ 0）不計、離開沙面照算
check('NONSTOP：滑沙中速度低於門檻不算停滯', ['flow'], play([...fast, ...slow(0.2).map(([p, e]) => [{ ...p, onDune: 0 }, e]), ...fast, ...win], sim({ time: 99 })));
check('NONSTOP：同樣的低速離開沙面就算停滯', [], play([...fast, ...slow(0.2).map(([p, e]) => [{ ...p, onDune: -1 }, e]), ...fast, ...win], sim({ time: 99 })));
check('每種成就都有測到', true, FEATS.every((f) => ['spin', 'tornado', 'flow', 'speed', 'skim', 'shave', 'clutch'].includes(f.id)) && FEATS.length === 7);

console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);

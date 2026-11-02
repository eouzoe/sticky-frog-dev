// 流程狀態機：一局之內的轉移、非法動作被忽略、暫停回到原來的節拍。用法：bun tests/flow-check.mjs
import { transition, BOOT_FLOW, RUN } from '../src/flow.ts';
let fails = 0;
const check = (name, ok) => { if (!ok) fails++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`); };
// 連續動作：每一步都要合法，回最後的狀態
const run = (f, ...acts) => { for (const a of acts) { const n = transition(f, a); if (!n) throw new Error(`${f.phase} + ${a} 不合法`); f = n; } return f; };
const phases = (f, ...acts) => { const out = []; for (const a of acts) { f = transition(f, a); if (!f) return out.concat('null'); out.push(f.phase); } return out; };

check('開機 → 選單 → 開關 → 死亡 → 重生 → 過關 → 下一關', phases(BOOT_FLOW, 'ready', 'start', 'die', 'beatEnd', 'win', 'beatEnd').join() === 'menu,playing,dying,playing,cleared,playing');
check('最後一關過關 → 回選單', run(BOOT_FLOW, 'ready', 'startLast', 'win', 'beatEnd').phase === 'menu');
check('不是最後一關 → 下一關仍在遊玩', run(BOOT_FLOW, 'ready', 'start', 'win', 'beatEnd').phase === 'playing');
check('無盡：死亡直接進結算（不是 dying）、倒數完新一局仍是無盡', (() => { const f = run(BOOT_FLOW, 'ready', 'startEndless', 'die'); const g = transition(f, 'beatEnd'); return f.phase === 'over' && f.endless && g.phase === 'playing' && g.endless; })());
check('無盡沒有過關', transition(run(BOOT_FLOW, 'ready', 'startEndless'), 'win') === null);
check('死亡中再死、過關中再撞：忽略', ['dying', 'cleared', 'over'].every((p) => transition({ ...BOOT_FLOW, phase: p }, 'die') === null && transition({ ...BOOT_FLOW, phase: p }, 'win') === null));
check('遊玩中沒有節拍可以結束', transition({ ...BOOT_FLOW, phase: 'playing' }, 'beatEnd') === null);
check('開機前不能開關、開機後不能再 ready', transition(BOOT_FLOW, 'start') === null && transition({ ...BOOT_FLOW, phase: 'menu' }, 'ready') === null);
check('暫停只在一局之內；繼續回到暫停前的節拍', [...RUN].every((p) => { const f = transition({ ...BOOT_FLOW, phase: p }, 'pause'); return f?.phase === 'paused' && f.prev === p && transition(f, 'resume')?.phase === p; }) && ['menu', 'levels', 'shop', 'paused'].every((p) => transition({ ...BOOT_FLOW, phase: p }, 'pause') === null));
check('過關節拍中暫停、繼續、節拍播完 → 下一關', phases({ ...BOOT_FLOW, phase: 'playing' }, 'win', 'pause', 'resume', 'beatEnd').join() === 'cleared,paused,cleared,playing');
check('結算提前：節拍中直接開一關（從選關／重來）', ['cleared', 'over', 'dying', 'paused'].every((p) => transition({ ...BOOT_FLOW, phase: p, endless: true }, 'start')?.endless === false));
check('任何畫面都能回選單、開機中不行', ['menu', 'playing', 'paused', 'cleared', 'over', 'levels'].every((p) => transition({ ...BOOT_FLOW, phase: p }, 'menu')?.phase === 'menu') && transition(BOOT_FLOW, 'menu') === null);
check('transition 不改輸入', (() => { const f = { ...BOOT_FLOW, phase: 'playing' }; transition(f, 'die'); return f.phase === 'playing'; })());
console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);

// 節拍表：長度在設計範圍內、提示點順序、逐幀取提示點不漏不重。用法：bun tests/beat-check.mjs
import { clearBeat, overBeat, dyingBeat, fired, COUNTDOWN } from '../src/beat.ts';
let fails = 0;
const check = (name, ok) => {
  if (!ok) fails++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
};
const cues = (b) => b.cues.map((c) => c.cue);
const sorted = (b) => b.cues.every((c, i) => i === 0 || c.at >= b.cues[i - 1].at);
const inside = (b) => b.cues.every((c) => c.at >= 0 && c.at < b.total) && b.skipAfter > 0 && b.skipAfter < b.total;
const big = clearBeat(3, false),
  bigBest = clearBeat(2, true),
  small = clearBeat(1, false),
  over = overBeat(),
  dying = dyingBeat(0.5);

check('豪爽約 2.0 s、可惜約 1.4 s、無盡約 2.3 s', Math.abs(big.total - 2.0) < 0.15 && Math.abs(small.total - 1.4) < 0.15 && Math.abs(over.total - (0.8 + COUNTDOWN)) < 1e-9);
check('可惜比豪爽短至少 0.4 s', big.total - small.total >= 0.4);
check(
  '提示點都在節拍內、照時間排好',
  [big, bigBest, small, over, dying].every((b) => sorted(b) && inside(b)),
);
check(
  '三顆星依序、等間隔',
  [big, small].every((b) => {
    const s = b.cues.filter((c) => c.cue.startsWith('star'));
    return cues({ cues: s }).join() === 'star1,star2,star3' && Math.abs(s[2].at - s[1].at - (s[1].at - s[0].at)) < 1e-9;
  }),
);
check('豪爽：星星之後金幣噴出再飛入；可惜：直接飛入、不噴出', cues(big).join() === 'star1,star2,star3,coinsOut,coinsFly' && cues(small).join() === 'star1,star2,star3,coinsFly');
check('新紀錄：2 星也走豪爽，金幣飛到才貼 NEW BEST', cues(bigBest).join() === 'star1,star2,star3,coinsOut,coinsFly,best' && bigBest.cues.at(-1).at > bigBest.cues.at(-2).at);
check(
  '提前結束要等第三顆星亮了',
  [big, small].every((b) => b.skipAfter === b.cues[2].at),
);
check('無盡：距離、分數、倒數；倒數跑完剛好結束', cues(over).join() === 'dist,score,countdown' && Math.abs(over.cues[2].at + COUNTDOWN - over.total) < 1e-9);
check('主線死亡：沒有提示點、提前最多 0.25 s', dying.cues.length === 0 && dying.total === 0.5 && dying.skipAfter === 0.25 && dyingBeat(0.1).skipAfter === 0.1);
// 逐幀取提示點：不同步長都不漏不重；第一幀從 0 開始能拿到 at=0 的點
for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.05, 0.3]) {
  for (const b of [big, small, over]) {
    const got = [];
    let t = 0;
    while (t < b.total) {
      got.push(...fired(b, t, t + dt));
      t += dt;
    }
    if (got.join() !== cues(b).join()) {
      fails++;
      console.log(`FAIL 逐幀 dt=${dt.toFixed(3)}：${got.join()} ≠ ${cues(b).join()}`);
    }
  }
}
check('逐幀取提示點（5 種步長 × 3 種節拍）', true);
check(
  'fired 含頭不含尾',
  fired(
    {
      total: 1,
      skipAfter: 0.5,
      cues: [
        { at: 0, cue: 'star1' },
        { at: 0.5, cue: 'star2' },
      ],
    },
    0,
    0.5,
  ).join() === 'star1' && fired({ total: 1, skipAfter: 0.5, cues: [{ at: 0.5, cue: 'star2' }] }, 0.5, 0.6).join() === 'star2',
);
check('提前結束：t1=Infinity 拿到剩下全部', fired(big, big.cues[2].at, Infinity).join() === 'star3,coinsOut,coinsFly');
console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);

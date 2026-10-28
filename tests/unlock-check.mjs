// 掃 generateLevel：每個基本元素第一次出現的關卡必須等於 UNLOCK 表（NEW 字卡的依據）。exit 1＝對不上。
import { generateLevel, LEVEL_COUNT, NEW_AT } from '../src/level.js';
const has = {
  mush: (L) => L.mush.length > 0 && L.mush.length > L._chainMush, ring: (L) => L.rings.length > 0,
  move: (L) => L.hooks.some((h) => h.move), spikeLow: (L) => L.spikes.some((s) => s.pole && !L._tun.has(s)),
  fan: (L) => L.fans.length > 0, saw: (L) => L.saws.length > 0, spikeHigh: (L) => L.spikes.some((s) => s.hang && !L._tun.has(s)),
  swarm: (L) => L.flies.length > 0, mushChain: null, ringArc: null, tunnel: null,
};
// 只有用幾何能辨識的元素才掃；mushChain／ringArc／tunnel 用特徵：連續蘑菇＝同 y=2 的相鄰蘑菇、雙圈＝同段兩圈 x 差 <4、夾擊＝同 x 的 pole＋hang
function seen(L) {
  const o = {};
  o.mush = L.mush.some((m) => m.y > 2.01 || m.y < 1.99) ;
  o.ring = L.rings.length > 0;
  o.move = L.hooks.some((h) => h.move);
  o.fan = L.fans.length > 0; o.saw = L.saws.length > 0;
  o.tunnel = L.spikes.some((a) => a.pole && L.spikes.some((b) => b.hang && Math.abs(a.x - b.x) < 1e-9));
  o.spikeLow = L.spikes.some((a) => a.pole && !L.spikes.some((b) => b.hang && Math.abs(a.x - b.x) < 1e-9));
  o.spikeHigh = L.spikes.some((a) => a.hang && !L.spikes.some((b) => b.pole && Math.abs(a.x - b.x) < 1e-9));
  o.mushChain = L.mush.filter((m) => m.y === 2).length >= 2;
  o.ringArc = L.rings.some((a) => L.rings.some((b) => a !== b && Math.abs(a.x - b.x) < 5 && Math.abs(a.y - b.y) > 1.5 && Math.abs(a.y - b.y) < 2.5));
  o.pad = L.pads.length > 0; o.boost = L.boosts.some((b) => !b.off);
  return o;
}
let bad = 0; const first = {};
for (let n = 1; n <= LEVEL_COUNT; n++) { const o = seen(generateLevel(n)); for (const k in o) if (o[k] && first[k] === undefined) first[k] = n; }
for (const k of Object.keys(NEW_AT)) {
  if (k === 'swarm') continue; // 蒼蠅串與一般蒼蠅幾何上分不開，靠 UNLOCK 表
  const ok = first[k] === NEW_AT[k]; if (!ok) bad++;
  console.log(`${k.padEnd(9)} 表=${NEW_AT[k]} 掃到第一次=${first[k]} ${ok ? 'ok' : 'FAIL'}`);
}
process.exit(bad ? 1 : 0);

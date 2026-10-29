// 模型分包表檢查：public/models 的每個 GLB 恰好在一個包裡、包裡每個名字都有檔案、artkit 的 MODELS 與 BG_SETS 用到的都找得到；
// 加 --dist <資料夾> 時再驗打包結果（.pack 標頭長度總和對得上、dist 沒留已合併的 GLB）。用法：node tests/packs-check.mjs [--dist dist]
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { PACKS } from '../src/packs-table.js';
import { MODELS, BG_SETS } from '../src/artkit.js';

const files = readdirSync(new URL('../public/models/', import.meta.url)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4));
const inPacks = Object.values(PACKS).flat();
assert.equal(new Set(inPacks).size, inPacks.length, '同一個 GLB 不能在兩個包裡');
for (const n of inPacks) assert.ok(files.includes(n), `包裡的 ${n} 沒有對應的 GLB 檔`);
for (const n of files) assert.ok(inPacks.includes(n), `${n}.glb 沒有放進任何包（packs-table.js）`);
for (const n of [...MODELS, ...BG_SETS.flat()]) assert.ok(inPacks.includes(n), `artkit 用到的 ${n} 不在任何包裡`);
const di = process.argv.indexOf('--dist');
if (di > 0) {
  const dist = process.argv[di + 1];
  for (const [name, list] of Object.entries(PACKS)) {
    const b = readFileSync(`${dist}/models/${name}.pack`), hl = b.readUInt32LE(0), head = JSON.parse(b.subarray(4, 4 + hl).toString());
    assert.deepEqual(head.map((h) => h[0]), list, `${name} 標頭名單`);
    assert.equal(4 + hl + head.reduce((a, h) => a + h[1], 0), b.length, `${name} 長度`);
    for (const n of list) assert.ok(!existsSync(`${dist}/models/${n}.glb`), `dist 不該留 ${n}.glb`);
  }
}
console.log(`packs-check OK（${files.length} 個 GLB / ${Object.keys(PACKS).length} 包）`);

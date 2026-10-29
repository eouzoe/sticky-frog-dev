// 模型分包表：vite.config.js 打包時把 public/models/*.glb 合併成幾個 .pack（少請求、一個包一次下載），src/art.js 執行時照名字載入。
// 新增 GLB（例如新世界的背景）：加進對應的包；沒列在這裡的 GLB 打包時會留在 dist 原樣（執行時要自己載）。
export const PACKS = {
  // 開機必載：每一關都會用到的道具、預設青蛙、雲
  core: ['char-frog', 'prop-hook', 'prop-goal', 'prop-goalWall', 'prop-mush', 'prop-spike', 'prop-coin', 'prop-fly', 'bg-cloud'],
  // 後面關卡才出現的道具（圈圈第 5 關、風扇第 18 關、鋸片第 22 關、荷葉第 63 關、加速圈第 69 關）：那一關含其中任何一種才載
  props: ['prop-ring', 'prop-fan', 'prop-saw', 'prop-boost', 'prop-pad'],
  // 造型：換到貓、猿或有配件的造型時才載
  'skin-cat': ['char-cat'],
  'skin-ape': ['char-ape'],
  acc: ['acc-band', 'acc-helmet', 'acc-crown'],
  // 世界背景（＋世界專屬道具）：進到那個世界時才載，其餘在第一關開始後於背景載
  'world-0': ['bg-jungle-a', 'bg-jungle-b'],
  'world-1': ['bg-candy-a', 'bg-candy-b'],
  'world-2': ['bg-city-a', 'bg-city-b'],
  'world-3': ['bg-volcano-a', 'bg-volcano-b', 'prop-geyser'],
  'world-4': ['bg-frost-a', 'bg-frost-b', 'bg-frost-c'],
  'world-5': ['bg-dunes-a', 'bg-dunes-b', 'bg-dunes-c'],
};
export const WORLD_COUNT = Object.keys(PACKS).filter((k) => k.startsWith('world-')).length;
export const packUrl = (name) => `./models/${name}.pack`;

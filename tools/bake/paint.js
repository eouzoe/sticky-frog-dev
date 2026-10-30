// 小形狀圖集（粒子、光環、軌道、純白、圓片）：用 src/render/paint.ts 的定義畫一張，交給 run.mjs 寫成 atlas-fx.webp＋json。
// run.mjs 的伺服器會把 .ts 當場轉譯，所以這裡能直接 import 遊戲的原始碼。
import { FX, PARTICLE, paintAtlas } from '/src/render/paint.ts';
try {
  const { cv, w, h, items } = paintAtlas({ ...FX, ...PARTICLE }, 512);
  const frames = {};
  for (const it of items) frames[it.key] = { a: 'fx', x: it.x, y: it.y, w: it.w, h: it.h, ax: +it.ax.toFixed(3), ay: +it.ay.toFixed(3), u: +it.u.toFixed(6) };
  window.__bake = { atlases: { fx: { w, h, webp: cv.toDataURL('image/webp', 0.92) } }, frames };
} catch (e) { window.__bakeError = String(e?.stack ?? e); }

// CrazyGames 需要相對路徑（base: './'），dist 放在任何子路徑底下都能跑。
// 主程式是單一 JS 檔；只有語系拆成各自的小檔（src/i18n.ts 動態 import），開機只抓偵測到的那一個。
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
declare const process: { env: Record<string, string | undefined> }; // Vite 設定檔在 Node 跑；不為這一行裝 @types/node

// VITE_WEB=1：網頁版建置，拿掉 CrazyGames SDK 腳本；預設建置（上傳 CrazyGames 的）不變
const webBuild = (): Plugin => ({
  name: 'web-build',
  transformIndexHtml: { order: 'pre', handler: (html) => (process.env.VITE_WEB ? html.replace(/<!-- SDK[\s\S]*?crazygames-sdk-v3\.js"[^>]*><\/script>\n?/, '') : html) },
});

// 正式建置：選單第一幀一定要的三張圖集（共用、存檔目前的世界、身上的造型）在解析 HTML 時就開始下載＋解碼，
// 跟主程式下載、WebGL 初始化同時進行；src/render/atlas.ts 的 take() 接手。
// 世界與造型照本機存檔算（規則與 main.ts 的 bootAtlases 相同：worldOf(min(last, unlocked, 90))、貓沒有造型圖集），沒存檔就是 w0＋c_tree；
// 猜錯只是多抓一張，main.ts 會再補。存檔鍵與 src/save.ts 的 SAVE_KEY 相同。
const prefetchAtlases = (): Plugin => ({
  name: 'prefetch-atlases',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const u: Record<string, string> = {},
        j: Record<string, string> = {};
      for (const f of Object.keys(ctx.bundle ?? {})) {
        const m = /^assets\/atlas-(\w+)-[\w-]+\.(webp|json)$/.exec(f);
        if (m) (m[2] === 'webp' ? u : j)[m[1]] = `./${f}`;
      }
      for (const k of ['shared', 'fx', 'w0', 'c_tree']) if (!u[k] || !j[k]) throw new Error(`prefetch-atlases：找不到 atlas-${k} 的 webp 或 json`);
      const js =
        `(function(){var u=${JSON.stringify(u)},j=${JSON.stringify(j)},w="w0",c="c_tree";` +
        'try{var s=JSON.parse(localStorage.getItem("sticky-frog-v1")||"null");if(s){var n=Math.min(s.last||1,s.unlocked||1,90);w="w"+Math.min(5,Math.floor((n-1)/15));c=s.skin==="cat"?"":"c_"+s.skin}}catch(e){}' +
        'var p=window.__pre={},q=window.__preMeta={};["shared","fx",w,c].forEach(function(k){if(!u[k])return;p[k]=fetch(u[k]).then(function(r){if(!r.ok)throw Error(r.status);return r.blob()})' +
        '.then(function(b){return createImageBitmap(b,{premultiplyAlpha:"premultiply",colorSpaceConversion:"none"})});p[k].catch(function(){});' +
        'q[k]=fetch(j[k]).then(function(r){if(!r.ok)throw Error(r.status);return r.json()});q[k].catch(function(){})})})();';
      // 插在 <meta charset> 後面：字元編碼宣告要留在檔案前 1024 位元組內
      const meta = '<meta charset="utf-8" />';
      if (!html.includes(meta)) throw new Error('prefetch-atlases：找不到 <meta charset>');
      return html.replace(meta, `${meta}\n<script>${js}</script>`);
    },
  },
});

export default defineConfig({
  base: './',
  plugins: [webBuild(), prefetchAtlases()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  // 規則測試（tests/*.test.ts）的 Vitest 設定也在這裡；server/telemetry 有自己的設定，在 workerd 裡跑
  test: { include: ['tests/**/*.test.ts'] },
});

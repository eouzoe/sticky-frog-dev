// CrazyGames 需要相對路徑（base: './'），dist 放在任何子路徑底下都能跑。
// 主程式是單一 JS 檔；只有語系拆成各自的小檔（src/i18n.ts 動態 import），開機只抓偵測到的那一個。
import type { Plugin, UserConfig } from 'vite';
declare const process: { env: Record<string, string | undefined> }; // Vite 設定檔在 Node 跑；不為這一行裝 @types/node

// VITE_WEB=1：網頁版建置，拿掉 CrazyGames SDK 腳本；預設建置（上傳 CrazyGames 的）不變
const webBuild = (): Plugin => ({
  name: 'web-build',
  transformIndexHtml: { order: 'pre', handler: (html) => (process.env.VITE_WEB ? html.replace(/<!-- SDK[\s\S]*?crazygames-sdk-v3\.js"[^>]*><\/script>\n?/, '') : html) },
});

// 正式建置：第一次來的玩家（本機還沒有存檔）選單一定要的三張圖集（共用、第一個世界、預設造型），
// 在解析 HTML 時就開始下載＋解碼，跟主程式下載、WebGL 初始化同時進行；src/render/atlas.ts 的 take() 接手。
// 有存檔的玩家只先抓共用圖集，其餘由 main.ts 依存檔 prefetch。存檔鍵與 src/save.ts 的 SAVE_KEY 相同。
const prefetchAtlases = (): Plugin => ({
  name: 'prefetch-atlases',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const files = Object.keys(ctx.bundle ?? {});
      const url = (name: string) => {
        const f = files.find((x) => new RegExp(`^assets/atlas-${name}-[\\w-]+\\.webp$`).test(x));
        if (!f) throw new Error(`prefetch-atlases：找不到 atlas-${name}`);
        return `./${f}`;
      };
      const u = { shared: url('shared'), w0: url('w0'), c_tree: url('c_tree') };
      const js = `(function(){var u=${JSON.stringify(u)},n=["shared"];try{if(!localStorage.getItem("sticky-frog-v1"))n.push("w0","c_tree")}catch(e){n.push("w0","c_tree")}`
        + 'var p=window.__pre={};n.forEach(function(k){p[k]=fetch(u[k]).then(function(r){if(!r.ok)throw Error(r.status);return r.blob()})'
        + '.then(function(b){return createImageBitmap(b,{premultiplyAlpha:"premultiply",colorSpaceConversion:"none"})});p[k].catch(function(){})})})();';
      // 插在 <meta charset> 後面：字元編碼宣告要留在檔案前 1024 位元組內
      const meta = '<meta charset="utf-8" />';
      if (!html.includes(meta)) throw new Error('prefetch-atlases：找不到 <meta charset>');
      return html.replace(meta, `${meta}\n<script>${js}</script>`);
    },
  },
});

export default {
  base: './',
  plugins: [webBuild(), prefetchAtlases()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
} satisfies UserConfig;

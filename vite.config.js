// CrazyGames requires relative asset paths
import { readFileSync, existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKS } from './src/packs-table.js';

// 打包時把 public/models/*.glb 合併成 PACKS 裡的 .pack（格式：u32 標頭長度 + JSON [[名字, 長度]…] + 依序串接的 GLB）。
// dist 裡被合併的 GLB 會刪掉（只剩包）；dev 時由中介層即時合併。
const packBuf = (dir, names) => {
  const bufs = names.map((n) => readFileSync(join(dir, `${n}.glb`)));
  const head = Buffer.from(JSON.stringify(names.map((n, i) => [n, bufs[i].length])));
  const len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  return Buffer.concat([len, head, ...bufs]);
};
const modelPacks = () => ({
  name: 'model-packs',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /\/models\/([\w-]+)\.pack(\?|$)/.exec(req.url ?? '');
      if (!m || !PACKS[m[1]]) return next();
      res.setHeader('content-type', 'application/octet-stream'); res.end(packBuf(join(server.config.publicDir, 'models'), PACKS[m[1]]));
    });
  },
  writeBundle(opts) {
    const src = join(process.cwd(), 'public', 'models'), out = join(opts.dir, 'models');
    if (!existsSync(src)) return;
    mkdirSync(out, { recursive: true });
    for (const [name, list] of Object.entries(PACKS)) {
      writeFileSync(join(out, `${name}.pack`), packBuf(src, list));
      for (const n of list) { const f = join(out, `${n}.glb`); if (existsSync(f)) unlinkSync(f); }
    }
  },
});

// VITE_WEB=1：網頁版（Zeabur 等）建置，不放 CrazyGames SDK 腳本；預設建置（上傳 CrazyGames 的）不變
const webBuild = () => ({
  name: 'web-build',
  transformIndexHtml: { order: 'pre', handler: (html) => (process.env.VITE_WEB ? html.replace(/<!-- SDK[\s\S]*?crazygames-sdk-v3\.js"[^>]*><\/script>\n?/, '') : html) },
});

export default { base: './', plugins: [modelPacks(), webBuild()] };

// 測試在 workerd（Workers 的執行環境）裡跑，綁定取自 wrangler.jsonc；D1 是本機的、每個測試檔獨立，不會碰到 Cloudflare。
// migrations/ 在這裡讀進來，經 TEST_MIGRATIONS 綁定交給 test/apply-migrations.ts 套用。
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [cloudflareTest({ remoteBindings: false, wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: { TEST_MIGRATIONS: migrations } } })],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  };
});

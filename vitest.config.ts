// 根目錄的 Vitest 設定：只收 tests/ 底下的 *.test.ts（server/telemetry 有自己的設定，在 workerd 裡跑，與這裡無關）。
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});

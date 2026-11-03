// 只有測試才有的綁定（vitest.config.ts 加的）；正式的 Env 由 wrangler types 產生，這裡用介面合併補上。
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
interface Env {
  TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
}

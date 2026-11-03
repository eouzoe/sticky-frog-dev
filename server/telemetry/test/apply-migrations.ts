// 測試前把 migrations/ 套到本機 D1（vitest.config.ts 讀檔、透過 TEST_MIGRATIONS 綁定送進來）。只套還沒套過的，重跑安全。
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

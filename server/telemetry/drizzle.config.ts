// 只用來從 src/schema.ts 產生 migrations/*.sql（bun run generate）。套用用 wrangler d1 migrations apply，不用 drizzle-kit migrate，所以不需要 D1 的 HTTP 憑證。
import { defineConfig } from 'drizzle-kit';

export default defineConfig({ dialect: 'sqlite', schema: './src/schema.ts', out: './migrations' });

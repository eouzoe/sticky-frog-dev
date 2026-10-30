// Runs the tests inside workerd (the Workers runtime) with the bindings from wrangler.toml.
// D1 is local and isolated per test file; nothing reaches Cloudflare.
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [cloudflareTest({ remoteBindings: false, wrangler: { configPath: './wrangler.toml' } })],
});

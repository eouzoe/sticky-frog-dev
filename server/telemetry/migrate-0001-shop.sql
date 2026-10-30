-- One-off migration for databases created before schema.sql had the shop columns. Fresh databases get them from schema.sql; do not run this on those.
-- npx wrangler d1 execute sticky-frog-telemetry -c wrangler.local.toml --remote --file migrate-0001-shop.sql
ALTER TABLE events ADD COLUMN item TEXT;
ALTER TABLE events ADD COLUMN price INTEGER;
ALTER TABLE events ADD COLUMN coins INTEGER;

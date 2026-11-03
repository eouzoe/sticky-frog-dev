// 匿名遊玩事件。不存 IP、不存 user agent；country 來自 Cloudflare、dev 只是 d(esktop)/m(obile)。
// 改這裡之後：bun run generate（產生 migrations/ 的 SQL），再 bun run migrate:remote 套到線上。
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable(
  'events',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    ts: integer().notNull(), // 伺服器收到的時間（ms）
    anon: text().notNull(), // 匿名 ID（localStorage 裡的隨機 UUID）
    session: text().notNull(), // 每次載入頁面一個
    build: text().notNull(), // 建置版本；'test' 是測試資料
    dev: text(), // d / m
    country: text(),
    origin: text(), // cg（CrazyGames）/ local / other：用來篩掉開發來源
    type: text().notNull(),
    level: integer(),
    x: real(),
    prog: real(), // 0..100（％）
    cause: text(),
    secs: real(),
    stars: integer(),
    n: integer(),
    flies: integer(),
    reason: text(),
    dist: integer(),
    score: integer(),
    item: text(), // shop_want / shop_buy
    price: integer(),
    coins: integer(),
    lang: text(),
    vw: integer(),
    vh: integer(),
    quality: text(),
    bootMs: integer('boot_ms'),
  },
  (t) => [index('idx_events_type_level').on(t.type, t.level), index('idx_events_session').on(t.session), index('idx_events_ts').on(t.ts)],
);

export type EventRow = typeof events.$inferInsert;

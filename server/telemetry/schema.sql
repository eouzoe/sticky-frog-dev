-- 匿名遊玩事件。不存 IP、不存 user agent；country 來自 Cloudflare、dev 只是 d(esktop)/m(obile)。
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,          -- 伺服器收到的時間（ms）
  anon TEXT NOT NULL,           -- 匿名 ID（localStorage 裡的隨機 UUID）
  session TEXT NOT NULL,        -- 每次載入頁面一個
  build TEXT NOT NULL,          -- 建置版本；'test' 是測試資料
  dev TEXT,                     -- d / m
  country TEXT,
  origin TEXT,                  -- cg（CrazyGames）/ local / other：用來篩掉開發來源
  type TEXT NOT NULL,
  level INTEGER, x REAL, prog REAL,  -- prog＝0..100（％）
  cause TEXT, secs REAL, stars INTEGER, n INTEGER, flies INTEGER, reason TEXT,
  dist INTEGER, score INTEGER,
  lang TEXT, vw INTEGER, vh INTEGER, quality TEXT, boot_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_type_level ON events (type, level);
CREATE INDEX IF NOT EXISTS idx_events_session ON events (session);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);

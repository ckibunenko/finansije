CREATE TABLE months (
  id TEXT PRIMARY KEY,
  budget INTEGER NOT NULL DEFAULT 0 CHECK(budget >= 0),
  savings INTEGER NOT NULL DEFAULT 0 CHECK(savings >= 0),
  version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('web', 'gpt', 'import')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  original_payload TEXT NOT NULL
);
CREATE INDEX expenses_date ON expenses(date, deleted_at);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  password_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  password_version TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE oauth_tokens (
  id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL UNIQUE,
  refresh_hash TEXT NOT NULL UNIQUE,
  password_version TEXT NOT NULL,
  access_expires INTEGER NOT NULL,
  refresh_expires INTEGER NOT NULL
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
-- A single-use import lock and the import itself are committed in one batch.
CREATE TABLE imports (id INTEGER PRIMARY KEY CHECK(id = 1), fingerprint TEXT NOT NULL);

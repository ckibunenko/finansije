CREATE TABLE device_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  password_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- SQLite cannot ALTER a CHECK constraint, so expenses is rebuilt to widen `source`.
-- The revision triggers are dropped first: otherwise the bulk copy below would
-- inflate state_revision.version by one per existing row.
DROP TRIGGER expenses_insert_revision;
DROP TRIGGER expenses_update_revision;
DROP TRIGGER expenses_delete_revision;
ALTER TABLE expenses RENAME TO expenses_old;
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount >= 0),
  description TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('web', 'gpt', 'import', 'shortcut', 'viber')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  original_payload TEXT NOT NULL
);
INSERT INTO expenses SELECT id,date,amount,description,source,version,created_at,deleted_at,original_payload FROM expenses_old;
DROP TABLE expenses_old;
CREATE INDEX expenses_date ON expenses(date, deleted_at);
CREATE TRIGGER expenses_insert_revision AFTER INSERT ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER expenses_update_revision AFTER UPDATE ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;
CREATE TRIGGER expenses_delete_revision AFTER DELETE ON expenses BEGIN UPDATE state_revision SET version=version+1 WHERE id=1; END;

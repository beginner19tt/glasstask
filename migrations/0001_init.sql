-- GlassTask schema. D1 = SQLite, so JSON is stored as TEXT and validated in the Worker.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,          -- "google:<sub>" or "dev:<name>"
  email       TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  picture     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'inbox'
                CHECK (status IN ('inbox', 'today', 'doing', 'done', 'archived')),
  priority    INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
  tags        TEXT NOT NULL DEFAULT '[]',
  due_at      TEXT,
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- The only hot query: "give me this user's live tasks, newest first".
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated
  ON tasks (user_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON tasks (user_id, status, deleted_at);

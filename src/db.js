import { createClient } from '@libsql/client';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'adult',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  owner_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL,
  expires_at TEXT,
  removed_at TEXT,
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  role TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  access_hours INTEGER,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'medication',
  time_of_day TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Records are append-only. Corrections live in their own table.
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  kind TEXT NOT NULL,
  schedule_item_id INTEGER REFERENCES schedule_items(id),
  scheduled_for TEXT,
  is_exception INTEGER NOT NULL DEFAULT 0,
  outcome TEXT,
  text TEXT NOT NULL DEFAULT '',
  data TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  reported_at TEXT NOT NULL,
  entered_at TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id),
  source TEXT NOT NULL DEFAULT 'app'
);
CREATE UNIQUE INDEX IF NOT EXISTS one_completion
  ON records(schedule_item_id, scheduled_for)
  WHERE schedule_item_id IS NOT NULL AND is_exception = 0;
CREATE INDEX IF NOT EXISTS records_circle_time ON records(circle_id, entered_at);

CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY,
  record_id INTEGER NOT NULL REFERENCES records(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  new_text TEXT,
  new_reported_at TEXT,
  new_outcome TEXT,
  reason TEXT NOT NULL,
  entered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  from_user INTEGER NOT NULL REFERENCES users(id),
  to_user INTEGER REFERENCES users(id),
  note TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoff_acks (
  handoff_id INTEGER NOT NULL REFERENCES handoffs(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  acked_at TEXT NOT NULL,
  PRIMARY KEY (handoff_id, user_id)
);

CREATE TABLE IF NOT EXISTS open_items (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  owner_id INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  due_date TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES users(id),
  outcome TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  body TEXT NOT NULL DEFAULT '',
  is_emergency INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emergency_links (
  token TEXT PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  payer_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL,
  spent_on TEXT NOT NULL,
  entered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'care',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  taker_id INTEGER REFERENCES users(id),
  after_notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  name TEXT NOT NULL,
  remaining INTEGER NOT NULL,
  per_day REAL NOT NULL DEFAULT 1,
  warn_days INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  mood INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  entered_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  circle_id INTEGER NOT NULL REFERENCES circles(id),
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
`;

const plain = (columns, row) => Object.fromEntries(columns.map((c, i) => [c, row[i]]));

// Thin async wrapper over libSQL so call sites read like prepare(sql).get(...args).
// Works against a Turso URL in production and a local file or in-memory DB in tests.
export async function openDb({ url = ':memory:', authToken } = {}) {
  const client = createClient({ url, authToken });
  await client.executeMultiple(SCHEMA);
  const exec = (sql, args = []) => client.execute({ sql, args });
  return {
    client,
    prepare(sql) {
      return {
        async get(...args) { const r = await exec(sql, args); return r.rows[0] ? plain(r.columns, r.rows[0]) : undefined; },
        async all(...args) { const r = await exec(sql, args); return r.rows.map((row) => plain(r.columns, row)); },
        async run(...args) { const r = await exec(sql, args); return { changes: r.rowsAffected, lastInsertRowid: Number(r.lastInsertRowid ?? 0) }; },
      };
    },
    // Several statements applied atomically: [[sql, args], ...]
    async batch(stmts) { return client.batch(stmts.map(([sql, args = []]) => ({ sql, args })), 'write'); },
  };
}

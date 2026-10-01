-- Safe to re-run: every statement is IF (NOT) EXISTS. Column names match the
-- tables already live in tfl-db, so this never needs to recreate them.
--   npm run db:init:remote

-- Long-term store: one row per line per UTC hour, counting how many of that
-- hour's one-minute polls landed in each tier. Kept 90 days, pruned hourly.
CREATE TABLE IF NOT EXISTS hourly_status (
  line_id  TEXT    NOT NULL,
  hour       INTEGER NOT NULL, -- epoch ms at the start of the UTC hour
  n_good     INTEGER NOT NULL DEFAULT 0,
  n_minor    INTEGER NOT NULL DEFAULT 0,
  n_moderate INTEGER NOT NULL DEFAULT 0,
  n_severe   INTEGER NOT NULL DEFAULT 0,
  n_unknown  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (line_id, hour)
);
CREATE INDEX IF NOT EXISTS idx_hourly_hour ON hourly_status (hour);
-- Duplicate of idx_hourly_hour, briefly created by an earlier version of
-- this file. Every extra index costs D1 row writes, so remove it.
DROP INDEX IF EXISTS hourly_status_hour;

-- Short-term detail: a 180-slot ring buffer per line (slot = minute mod 180),
-- i.e. the last 3 hours at one-minute resolution. Rows are overwritten in
-- place, so it never needs deleting.
CREATE TABLE IF NOT EXISTS minute_status (
  line_id TEXT    NOT NULL,
  slot    INTEGER NOT NULL,
  t       INTEGER NOT NULL, -- epoch ms of the poll (rounded to the minute)
  tier    TEXT    NOT NULL,
  PRIMARY KEY (line_id, slot)
);

-- The full TfL JSON from the most recent poll, served by /api/status.
CREATE TABLE IF NOT EXISTS latest_status (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  body       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Precomputed responses (currently just the 90-day uptime summary), rebuilt
-- at the top of each hour so requests never scan the whole hourly table.
CREATE TABLE IF NOT EXISTS summary_cache (
  key        TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  payload    TEXT    NOT NULL
);

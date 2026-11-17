-- Publisher-discography sweep (worker/backfill/discographySweep.ts): which
-- Steam apps it has already checked against xREL, so a title with no
-- release data is not re-searched every cycle.
CREATE TABLE IF NOT EXISTS discography_checked (
  appid INTEGER PRIMARY KEY,
  title TEXT,
  outcome TEXT NOT NULL,      -- added | no-xrel | no-match
  checked_at INTEGER NOT NULL
);
-- The sweep walks publishers in order with `publisher > ? ORDER BY publisher LIMIT 1`.
CREATE INDEX IF NOT EXISTS idx_games_publisher ON games(publisher);

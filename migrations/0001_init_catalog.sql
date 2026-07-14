-- orlaz Phase 3: catalog database.
-- Mirrors src/types/game.ts's Game/Release shape closely enough that
-- worker/routes/catalog.ts barely has to adapt it for the frontend. dlc,
-- screenshots, trailers, pcReq etc. from appdetails.ts's richer response
-- stay resolved live per-game-page-view as they already do -- this only
-- persists what every list/directory page needs to stop guessing at.

CREATE TABLE games (
  id TEXT PRIMARY KEY,         -- same slug as Game.id
  xrel_key TEXT,
  title TEXT NOT NULL,
  appid INTEGER,
  year INTEGER,
  released TEXT,
  developer TEXT,
  publisher TEXT,
  genres TEXT,                 -- JSON array, same as Game.genres
  tags TEXT,                   -- JSON array
  current_build INTEGER,
  desc TEXT,
  fact TEXT,
  metacritic INTEGER,
  source_name TEXT,
  source_url TEXT,
  updated_at INTEGER NOT NULL  -- unix ms, last time this row was refreshed
);

CREATE TABLE releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  method TEXT NOT NULL,        -- 'hv' | 'trad'
  group_name TEXT NOT NULL,
  build INTEGER,
  version TEXT,
  date TEXT,
  ts INTEGER,
  note TEXT,
  xrel_id TEXT,
  link_href TEXT,
  is_repack INTEGER DEFAULT 0,
  is_anonymous INTEGER DEFAULT 0,
  -- One row per (game, group), not one row per raw xREL release -- matches
  -- the same "collapse repeat updates from the same group into their
  -- latest, carry an update count" dedupe rule src/lib/catalog.ts's
  -- dedupeReleasesByGroup already applies client-side. Without this,
  -- re-processing a group's ongoing crack (steady-state sync, or a
  -- backfill pass re-touching a title) would insert a fresh row every
  -- time instead of updating the existing one -- the point of an upsert.
  update_count INTEGER DEFAULT 1,
  UNIQUE (game_id, group_name)
);
CREATE INDEX idx_releases_game ON releases(game_id);
CREATE INDEX idx_releases_ts ON releases(ts);

-- Resumable-backfill progress marker (section 3 of orlaz-phase3-database.md)
-- -- a small key/value table rather than a KV namespace, since it needs to
-- live and transact alongside the same games/releases writes it's tracking
-- progress for, in the one D1 database this deploy already has a binding
-- for (no second manual "create a KV namespace" step needed).
CREATE TABLE backfill_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

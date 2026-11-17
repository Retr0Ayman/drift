-- Watchlist alerts. Minimal by design: a browser push endpoint + the game ids
-- it watches. No email, no account, no personal data.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS push_watch (
  endpoint TEXT NOT NULL,
  game_id TEXT NOT NULL,
  PRIMARY KEY (endpoint, game_id)
);
CREATE INDEX IF NOT EXISTS idx_push_watch_game ON push_watch(game_id);

-- One row per real event, derived from data the pipeline already writes:
--   cracked          the game's first genuine (non-repack, non-anonymous) release
--   denuvo_removed   games.denuvo_removed_at got stamped
-- UNIQUE(game_id, kind): each fires at most once per game, ever.
CREATE TABLE IF NOT EXISTS watch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  event_ts INTEGER,
  created_at INTEGER NOT NULL,
  fanned_out INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_watch_events_unfanned ON watch_events(fanned_out) WHERE fanned_out = 0;
CREATE INDEX IF NOT EXISTS idx_watch_events_created ON watch_events(created_at);

-- Per-endpoint delivery queue. sent_at = push ping accepted by the push
-- service; delivered_at = the service worker fetched the inbox.
CREATE TABLE IF NOT EXISTS push_outbox (
  event_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  sent_at INTEGER,
  delivered_at INTEGER,
  PRIMARY KEY (event_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON push_outbox(sent_at) WHERE sent_at IS NULL;

-- Lets the detector find "denuvo_removed_at was just stamped" without a full scan.
CREATE INDEX IF NOT EXISTS idx_games_denuvo_removed ON games(denuvo_removed_at) WHERE denuvo_removed_at IS NOT NULL;

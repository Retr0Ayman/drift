-- D1 rows_read audit (2026-09-06): drmBackfillRun.ts's runDrmRecheckTick and
-- refreshStale.ts's getStaleGames both ORDER BY a column with no index
-- (drm_checked_at / updated_at) on every 5-/15-minute cron tick -- confirmed
-- live via EXPLAIN QUERY PLAN this forced "SCAN games" + "USE TEMP B-TREE
-- FOR ORDER BY" every single call, reading the entire ~2000-row games table
-- just to return 40/150 rows. These two indexes let SQLite satisfy the
-- ORDER BY directly from the index instead, which alone accounted for
-- roughly 1.5M of this account's ~3.9M daily rows_read (75% of the 5M
-- free-tier limit, per Cloudflare's usage warning).
CREATE INDEX idx_games_drm_checked_at ON games(drm_checked_at);
CREATE INDEX idx_games_updated_at ON games(updated_at);

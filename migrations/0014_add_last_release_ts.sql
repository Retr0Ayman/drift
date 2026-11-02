-- FIX (confirmed live against production, 2026-11-02): the catalog grid
-- (worker/routes/catalog.ts) ordered by games.updated_at DESC, but
-- updated_at means "when a cron last re-checked this row's Steam metadata,"
-- NOT "when this game was last cracked." worker/backfill/refreshStale.ts
-- deliberately selects the 150 OLDEST-updated games every 15-minute tick and
-- stamps updated_at = now() on each one it successfully refreshes -- so the
-- stalest rows in the catalog were being promoted straight to the top of the
-- homepage, and at 150 x 96 ticks/day the whole ~2000-game catalog rotates
-- through that top slot roughly every 3.5 hours.
--
-- Confirmed live via /api/catalog: position 3 was Resident Evil 4 (newest
-- crack 2023-03-29), position 10 Mega Man X Legacy Collection 2 (2018-07-25)
-- and position 11 FINAL FANTASY VIII (2022-02-02), while a genuine
-- 2026-11-01 release sat at position 4 -- the data was completely current,
-- the ORDER BY just wasn't about crack recency at all. Reported by the site
-- owner as "the games are not up to date, it's stuck from a few months ago."
--
-- Fixed with a denormalised column rather than an inline MAX(ts) subquery on
-- the read path: /api/catalog is the hottest endpoint in the app (the
-- frontend drains the full catalog page-by-page on load), and a GROUP BY
-- over the whole releases table per request would add thousands of
-- rows_read to every one of those calls -- re-breaking the exact free-tier
-- quota migration 0013 was written to fix. An indexed column instead lets
-- ORDER BY be satisfied straight from the index, reading only the LIMIT'd
-- rows, the same technique 0013 already used for drm_checked_at/updated_at.
--
-- NULL (a game with no tracked releases at all) sorts last under DESC in
-- SQLite, which is the correct placement here and needs no special-casing.
ALTER TABLE games ADD COLUMN last_release_ts INTEGER;

CREATE INDEX idx_games_last_release_ts ON games(last_release_ts);

-- One-time backfill for every row already in the catalog. Maintained from
-- here on by worker/backfill/db.ts's upsertGames, which recomputes this
-- straight from the releases table for every game whose releases it touched
-- (exact, not monotonic -- so a later correction to a release's ts is
-- reflected rather than being permanently stuck at an old high-water mark).
UPDATE games SET last_release_ts = (SELECT MAX(ts) FROM releases WHERE releases.game_id = games.id);

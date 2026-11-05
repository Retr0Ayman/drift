-- DRM feed rebuild (2026-11-05). PCGamingWiki turned off public Cargo queries
-- ("permissiondenied: You don't have permission to run arbitrary Cargo
-- queries", HTTP 200, for every caller), and the old pipeline swallowed that
-- as "checked, nothing changed" -- 0 removals detected, tags frozen. The feed
-- now has two real sources: PCGamingWiki page wikitext (plain
-- action=query&prop=revisions, matched to a page only when the page's own
-- Steam_AppID equals ours) and the Steam store's own drm_notice.

-- Last drm_notice Steam returned ('' = fetched, no notice; NULL = never
-- fetched). A removal is only ever inferred from a notice that previously
-- listed Denuvo and now doesn't, so '' and NULL must stay distinct.
ALTER TABLE games ADD COLUMN steam_drm_notice TEXT;
ALTER TABLE games ADD COLUMN steam_drm_checked_at INTEGER;

-- The PCGamingWiki page title whose Steam_AppID matched this row's appid,
-- cached so later cycles skip the title search.
ALTER TABLE games ADD COLUMN pcgw_page TEXT;

-- 1 once any source has said Denuvo is or was on this title. The recheck
-- gives these rows both sources every cycle; everything else only gets the
-- cheap Steam notice sweep (which can set this flag).
ALTER TABLE games ADD COLUMN denuvo_watch INTEGER NOT NULL DEFAULT 0;

-- How denuvo_removed_at was decided: 'sourced' = a dated primary-source ref on
-- PCGamingWiki; 'detected' = our own observation time. Plus which source
-- decided, the ref URL if any, and whether the sources disagree
-- (PCGamingWiki says removed, Steam's store page still lists Denuvo).
ALTER TABLE games ADD COLUMN denuvo_removed_kind TEXT;
ALTER TABLE games ADD COLUMN denuvo_removed_source TEXT;
ALTER TABLE games ADD COLUMN denuvo_removed_url TEXT;
ALTER TABLE games ADD COLUMN denuvo_conflict INTEGER NOT NULL DEFAULT 0;

-- Part 3 cleanup: everything that has ever carried Denuvo gets a forced full
-- recheck. Resetting drm_checked_at (NULL sorts first) means the next ticks
-- visit exactly these rows first. No tags are moved here -- only a source
-- can move a title out of "currently protected".
UPDATE games SET denuvo_watch = 1 WHERE tags LIKE '%Denuvo%' OR former_tags LIKE '%Denuvo%';
UPDATE games SET drm_checked_at = NULL WHERE denuvo_watch = 1;

-- Both recheck queries ORDER BY these, so index them (see 0013).
CREATE INDEX idx_games_watch_drm_checked ON games(denuvo_watch, drm_checked_at);
CREATE INDEX idx_games_watch_steam_checked ON games(denuvo_watch, steam_drm_checked_at);

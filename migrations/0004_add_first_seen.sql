-- releases' UNIQUE(game_id, group_name) means every new detection for that
-- group+game overwrites date/build/ts via the upsert (correct -- that's
-- what makes an ongoing crack's tracked state stay current). But it also
-- means the row's ORIGINAL first-ever crack date/build is gone the moment
-- a single update lands, and crackTimingDays (src/lib/format.ts) was
-- computing "Cracked in N days" against whatever `date` currently holds --
-- silently mislabeling a routine patch-update's timing as if it were the
-- original crack speed.
--
-- first_seen_date/first_seen_build/first_seen_ts are set once, at the row's
-- first-ever insert, and never touched by the upsert's ON CONFLICT DO
-- UPDATE afterward (worker/backfill/db.ts's UPSERT_RELEASE_SQL simply
-- omits them from the SET clause) -- date/build/ts keep updating to the
-- latest known state exactly as they already correctly do.
--
-- first_seen_ts isn't explicitly asked for alongside first_seen_date/
-- first_seen_build, but releaseTs() (src/lib/format.ts) already prefers a
-- raw epoch timestamp over parsing a formatted date string for exactly
-- this kind of day-math -- leaving the first-seen moment without its own
-- raw ts would mean the one figure this whole fix exists to make accurate
-- (crackTimingDays) falls back to the less reliable path.
ALTER TABLE releases ADD COLUMN first_seen_date TEXT;
ALTER TABLE releases ADD COLUMN first_seen_build INTEGER;
ALTER TABLE releases ADD COLUMN first_seen_ts INTEGER;

-- Ambient background wash on game detail pages needs 2 accent colors per
-- game, derived from cover art (worker/shared/colorExtract.ts) at the same
-- enrichment point header (0002) is captured -- never computed live per
-- pageview. NULL until the backfill (or next steady-state enrich) fills it
-- in; catalog.ts/frontend fall back to the same fixed neutral pair
-- colorExtract.ts itself uses when extraction fails.

ALTER TABLE games ADD COLUMN accent_color_primary TEXT;
ALTER TABLE games ADD COLUMN accent_color_secondary TEXT;

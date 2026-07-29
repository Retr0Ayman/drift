-- Denuvo-removal tracker: a real detection-event timestamp, stamped ONLY when
-- worker/backfill/drmBackfillRun.ts's ongoing recheck cycle (runDrmRecheckTick)
-- directly OBSERVES "Denuvo Anti-Tamper" move from a row's own current tags
-- into former_tags -- i.e. the actual moment this site's own pipeline caught
-- the removal, never a guessed/backdated date.
--
-- Deliberately NOT backfilled from the removal cases already sitting in
-- former_tags before this column existed (007 First Light, NieR: Automata,
-- SUPER ROBOT WARS Y, and 45 others confirmed live in production D1). For
-- those, drm_checked_at (migrations/0009) is real but measures "the last
-- time the recheck cycle happened to visit this row" -- confirmed live that
-- every one of those 48 rows has a drm_checked_at within the same few-hour
-- window (whenever the recheck cycle last swept the whole table), totally
-- decoupled from when removal actually happened for games removed years
-- before this site's DRM tracking even existed (e.g. Injustice 2, 2017;
-- Grand Theft Auto III, 2008 -- its former_tags is even SafeDisc, not
-- Denuvo, since it predates Denuvo entirely). Computing "days to removal"
-- from drm_checked_at for those would be exactly the fabricated-precision-
-- from-noise this project's own discipline exists to avoid.
--
-- So this starts at zero real samples on the day it ships, by design --
-- worker/backfill/denuvoRemoval.ts only ever credits a publisher's median
-- with a genuinely observed transition, and says so honestly ("not enough
-- data yet") until the ongoing recheck cycle (every existing Denuvo title
-- gets re-checked on a rolling cycle already, see migrations/0009) starts
-- catching real removals going forward. NULL means "still has Denuvo,"
-- "never had it," or "removed before this column started tracking" (unknown
-- exact date) -- same three-way honesty convention former_tags itself
-- already follows.
ALTER TABLE games ADD COLUMN denuvo_removed_at INTEGER;

-- One row per publisher, fully overwritten on every recompute -- a derived
-- cache, not a source of truth, same pattern as migrations/0008's
-- group_reliability. median_days/min_days/max_days stay NULL below
-- worker/backfill/denuvoRemoval.ts's MIN_SAMPLE (2 -- a single confirmed
-- removal is just that one data point, not a distribution to take a median
-- of), same "not enough data yet" honesty as group_reliability's own
-- `stars`. sample_count is always real and shown regardless, so a thin-data
-- publisher still reads as "here's what we actually have," not silence.
CREATE TABLE denuvo_removal_stats (
  publisher_key TEXT PRIMARY KEY,
  publisher_name TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  median_days REAL,
  min_days INTEGER,
  max_days INTEGER,
  computed_at INTEGER NOT NULL
);

-- Crack ETA Predictor's own derived cache -- one row per (scope, key), scope
-- is 'publisher' or 'group'. Same shape and same MIN_SAMPLE-gated honesty as
-- denuvo_removal_stats above; see worker/backfill/crackEta.ts for the exact
-- query (real releases.first_seen_ts / first_seen_verified data already in
-- this catalog, restricted to genuine traditional cracks of games that are
-- or were Denuvo-protected -- never an LLM-guessed number).
CREATE TABLE crack_eta_stats (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  median_days REAL,
  min_days INTEGER,
  max_days INTEGER,
  computed_at INTEGER NOT NULL,
  PRIMARY KEY (scope, key)
);

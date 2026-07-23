-- orlaz group reliability star rating: a transparent, re-computable 1-5
-- star score per group, derived entirely from real release data already
-- sitting in the `releases` table -- never an AI-guessed/vibes-based
-- number. See worker/backfill/groupReliability.ts for the exact formula
-- and orlaz-group-reliability-star-rating.md for the full investigation,
-- including which candidate signals (nuke status) turned out NOT to be
-- real, checkable data on xREL's actual API responses and were dropped
-- rather than approximated.
--
-- One row per group (group_key = slugify(group_name), matching
-- src/lib/format.ts's slugify()), fully overwritten on every recompute --
-- this table is a derived cache, not a source of truth, so there's no
-- history to preserve between runs.
CREATE TABLE group_reliability (
  group_key TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,
  -- Genuine cracks counted: is_repack = 0 AND is_anonymous = 0 releases
  -- only -- a repack/anonymous-upload group has nothing to be "reliable"
  -- or not about (it didn't crack anything), so it never gets a genuine
  -- count and therefore never gets a star score. Not a bug, see stars'
  -- own comment.
  genuine_count INTEGER NOT NULL,
  -- How many of those genuine releases were found to need a real
  -- scene-standard correction release (PROPER/CRACKFIX/NFOFIX/DIRFIX,
  -- confirmed live as real, meaningfully-present tokens in xREL dirnames)
  -- -- either the group's own later update for the same game carries one
  -- of those tags, or a different group's later release for the same game
  -- does.
  correction_count INTEGER NOT NULL,
  -- Average days between a corrected release's first_seen_ts and the
  -- correcting release's, across every cross-group correction found. NULL
  -- when there are zero cross-group corrections to measure (same-group
  -- self-corrections have no recoverable original timestamp -- the
  -- UNIQUE(game_id, group_name) collapse means the row's own first-ever
  -- raw timestamp for that specific broken release is gone by the time a
  -- fix lands, see migrations/0004's own comment for the general shape of
  -- this limitation). Informational only, never fed into `stars` math --
  -- the sample size per group is usually too small (0-3 data points) to
  -- weight numerically without manufacturing false precision.
  avg_fix_days REAL,
  -- 1-5 in 0.5 steps. NULL when genuine_count is below
  -- worker/backfill/groupReliability.ts's MIN_SAMPLE -- an honest "not
  -- enough data yet" rather than a confident-looking score built on 1-2
  -- releases. Deliberately does NOT factor in release volume (genuine_count
  -- itself) beyond that minimum-sample gate -- a large, consistent history
  -- is real but weak signal of an established group, not of a reliable
  -- one, so it's surfaced in the UI as a separate stat instead of being
  -- baked into the star math (see orlaz-group-reliability-star-rating.md).
  stars REAL,
  computed_at INTEGER NOT NULL
);

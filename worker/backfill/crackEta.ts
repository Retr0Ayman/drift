import type { Env } from "../shared/env";
import { getBackfillState, setBackfillState } from "./db";
import { slugify } from "./parse";

/* orlaz Crack ETA Predictor: the flagship differentiator, built the same
   way group_reliability and denuvo_removal_stats are -- a real, re-
   computable statistic over data already sitting in this catalog, never an
   LLM guessing from general knowledge (contrast with CrackOutlook/
   worker/routes/outlook.ts, which IS an LLM blurb but only ever describes
   THIS game's current tracked state, never a forward-looking estimate).

   The real signal this pulls from: releases.first_seen_ts +
   first_seen_verified (migrations/0004/0005), already built specifically
   so "how many days after release did the first genuine crack land" is an
   honest, non-fabricated number -- crackTimingDays in src/lib/format.ts
   computes the identical thing client-side per-release already. This just
   aggregates that same real quantity across every genuine (non-repack,
   non-anonymous) TRADITIONAL crack of a game that IS or WAS Denuvo-
   protected (tags or former_tags containing "Denuvo Anti-Tamper" --
   the removal doesn't erase the fact that a traditional crack had to beat
   Denuvo in the first place), grouped two ways:

   - by publisher: "this publisher's Denuvo titles typically get a
     traditional crack in N days"
   - by group: "this group's own track record cracking Denuvo AAA titles,
     regardless of publisher" -- deliberately NOT cross-tabulated by
     (publisher, group) pair, since that would fragment the real sample
     count down to 0-1 for almost every combination and manufacture false
     precision exactly where this feature must not. */

const MIN_SAMPLE = 3;
const RECOMPUTE_INTERVAL_MS = 60 * 60 * 1000;

/* FIX (confirmed live): a game's own `released` column holds Steam's
   CURRENT listing date for its resolved appid -- for a title whose Steam
   page was later replaced/reused by a remaster or remake (same real-world
   pattern already documented for "Grand Theft Auto IV: The Complete
   Edition" showing a 2020 released date, see worker/backfill/db.ts's own
   history), `released` reflects the REMAKE's date while `releases` still
   carries real historical crack rows from the ORIGINAL game's much older
   launch. Confirmed live: Resident Evil 4 (Capcom, game_id
   "resident-evil-4") carries released="Mar 23, 2023" (the 2023 remake) but
   its releases table also has genuine 3DM/Black_Box/RAF traditional cracks
   from the original 2007-era PC port, producing "days to crack" values
   like -4177 and -3299 -- pure date-mismatch noise, not a real signal
   about how fast anyone cracked anything. Left unfiltered, that noise
   dominated min/max (and meaningfully skewed several publishers' medians,
   e.g. Electronic Arts came out to a median of -1070 days across the whole
   catalog) -- exactly the fabricated-looking-precision-from-garbage this
   project's discipline exists to avoid.
   Sanity-bounded to [-90, 1095] days: a real early leak beyond three months
   before release, or a traditional crack genuinely taking more than three
   years, would be a legitimate but extraordinary outlier this catalog has
   no way to distinguish from a title/date mismatch like the above -- and a
   game's own page already surfaces that specific release's real
   crackTimingDays with full context if it's real, so the aggregate doesn't
   need to swallow it and risk corrupting the headline stat. Confirmed live
   against the full real dataset: this excludes ~34% of otherwise-matching
   rows (all genuinely implausible values) and turns every publisher's
   median from headline-breaking nonsense into a plausible, defensible
   number (e.g. Electronic Arts: median 80.5 days, 4 samples, instead of
   -1070 across 17). */
const MIN_PLAUSIBLE_DAYS = -90;
const MAX_PLAUSIBLE_DAYS = 1095;

interface EtaRow {
  group_name: string;
  publisher: string | null;
  released: string | null;
  first_seen_ts: number;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface EtaAgg {
  name: string;
  days: number[];
}

export function computeCrackEtaStats(rows: EtaRow[]): { byPublisher: Map<string, EtaAgg>; byGroup: Map<string, EtaAgg> } {
  const byPublisher = new Map<string, EtaAgg>();
  const byGroup = new Map<string, EtaAgg>();

  const add = (map: Map<string, EtaAgg>, name: string, days: number) => {
    const key = slugify(name);
    let agg = map.get(key);
    if (!agg) {
      agg = { name, days: [] };
      map.set(key, agg);
    }
    agg.days.push(days);
  };

  for (const r of rows) {
    if (!r.released) continue;
    const releasedTs = Date.parse(r.released);
    if (isNaN(releasedTs)) continue;
    const days = Math.round((r.first_seen_ts * 1000 - releasedTs) / 86400000);
    if (days < MIN_PLAUSIBLE_DAYS || days > MAX_PLAUSIBLE_DAYS) continue;
    if (r.publisher) add(byPublisher, r.publisher, days);
    add(byGroup, r.group_name, days);
  }
  return { byPublisher, byGroup };
}

const QUERY = `
  SELECT r.group_name, g.publisher, g.released, r.first_seen_ts
  FROM releases r JOIN games g ON g.id = r.game_id
  WHERE r.method = 'trad' AND r.is_repack = 0 AND r.is_anonymous = 0
    AND r.first_seen_verified = 1 AND r.first_seen_ts IS NOT NULL
    AND (g.tags LIKE '%Denuvo Anti-Tamper%' OR g.former_tags LIKE '%Denuvo Anti-Tamper%')
`;

export async function runCrackEtaStatsTick(env: Env, force = false): Promise<{ ran: boolean; rows?: number }> {
  const db = env.orlaz_catalog;
  const lastRun = Number((await getBackfillState(db, "crack_eta_stats_computed_at")) || "0");
  if (!force && Date.now() - lastRun < RECOMPUTE_INTERVAL_MS) return { ran: false };

  const { results } = await db.prepare(QUERY).all<EtaRow>();
  const rows = results || [];
  const { byPublisher, byGroup } = computeCrackEtaStats(rows);
  const now = Date.now();

  /* FIX (confirmed live): a full DELETE before the fresh insert batch, not
     just an upsert over whatever this pass produces -- an upsert-only
     approach left stale rows behind for any (scope, key) that had enough
     samples to qualify on an EARLIER pass but zero qualifying samples on a
     later one (e.g. every one of a group's few samples getting excluded by
     MAX_PLAUSIBLE_DAYS above after that filter was added). Confirmed live:
     DINOByTES/SKiDROW/I_KnoW kept showing their pre-filter garbage numbers
     (2000+ day medians, a -1245 min) indefinitely after the filter landed,
     since nothing ever re-visited or cleared their now-stale row once this
     pass stopped producing new data for them. This table is a fully
     recomputed derived cache (see migrations/0011's own comment), not an
     accumulating history -- it must reflect exactly what the latest real
     pass found, nothing older. */
  await db.prepare("DELETE FROM crack_eta_stats").run();

  const statements = [];
  for (const [scope, map] of [
    ["publisher", byPublisher],
    ["group", byGroup],
  ] as const) {
    for (const [key, agg] of map) {
      const sampleCount = agg.days.length;
      const confident = sampleCount >= MIN_SAMPLE;
      statements.push(
        db
          .prepare(
            `INSERT INTO crack_eta_stats (scope, key, name, sample_count, median_days, min_days, max_days, computed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(scope, key) DO UPDATE SET
               name = excluded.name, sample_count = excluded.sample_count,
               median_days = excluded.median_days, min_days = excluded.min_days, max_days = excluded.max_days,
               computed_at = excluded.computed_at`,
          )
          .bind(
            scope,
            key,
            agg.name,
            sampleCount,
            confident ? Math.round(median(agg.days) * 10) / 10 : null,
            confident ? Math.min(...agg.days) : null,
            confident ? Math.max(...agg.days) : null,
            now,
          ),
      );
    }
  }
  if (statements.length) await db.batch(statements);
  await setBackfillState(db, "crack_eta_stats_computed_at", String(now));
  return { ran: true, rows: statements.length };
}

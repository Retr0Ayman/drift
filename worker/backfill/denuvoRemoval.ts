import type { Env } from "../shared/env";
import { getBackfillState, setBackfillState } from "./db";
import { slugify } from "./parse";

/* orlaz Denuvo-removal tracker: a transparent, re-computable per-publisher
   median days-from-launch-to-removal, derived entirely from real removal
   events this site's own DRM recheck cycle has directly observed
   (worker/backfill/drmBackfillRun.ts's runDrmRecheckTick stamps
   games.denuvo_removed_at at the exact moment it catches a genuine
   tags -> former_tags transition) -- never an AI-guessed/vibes-based
   number. See migrations/0011's own comment for why the 48 removal cases
   already sitting in former_tags before this column existed are
   deliberately NOT counted here: this site has no real record of when
   those actually happened, only of when its own recheck cycle happened to
   notice them, which is a different (and much noisier) thing. */

// A publisher with exactly 1 confirmed removal has one data point, not a
// distribution -- there's no real "median" to take. 2 is the honest floor
// for a median to mean anything at all, matching the user's own framing of
// this discipline ("a publisher with only 1 confirmed removal doesn't get
// a confident median").
const MIN_SAMPLE = 2;

const RECOMPUTE_INTERVAL_MS = 60 * 60 * 1000;

interface GameRow {
  publisher: string | null;
  released: string | null;
  denuvo_removed_at: number;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface PublisherRemovalAgg {
  name: string;
  days: number[];
}

/* Exported for direct unit testing of the pure math, same pattern
   groupReliability.ts's computeGroupReliability already follows -- the D1
   query and the aggregation logic are kept separately checkable. */
export function computeDenuvoRemovalStats(rows: GameRow[]): Map<string, PublisherRemovalAgg> {
  const byPublisher = new Map<string, PublisherRemovalAgg>();
  for (const r of rows) {
    if (!r.publisher || !r.released || !r.denuvo_removed_at) continue;
    const releasedTs = Date.parse(r.released);
    if (isNaN(releasedTs)) continue;
    const days = Math.round((r.denuvo_removed_at - releasedTs) / 86400000);
    // A negative value here means the parsed release date is wrong (a
    // partial/TBA-style string Date.parse mis-resolved), not a real
    // removal that predates its own launch -- exclude rather than let it
    // corrupt the real samples. Same reasoning as worker/backfill/
    // crackEta.ts's MAX_PLAUSIBLE_DAYS on the upper end -- a game whose
    // Steam appid got reused/replaced by a remaster (confirmed live
    // elsewhere in this catalog, see that file's own comment) would show
    // `released` as the remaster's much later date, which could otherwise
    // make a same-day detection look like a multi-thousand-day gap in the
    // other direction too if denuvo_removed_at predates a later `released`
    // rewrite. 10 years is a deliberately generous ceiling -- real Denuvo
    // removals aren't yet known to take anywhere near that long -- so this
    // only ever guards against a genuine date-mismatch artifact, never a
    // real slow removal.
    if (days < 0 || days > 3650) continue;
    const key = slugify(r.publisher);
    let agg = byPublisher.get(key);
    if (!agg) {
      agg = { name: r.publisher, days: [] };
      byPublisher.set(key, agg);
    }
    agg.days.push(days);
  }
  return byPublisher;
}

export async function runDenuvoRemovalStatsTick(env: Env, force = false): Promise<{ ran: boolean; publishers?: number }> {
  const db = env.orlaz_catalog;
  const lastRun = Number((await getBackfillState(db, "denuvo_removal_stats_computed_at")) || "0");
  if (!force && Date.now() - lastRun < RECOMPUTE_INTERVAL_MS) return { ran: false };

  const { results } = await db.prepare("SELECT publisher, released, denuvo_removed_at FROM games WHERE denuvo_removed_at IS NOT NULL").all<GameRow>();
  const rows = results || [];

  const byPublisher = computeDenuvoRemovalStats(rows);
  const now = Date.now();

  // Full replace, not upsert-only -- a fully recomputed derived cache
  // (see migrations/0011's own comment), never an accumulating history.
  // Same fix as worker/backfill/crackEta.ts's own recompute: without this,
  // a publisher that qualified on an earlier pass but has zero qualifying
  // samples on a later one (e.g. its only removal sample later excluded by
  // the sanity-bound check above) would keep showing its stale old numbers
  // forever instead of dropping out honestly.
  await db.prepare("DELETE FROM denuvo_removal_stats").run();

  const statements = [...byPublisher.entries()].map(([key, agg]) => {
    const sampleCount = agg.days.length;
    const confident = sampleCount >= MIN_SAMPLE;
    return db
      .prepare(
        `INSERT INTO denuvo_removal_stats (publisher_key, publisher_name, sample_count, median_days, min_days, max_days, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(publisher_key) DO UPDATE SET
           publisher_name = excluded.publisher_name, sample_count = excluded.sample_count,
           median_days = excluded.median_days, min_days = excluded.min_days, max_days = excluded.max_days,
           computed_at = excluded.computed_at`,
      )
      .bind(
        key,
        agg.name,
        sampleCount,
        confident ? Math.round(median(agg.days) * 10) / 10 : null,
        confident ? Math.min(...agg.days) : null,
        confident ? Math.max(...agg.days) : null,
        now,
      );
  });
  if (statements.length) await db.batch(statements);
  await setBackfillState(db, "denuvo_removal_stats_computed_at", String(now));
  return { ran: true, publishers: statements.length };
}

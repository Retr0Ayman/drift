import type { Env } from "../shared/env";
import { fetchBuildInfo } from "../shared/steam";
import { getStaleGames, refreshBuildOnly } from "./db";

// FIX (confirmed live, real complaint: stale/wrong current-build numbers):
// 12/tick meant a full sweep of this catalog's ~2000 games took roughly a
// day and a half (12 * 4 ticks/hour = 48/hour) -- any game with no recent
// crack activity to otherwise trigger a recheck could show a current
// build number well over a day out of date. Bumped an order of magnitude:
// safe now that this tick only ever does ONE cheap fetchBuildInfo call per
// game (see refreshBuildOnly's own comment for why this stopped using the
// heavy full-enrichment path), parallelized below so the wall-clock cost
// of a bigger batch stays close to the slowest single call, not the sum
// of all of them. 150/tick cycles the whole catalog in a few hours
// instead of days.
const REFRESH_BATCH_SIZE = 150;

/* CONFIRMED (design gap, not a specific game caught wrong): every other
   mechanism that keeps a game's Steam metadata (current_build above all)
   up to date -- worker/scheduled.ts's runSteadyStateSync, the various
   backfills -- only ever touches a game because something happened on
   the CRACKING side for it (a new release, browse-feed activity, a
   starred group posting). A game with no recent crack activity has
   nothing that would ever re-trigger a Steam re-check, so if Steam
   quietly patches it (bumping current_build) with no corresponding new
   crack, this site's own build-gap comparisons (relStatus/driftDelta)
   would silently be comparing against a stale number forever. This tick
   is the independent side: oldest-updated-first, re-fetch straight from
   Steam via the game's own already-known appid (no re-resolve needed),
   regardless of any cracking activity. Every row in the batch fetches
   concurrently, each independently caught -- one game's Steam call
   having a bad moment must not stall (or slow down) the rest of this
   tick's batch. A row whose fetch fails or returns no build id is simply
   left alone (not written, not even its updated_at bumped) so it stays
   at the front of the oldest-first queue and gets retried next tick,
   same behavior this tick already had before this change. */
export async function runStaleRefreshTick(env: Env): Promise<{ refreshed: number }> {
  const db = env.orlaz_catalog;
  const rows = await getStaleGames(db, REFRESH_BATCH_SIZE);
  const results = await Promise.all(
    rows.map(async (row) => {
      try {
        const { buildId, buildUpdatedAt } = await fetchBuildInfo(String(row.appid));
        if (buildId == null) return false;
        await refreshBuildOnly(db, row.id, buildId, buildUpdatedAt);
        return true;
      } catch {
        return false;
      }
    }),
  );
  return { refreshed: results.filter(Boolean).length };
}

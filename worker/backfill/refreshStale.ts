import type { Env } from "../shared/env";
import { fetchBuildInfo } from "../shared/steam";
import { getStaleGames, refreshBuildsBatch } from "./db";

// Budget: this runs ALONE in a housekeeping-slot invocation (see
// worker/index.ts), BUDGET_STALE = 26 subrequests (after the 12-subrequest push tick that shares its invocation): 1 select + one steamcmd
// fetch per game + 1 batched D1 write. 22 games leaves margin for a retry or
// two. It runs on 5 of the 12 hourly housekeeping minutes (the rest go to the
// discography sweep / other tasks), i.e. ~110 games/hour -- the ~2000-game catalog cycles in well under a
// day, faster than the old 150-per-15-min tick that could never actually fit
// under the 50-subrequest cap alongside its neighbours.
export const REFRESH_BATCH_SIZE = 22;

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
        return buildId == null ? null : { id: row.id, buildId, buildUpdatedAt };
      } catch {
        return null;
      }
    }),
  );
  const ok = results.filter((r): r is { id: string; buildId: number; buildUpdatedAt: number | null } => r !== null);
  await refreshBuildsBatch(db, ok);
  return { refreshed: ok.length };
}

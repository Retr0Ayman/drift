import type { Env } from "../shared/env";
import { enrichFromSteam } from "./resolve";
import { getStaleGames, refreshStaleGame } from "./db";

// Small and cheap, run every 15 minutes forever (see worker/index.ts) --
// a full sweep of the catalog takes a while at this size, that's fine,
// this is a background freshness sweep, not a real-time need.
const REFRESH_BATCH_SIZE = 12;

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
   regardless of any cracking activity. Same silent-skip-one-failure
   pattern every other tick in this file uses -- one game's Steam call
   having a bad moment must not stall the rest of this tick's batch. */
export async function runStaleRefreshTick(env: Env): Promise<{ refreshed: number }> {
  const db = env.orlaz_catalog;
  const rows = await getStaleGames(db, REFRESH_BATCH_SIZE);
  let refreshed = 0;
  for (const row of rows) {
    try {
      const enrichment = await enrichFromSteam(env, row.appid);
      if (!enrichment) continue;
      await refreshStaleGame(db, row.id, row.title, enrichment);
      refreshed++;
    } catch {
      // skip, move on to the next game in this tick's batch
    }
  }
  return { refreshed };
}

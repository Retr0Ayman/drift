import type { Env } from "../shared/env";
import { enrichFromSteam } from "./resolve";
import { refreshStaleGame } from "./db";

/* Reconciliation for the false-blank-metadata backlog -- confirmed live on
   Forza Horizon 6, V Rising, PowerWash Simulator 2, and roughly a quarter
   of the entire live catalog: developer/publisher/released/genres/desc/
   header/current_build all sitting blank in D1 despite Steam having full,
   real data for every one of those appids right now.

   Root cause (see worker/routes/appdetails.ts's own fix comment): every
   failure response from that route used to echo `appid: Number(appid)`
   back in the body, so resolve.ts's enrichFromSteam -- whose only sanity
   check was `if (!d.appid) return null` -- never actually detected a
   failed Steam lookup. A transient Steam rate-limit/error got silently
   treated as a "successful" enrichment with every other field blank, then
   written straight over a game's existing good data (header and most
   other columns are unconditional overwrites in db.ts's upsert/refresh
   SQL, unlike accent color, which is why accent color survived on affected
   rows but nothing else did). That write path is now closed, but every row
   it already corrupted needs a real re-enrichment to recover -- this tick
   is that repair pass.

   Same "no cursor, re-query whatever's currently eligible" shape
   reconcileFirstSeen.ts already uses, not drmBackfillRun.ts's cursor --
   deliberately: a row a tick attempts and STILL fails (Steam having a bad
   moment right now, same failure mode this whole bug started from) must
   stay eligible for a later tick, not get marked "visited" and skipped
   forever. A row that gets fixed drops out of the WHERE clause on its own.
   ORDER BY RANDOM() so a handful of persistently-unfixable rows (a genuine
   Steam delist) can't monopolize every tick's small page. */
const PAGE_SIZE = 12; // each row costs the same 3 external calls enrichFromSteam always does

interface CorruptRow {
  id: string;
  appid: number;
  title: string;
}

export async function runEnrichmentRepairTick(env: Env): Promise<{ processed: number; fixed: number }> {
  const db = env.orlaz_catalog;
  const { results } = await db
    .prepare(
      `SELECT id, appid, title FROM games
       WHERE appid IS NOT NULL AND (developer IS NULL OR developer = '')
       ORDER BY RANDOM() LIMIT ?`,
    )
    .bind(PAGE_SIZE)
    .all<CorruptRow>();
  const rows = results || [];
  if (!rows.length) return { processed: 0, fixed: 0 };

  let fixed = 0;
  for (const row of rows) {
    try {
      const enrichment = await enrichFromSteam(env, row.appid);
      if (!enrichment) continue; // still failing right now -- stays eligible, picked up again next tick
      await refreshStaleGame(db, row.id, row.title, enrichment);
      fixed++;
    } catch {
      // one game's re-enrichment throwing must not lose the rest of this
      // tick's already-fixed rows; stays eligible for a later tick
    }
  }
  return { processed: rows.length, fixed };
}

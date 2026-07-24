import type { Env } from "../shared/env";
import { resolveHighResHeader } from "../shared/steam";
import { refreshHeaderOnly } from "./db";

// Cheap per row -- at most 2 HEAD requests (resolveHighResHeader's own
// HIGH_RES_VARIANTS list), no appdetails/accent-extraction/DRM-lookup
// calls, so this can afford a decent-sized batch per tick.
const PAGE_SIZE = 80;

const HIGH_RES_SUFFIXES = ["library_hero.jpg", "library_600x900_2x.jpg"];

function looksHighRes(header: string | null): boolean {
  return !!header && HIGH_RES_SUFFIXES.some((s) => header.endsWith(s));
}

interface Row {
  id: string;
  appid: number;
  header: string | null;
}

/* Dedicated header-upgrade sweep -- resolveHighResHeader (worker/shared/
   steam.ts) only ever ran as a side effect of a FULL Steam re-enrichment
   (enrichFromSteam): new-crack-activity games via steady-state sync, or a
   one-time historical backfill pass. A game whose row was first written
   before this high-res resolution existed, or whose HEAD check happened to
   miss at that exact moment, had no other path to ever pick up the
   upgrade later -- refreshStale.ts's own stale-refresh cycle used to
   incidentally re-run the same full enrichment on every catalog cycle,
   but switching that tick to a lightweight build-only check (see its own
   comment) dropped that incidental coverage.

   No cursor/tracking column needed here, unlike drmBackfillRun.ts's
   recheck -- the WHERE clause itself is the eligibility check: a row that
   gets upgraded stops matching NOT LIKE and drops out on its own, so
   there's nothing to mark "done." A game with genuinely no high-res
   variant available keeps matching and gets retried on a later tick --
   cheap enough (HEAD requests, Cloudflare-cached) that this is an
   acceptable cost for not needing a second column just to remember "we
   already confirmed this one has no upgrade." */
export async function runHeaderUpgradeTick(env: Env): Promise<{ upgraded: number }> {
  const db = env.orlaz_catalog;
  const { results } = await db
    .prepare(
      `SELECT id, appid, header FROM games
       WHERE appid IS NOT NULL
         AND (header IS NULL OR (header NOT LIKE '%library_hero.jpg' AND header NOT LIKE '%library_600x900_2x.jpg'))
       ORDER BY RANDOM() LIMIT ?`,
    )
    .bind(PAGE_SIZE)
    .all<Row>();
  const rows = results || [];
  if (!rows.length) return { upgraded: 0 };

  const results2 = await Promise.all(
    rows.map(async (row) => {
      try {
        const resolved = await resolveHighResHeader(row.appid, row.header);
        if (!resolved || resolved === row.header || !looksHighRes(resolved)) return false;
        await refreshHeaderOnly(db, row.id, resolved);
        return true;
      } catch {
        return false;
      }
    }),
  );
  return { upgraded: results2.filter(Boolean).length };
}

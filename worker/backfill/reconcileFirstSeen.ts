import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { handleXrelGroup } from "../routes/xrel/group";
import { handleXrelP2PGroup } from "../routes/xrel/p2pGroup";
import { dateFromTs, parseBuildFromDirname } from "./parse";

/* Reconciliation for the false-"Cracked in N days" backlog -- confirmed
   live on Crimson Desert: it showed "Cracked in 114 days" / "First cracked
   10 Jul 2026" despite releasing Mar 19 2026, because migrations/0004's
   first_seen_date backfill had no real historical data to recover for a
   release that already existed in D1 (UNIQUE(game_id, group_name) had
   already collapsed every prior update into one row) and fell back to
   "current date" -- silently wrong for exactly the releases that matter
   most (fast, frequently-updated groups like DenuvOwO).

   Real fix: xREL's own p2p/releases.json?group_id= history (already used
   by worker/routes/xrel/p2pGroup.ts for "deep, uncapped per-group
   history") still has the group's true original entry even when D1's own
   collapsed row doesn't -- confirmed live for Crimson Desert/DenuvOwO: the
   group's full history contains "Crimson.Desert-DenuvOwO" at a timestamp
   one day after the game's real Mar 19 2026 release, not the 114-day
   figure D1 had. This walks release rows with update_count > 1 and
   first_seen_verified = 0 (see migrations/0005), re-queries that release's
   group full history, and takes the earliest entry matching this exact
   game (matched by ext_info.id === the game's xrel_key -- the same "master
   game" id xREL itself uses, far more reliable than title-string
   matching) as the corrected first_seen_date/build/ts, flipping
   first_seen_verified to 1.

   No cursor, no terminal "done" state, unlike this codebase's other
   backfills -- deliberately different shape, not an oversight. Confirmed
   live during verification: xREL's group-search endpoint (worker/routes/
   xrel/group.ts) went from working to returning 0 rows for every group
   for an extended stretch (a real, not-quickly-clearing rate limit or
   cache issue, confirmed by direct upstream calls succeeding throughout
   from a different network path) -- a cursor that advances past a row
   the instant it's attempted, whether or not the fix actually landed,
   would have permanently skipped hundreds of legitimately-reconcilable
   rows just because they were unlucky enough to be attempted during that
   window. Instead, every tick re-queries whatever CURRENTLY has
   first_seen_verified = 0 -- a row that gets fixed drops out of that set
   on its own; one that doesn't stays eligible and gets picked up again by
   a later tick once whatever blocked it clears. ORDER BY RANDOM() so a
   persistently-unfixable row (xREL's history genuinely doesn't reach back
   far enough) can't monopolize every tick's small page and starve the
   rest of the backlog. Cheap enough at this page size and cadence to run
   indefinitely rather than needing to "complete" -- same reasoning as
   steady-state sync, not the large one-time crawls. */

const PAGE_SIZE = 20; // each row needs its own 1-2 external HTTP round trips

interface AtRiskRow {
  id: number;
  group_name: string;
  xrel_key: string | null;
}

interface Earliest {
  date: string;
  build: number | null;
  ts: number;
}

/* Memoized per tick, not just per row -- a handful of prolific groups
   (DenuvOwO, EMPRESS, RUNE, ...) account for a large share of at-risk
   rows, and refetching the same group's full history once per release
   would be pure waste within a single PAGE_SIZE batch (xREL's own edge
   cache already absorbs repeats ACROSS ticks, this absorbs them WITHIN
   one). */
async function fetchGroupHistory(env: Env, groupName: string, cache: Map<string, RawXrelRelease[]>): Promise<RawXrelRelease[]> {
  const key = groupName.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let rows: RawXrelRelease[] = [];
  const baseRes = await handleXrelGroup({
    request: new Request(`https://internal.invalid/api/xrel/group?name=${encodeURIComponent(groupName)}`),
    env,
  });
  if (baseRes.ok) rows = ((await baseRes.json()) as { list?: RawXrelRelease[] }).list || [];

  const groupId = rows.find((r) => r.group_id)?.group_id;
  if (groupId) {
    const deepRes = await handleXrelP2PGroup({
      request: new Request(`https://internal.invalid/api/xrel/p2p-group?group_id=${encodeURIComponent(groupId)}`),
      env,
    });
    if (deepRes.ok) {
      const deepRows = ((await deepRes.json()) as { list?: RawXrelRelease[] }).list || [];
      if (deepRows.length > rows.length) rows = deepRows;
    }
  }

  cache.set(key, rows);
  return rows;
}

function earliestMatch(rows: RawXrelRelease[], xrelKey: string): Earliest | null {
  const matches = rows.filter((r) => r.ext_info?.id === xrelKey && (r.time || 0) > 0);
  if (!matches.length) return null;
  const earliest = matches.reduce((a, b) => ((b.time as number) < (a.time as number) ? b : a));
  return { date: dateFromTs(earliest.time), build: parseBuildFromDirname(earliest.dirname), ts: earliest.time as number };
}

export async function runFirstSeenReconcileTick(env: Env): Promise<{ processed: number; fixed: number }> {
  const db = env.orlaz_catalog;
  const { results } = await db
    .prepare(
      `SELECT r.id as id, r.group_name as group_name, g.xrel_key as xrel_key
       FROM releases r JOIN games g ON g.id = r.game_id
       WHERE r.update_count > 1 AND r.first_seen_verified = 0
       ORDER BY RANDOM() LIMIT ?`,
    )
    .bind(PAGE_SIZE)
    .all<AtRiskRow>();
  const rows = results || [];
  if (!rows.length) return { processed: 0, fixed: 0 };

  const historyCache = new Map<string, RawXrelRelease[]>();
  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    if (!row.xrel_key) continue;
    try {
      const history = await fetchGroupHistory(env, row.group_name, historyCache);
      const found = earliestMatch(history, row.xrel_key);
      if (found) {
        statements.push(
          db
            .prepare("UPDATE releases SET first_seen_date = ?, first_seen_build = ?, first_seen_ts = ?, first_seen_verified = 1 WHERE id = ?")
            .bind(found.date, found.build, found.ts, row.id),
        );
      }
    } catch {
      // one release's group-history lookup failing (network blip, malformed
      // upstream response) must not lose the rest of this tick's already-
      // resolved rows, and leaves this row's first_seen_verified at 0 --
      // correctly unresolved, not incorrectly marked fixed
    }
  }
  if (statements.length) await db.batch(statements);
  return { processed: rows.length, fixed: statements.length };
}

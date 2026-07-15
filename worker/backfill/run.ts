import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { STARRED_GROUPS } from "../shared/constants";
import { handleXrelBrowse } from "../routes/xrel/browse";
import { handleXrelGroup } from "../routes/xrel/group";
import { handleXrelP2PGroup } from "../routes/xrel/p2pGroup";
import { groupRowsByTitle } from "./parse";
import { resolveAndEnrichBatch } from "./resolve";
import { getBackfillState, setBackfillState, upsertGames } from "./db";

interface ListResponse {
  list?: RawXrelRelease[];
  pagination?: { total_pages?: number };
}

/* One browse page (up to ~100 raw rows, typically 60-90 distinct titles
   after grouping) per tick -- deliberately conservative. Resolving each
   title against Steam's storesearch is one external HTTP call apiece
   (resolveAndEnrichBatch's real cost, not the already-edge-cached xREL
   calls), and Workers have real wall-time limits even inside a cron's
   waitUntil -- a backfill that times out mid-batch would leave D1 in a
   worse state (partially written, looking complete) than not attempting
   it. See wrangler.jsonc's second cron trigger for how fast this actually
   completes despite the small per-tick batch: every 2 minutes, not 15. */
async function processBrowsePage(env: Env, page: number): Promise<{ hasMore: boolean; processed: number }> {
  const res = await handleXrelBrowse({
    request: new Request(`https://internal.invalid/api/xrel/browse?page=${page}&per_page=100`),
    env,
  });
  if (!res.ok) return { hasMore: true, processed: 0 }; // transient failure -- retry same page next tick

  const data = (await res.json()) as ListResponse;
  const rows = data.list || [];
  const totalPages = data.pagination?.total_pages ?? 50;

  const grouped = groupRowsByTitle(rows);
  const titles = [...grouped.values()].map((g) => g.title);
  const enrichments = await resolveAndEnrichBatch(env, titles);
  await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);

  return { hasMore: page < totalPages, processed: rows.length };
}

/* Full history for one starred P2P group per tick -- baseline (capped
   search endpoint, works for any group name) upgraded to the genuinely-
   paginated p2p/releases.json source when it turns up more, same pattern
   src/lib/xrel.ts's fetchGroupHistory already uses client-side. Whichever
   source wins, every row for that group in one tick -- these groups'
   total output (low hundreds at most) is nowhere near a browse page's
   volume, no need to paginate this across multiple ticks too. */
async function processStarredGroup(env: Env, name: string): Promise<number> {
  const baseRes = await handleXrelGroup({
    request: new Request(`https://internal.invalid/api/xrel/group?name=${encodeURIComponent(name)}`),
    env,
  });
  let rows: RawXrelRelease[] = [];
  if (baseRes.ok) rows = ((await baseRes.json()) as ListResponse).list || [];

  const groupId = rows.find((r) => r.group_id)?.group_id;
  if (groupId) {
    const deepRes = await handleXrelP2PGroup({
      request: new Request(`https://internal.invalid/api/xrel/p2p-group?group_id=${encodeURIComponent(groupId)}`),
      env,
    });
    if (deepRes.ok) {
      const deepRows = ((await deepRes.json()) as ListResponse).list || [];
      if (deepRows.length > rows.length) rows = deepRows;
    }
  }

  const grouped = groupRowsByTitle(rows);
  const titles = [...grouped.values()].map((g) => g.title);
  const enrichments = await resolveAndEnrichBatch(env, titles);
  await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);
  return rows.length;
}

/* Resumable, incremental backfill -- see orlaz-phase3-database.md section 3
   for why this can't be one blocking pass. Progress lives in D1's own
   backfill_state table (key/value), advanced by exactly one bounded unit
   of work per call: one browse page, or one starred group's full history.
   Once every browse page and every starred group has been processed,
   phase flips to "done" and this becomes a cheap no-op forever after --
   steady-state coverage from then on comes from runScheduledAlert's own
   extended sync (worker/scheduled.ts), not this function. */
export async function runBackfillTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const phase = (await getBackfillState(db, "phase")) || "browse";
  if (phase === "done") return;

  if (phase === "browse") {
    const page = Number((await getBackfillState(db, "browse_page")) || "1");
    const { hasMore } = await processBrowsePage(env, page);
    if (hasMore) {
      await setBackfillState(db, "browse_page", String(page + 1));
    } else {
      await setBackfillState(db, "phase", "starred_groups");
      await setBackfillState(db, "starred_group_index", "0");
    }
    return;
  }

  // phase === "starred_groups"
  const index = Number((await getBackfillState(db, "starred_group_index")) || "0");
  if (index >= STARRED_GROUPS.length) {
    await setBackfillState(db, "phase", "done");
    return;
  }
  await processStarredGroup(env, STARRED_GROUPS[index]);
  await setBackfillState(db, "starred_group_index", String(index + 1));
}

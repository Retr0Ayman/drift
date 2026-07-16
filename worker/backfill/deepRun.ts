import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { FRANCHISE_SEED_TITLES } from "../shared/franchiseSeeds";
import { handleXrelSearch } from "../routes/xrel/index";
import { groupRowsByTitle } from "./parse";
import { resolveAndEnrichBatch } from "./resolve";
import { getBackfillState, setBackfillState, upsertGames } from "./db";

interface SearchResponse {
  list?: RawXrelRelease[];
}

// Same batch-per-tick shape processBrowsePage already uses for a full browse
// page (60-90 titles resolved+enriched in one invocation, internally chunked
// by resolveAndEnrichBatch's own RESOLVE_BATCH_SIZE) -- this is a smaller
// per-tick unit (each seed title is its own xREL search call first, unlike
// browse which gets 100 rows in one call), but the same order of magnitude.
// Reduced from 20 -- processSeedTitleWithRetry's up-to-3-attempt retry
// means a tick with several partial-failure seeds now takes meaningfully
// longer than a straight-through pass, so this stays smaller to keep worst-
// case tick duration bounded.
const SEEDS_PER_TICK = 15;

/* One xREL title search per seed -- confirmed live during the Watch Dogs 2
   investigation that /api/xrel's search-by-title has no date cap (2014-2018
   CPY/PLAZA/DUPLEX releases all came back fine), unlike release/
   browse_category.json (the historical backfill's only source), which xREL
   itself caps at 50 pages / ~5000 results and only reaches back to roughly
   the last year. Reuses groupRowsByTitle's existing "real Windows master_game
   only" filter and resolveAndEnrichBatch/upsertGames's existing resolve+write
   path -- no new write logic, same "never insert without a real resolved
   appid" rule already enforced there.

   Returns how many of this seed's grouped titles actually got written
   (enrichments.size), not just how many were found (grouped.size) --
   resolveAndEnrichBatch's own comment already documents that concurrent
   Steam resolve calls under real load sometimes fail individually; a seed
   whose search succeeds but whose resolve step partially misses must be
   distinguishable from one that genuinely found nothing, so the caller can
   retry only the former. */
async function processSeedTitle(env: Env, title: string): Promise<{ found: number; written: number }> {
  const res = await handleXrelSearch({
    request: new Request(`https://internal.invalid/api/xrel?q=${encodeURIComponent(title)}`),
    env,
  });
  if (!res.ok) return { found: 0, written: 0 };
  const data = (await res.json()) as SearchResponse;
  const rows = data.list || [];
  if (!rows.length) return { found: 0, written: 0 };

  const grouped = groupRowsByTitle(rows);
  if (!grouped.size) return { found: 0, written: 0 };
  const titles = [...grouped.values()].map((g) => g.title);
  const enrichments = await resolveAndEnrichBatch(env, titles);
  await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);
  return { found: grouped.size, written: enrichments.size };
}

/* Up to 3 attempts total, short backoff between -- a title search that came
   back empty is treated as a clean "nothing to find" on the first genuine
   try (not retried needlessly), but a partial write (found some games,
   resolved fewer than that) is retried, since that gap is exactly the
   transient-Steam-resolve-under-load signature this file's other comment
   already describes, not a real "this game has no appid" result. */
async function processSeedTitleWithRetry(env: Env, title: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { found, written } = await processSeedTitle(env, title);
      if (found === 0 || written >= found) return;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}

/* Resumable, one-time deep pass over every title in FRANCHISE_SEED_TITLES --
   separate progress markers (deep_phase/deep_seed_index) from the existing
   historical backfill's (phase/browse_page/starred_group_index) in the same
   backfill_state table, so this runs independently without disturbing that
   backfill's own state or the browse-feed/starred-groups logic it already
   owns. Becomes a cheap no-op forever once every seed's been processed,
   same "safe to leave the cron trigger in place permanently" pattern
   runBackfillTick already uses. */
export async function runDeepBackfillTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const phase = (await getBackfillState(db, "deep_phase")) || "seeding";
  if (phase === "done") return;

  const index = Number((await getBackfillState(db, "deep_seed_index")) || "0");
  if (index >= FRANCHISE_SEED_TITLES.length) {
    await setBackfillState(db, "deep_phase", "done");
    return;
  }

  const batch = FRANCHISE_SEED_TITLES.slice(index, index + SEEDS_PER_TICK);
  for (const title of batch) {
    // processSeedTitleWithRetry already retries a partial-resolve failure up
    // to 3 times internally -- this outer catch is only for something even
    // that gives up on (e.g. a malformed upstream response on every
    // attempt), which must not stall the rest of this tick's batch.
    try {
      await processSeedTitleWithRetry(env, title);
    } catch {
      // skip, move on to the next seed
    }
  }

  const nextIndex = index + batch.length;
  await setBackfillState(db, "deep_seed_index", String(nextIndex));
  if (nextIndex >= FRANCHISE_SEED_TITLES.length) {
    await setBackfillState(db, "deep_phase", "done");
  }
}

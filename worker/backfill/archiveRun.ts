import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { handleXrelArchive } from "../routes/xrel/archive";
import { groupRowsByTitle } from "./parse";
import { resolveAndEnrichBatch } from "./resolve";
import { getBackfillState, setBackfillState, upsertGames } from "./db";

interface ArchiveResponse {
  list?: RawXrelRelease[];
  pagination?: { total_pages?: number };
}

// Smaller than the browse backfill's one-page-per-tick (which gets ~60-90
// distinct titles from a single call) -- an archive page is filtered down
// from *all* xREL categories (TV/movies/etc, confirmed live: only ~4% of
// any given page is actually a master_game release), so most of each
// tick's work is wasted-but-necessary filtering, not real enrichment calls.
// Kept conservative on top of that: this now runs as a fourth concurrent
// cron alongside the other three, and the freshness-regression investigation
// already showed heavier per-tick batches are where things start silently
// failing under real concurrent load.
const PAGES_PER_TICK = 10;
const PER_PAGE = 100;

// Bounded, not "crawl xREL's entire history forever" -- 36 months back from
// just before the browse-feed backfill's own coverage starts (that file's
// own comment: browse_category.json only reaches back to ~September 2025).
// A real, finite job that substantially deepens the catalog instead of an
// open-ended multi-week crawl with no defined end state.
const MONTHS_TO_WALK = 36;
const START_MONTH = "2025-08";
// Defense-in-depth against the exact failure mode already caught live once
// (a month whose real data runs out well before its own reported
// total_pages, with nothing catching that and advancing to the next
// month) -- if some other month somehow doesn't 416 the way 2025-08 did,
// this still forces a move on regardless rather than looping forever.
const MAX_PAGES_PER_MONTH = 300;

function monthMinus(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* One archive page: all-categories, client-filtered to real Windows
   master_game releases via the same groupRowsByTitle used everywhere else,
   then the same resolve+enrich+upsert path -- no new write logic. A page
   that errors is reported as "has more" so the same page gets retried next
   iteration rather than silently skipped -- EXCEPT a 416, which xREL uses
   specifically for "genuinely past the real end" (confirmed live: page 1
   reports total_pages: 220 for a month whose real data actually runs out
   and 416s around page 100 -- that pagination count is unreliable for this
   endpoint, same lesson search/releases.json already taught elsewhere in
   this codebase). Treating a 416 as "retry forever" instead of "this month
   is done" was the actual bug that stalled this entire backfill on its
   very first month -- every tick burned its whole page budget re-hitting
   the same dead end instead of ever advancing to the next month. */
async function processArchivePage(env: Env, month: string, page: number): Promise<{ hasMore: boolean }> {
  const res = await handleXrelArchive({
    request: new Request(`https://internal.invalid/api/xrel/archive?month=${month}&page=${page}&per_page=${PER_PAGE}`),
    env,
  });
  if (res.status === 416) return { hasMore: false };
  if (!res.ok) return { hasMore: true };
  const data = (await res.json()) as ArchiveResponse;
  const rows = data.list || [];
  // Real total_pages can't be trusted (see above) -- page < totalPages is
  // now just a soft cap that should never actually bind in practice, the
  // 416 check above is the real stopping signal.
  const totalPages = data.pagination?.total_pages ?? 1;

  const grouped = groupRowsByTitle(rows);
  if (grouped.size) {
    const titles = [...grouped.values()].map((g) => g.title);
    const enrichments = await resolveAndEnrichBatch(env, titles);
    await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);
  }

  return { hasMore: page < totalPages };
}

/* Resumable, bounded deep-archive crawl -- walks backward month by month
   from START_MONTH, page by page within each month, for MONTHS_TO_WALK
   months total. Own progress markers (archive_month/archive_page/
   archive_months_walked/archive_phase) in the shared backfill_state table,
   doesn't touch any other backfill's own state. Becomes a cheap no-op
   forever once archive_phase reaches "done", same pattern every other
   backfill in this project already uses. */
export async function runArchiveBackfillTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const phase = (await getBackfillState(db, "archive_phase")) || "walking";
  if (phase === "done") return;

  let month = (await getBackfillState(db, "archive_month")) || START_MONTH;
  let page = Number((await getBackfillState(db, "archive_page")) || "1");
  let monthsWalked = Number((await getBackfillState(db, "archive_months_walked")) || "0");

  for (let i = 0; i < PAGES_PER_TICK; i++) {
    if (monthsWalked >= MONTHS_TO_WALK) {
      await setBackfillState(db, "archive_phase", "done");
      return;
    }

    let hasMore = true;
    try {
      const result = await processArchivePage(env, month, page);
      hasMore = result.hasMore;
    } catch {
      // Leave hasMore true so the same page is retried next iteration --
      // one bad page must not silently skip a chunk of a month's history.
    }

    if (hasMore && page < MAX_PAGES_PER_MONTH) {
      page++;
    } else {
      monthsWalked++;
      month = monthMinus(START_MONTH, monthsWalked);
      page = 1;
    }
  }

  await setBackfillState(db, "archive_month", month);
  await setBackfillState(db, "archive_page", String(page));
  await setBackfillState(db, "archive_months_walked", String(monthsWalked));
}

import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { handleXrelSearch } from "./xrel/index";
import { groupRowsByTitle } from "../backfill/parse";
import { resolveAndEnrichBatch } from "../backfill/resolve";
import { upsertGames } from "../backfill/db";
import type { RawXrelRelease } from "../shared/xrel";

interface SearchResponse {
  list?: RawXrelRelease[];
}

/* One-off manual catch-up for a title that genuinely has real xREL releases
   but hasn't been discovered yet -- confirmed live need: Red Dead
   Redemption 2 has real, non-nuked crack history (EMPRESS's original 2020
   hypervisor crack, FitGirl/ElAmigos repacks, x.X.RIDDICK.X.x, all real,
   confirmed live via xREL search) but was entirely absent from the
   catalog, because worker/backfill/archiveRun.ts's month-by-month deep
   crawl is bounded (MONTHS_TO_WALK=36 back from START_MONTH="2025-08",
   i.e. only reaches to ~2022-08) and resumable/slow (10 pages/tick) --
   RDR2's earliest real crack predates that window entirely, and even its
   in-window 2024 update releases may simply not have been reached yet by
   the cursor. Same resolve+enrich+upsert path every backfill tick already
   runs (groupRowsByTitle -> resolveAndEnrichBatch -> upsertGames, see
   archiveRun.ts's own processArchivePage), just driven by a live xREL
   *search* for one specific title instead of a sequential archive-month
   crawl -- so this can pick up a title's full available release history
   in one call regardless of how far any cursor has progressed. Same "no
   auth, idempotent, only ever does what a cron would do anyway" reasoning
   as /api/admin/refresh-game. */
export const handleAdminSeedTitle: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const title = url.searchParams.get("title");
  if (!title) return json({ error: "pass ?title=<game title>" }, 5, 400);

  const searchRes = await handleXrelSearch({
    request: new Request("https://internal.invalid/api/xrel?q=" + encodeURIComponent(title)),
    env,
  });
  if (!searchRes.ok) return json({ error: "xREL search failed" }, 5, 502);
  const data = (await searchRes.json()) as SearchResponse;
  const grouped = groupRowsByTitle(data.list || []);
  if (!grouped.size) return json({ seeded: [], note: "no real Windows master_game releases found for that title" }, 5);

  const titles = [...grouped.values()].map((g) => g.title);
  const enrichments = await resolveAndEnrichBatch(env, titles);
  const written = await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);

  const seeded = [...grouped.values()].map((g) => ({
    id: g.id,
    title: g.title,
    releaseCount: g.releases.length,
    resolved: enrichments.has(g.title),
    appid: enrichments.get(g.title)?.appid ?? null,
    tags: enrichments.get(g.title)?.tags ?? null,
  }));
  return json({ seeded, statementsWritten: written }, 5);
};

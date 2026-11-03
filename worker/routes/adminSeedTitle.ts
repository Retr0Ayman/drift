import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { handleXrelSearch } from "./xrel/index";
import { groupRowsByTitle, slugify, type ParsedGame } from "../backfill/parse";
import { resolveAndEnrichBatch, type Enrichment } from "../backfill/resolve";
import { upsertGames } from "../backfill/db";
import type { RawXrelRelease } from "../shared/xrel";
import { isAdminAuthorized } from "../shared/adminAuth";

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
  if (!isAdminAuthorized(request, env)) return json({ error: "unauthorized" }, 5, 401);
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

  /* FIX (reported live: "games like the new MW4 and Phantom Blade 0 aren't
     there at all"): every path that creates a games row -- the browse-feed
     backfill, starred groups, the franchise-seeded deep backfill, the
     archive crawl, steady-state sync, and this route's own normal path
     above -- derives that row from an xREL RELEASE. So a real, highly
     anticipated game simply cannot exist in this catalog until somebody
     cracks it: confirmed live, xREL has zero releases for Phantom Blade
     Zero and none for Modern Warfare 4, while Steam resolves both cleanly
     (appid 4115450 and 4435490).

     That's backwards for this site specifically. The UI already has real
     "Unreleased"/"Uncracked" states, and the Crack ETA Predictor, the
     Denuvo tracker and the watchlist are all most useful for exactly the
     titles nobody has cracked yet -- someone arriving to ask "is MW4
     cracked?" currently gets nothing at all, which reads as the site being
     broken rather than as an honest "not yet."

     So when xREL genuinely returns nothing, fall back to a Steam-only
     insert: a real resolved appid with real Steam metadata and an empty
     release list, which gStatus/statusMeta already render honestly as
     Unreleased/Uncracked. No fabricated crack data is involved -- the game
     is added with zero releases precisely because there are zero.

     Deliberately only when the xREL search SUCCEEDED (a non-ok response
     already returned 502 above): if xREL is merely unreachable, a game
     that does have cracks must not be written as a crackless row. And if a
     crack later appears, upsertGames' own appid-canonical identity merges
     it into THIS row rather than spawning a duplicate, so seeding early is
     safe.

     Note this is NOT gated on the search returning zero rows. Confirmed
     live on the actual reported case: searching "Call of Duty: Modern
     Warfare 4" returns 61 xREL rows -- all for OLDER entries in the
     franchise (MW3 PS5, MW2 Campaign Remastered, MW Remastered) and none
     for MW4 itself. So this route happily seeded those and still left the
     requested title missing. A new entry in an established franchise is
     exactly the case where a fuzzy title search is dominated by its own
     predecessors, which makes "did the search return anything at all" the
     wrong question. The right one is whether the REQUESTED title now
     exists, which is what's checked below -- by resolved appid, not by
     title text, since Steam's canonical name ("Call of Duty(R): Modern
     Warfare(R) 4") rarely matches what was typed. */
  let seeded: Array<{ id: string; title: string; releaseCount: number; resolved: boolean; appid: number | null; tags: string[] | null }> = [];
  let written = 0;
  let enrichments = new Map<string, Enrichment>();

  if (grouped.size) {
    const titles = [...grouped.values()].map((g) => g.title);
    enrichments = await resolveAndEnrichBatch(env, titles);
    written = await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);
    seeded = [...grouped.values()].map((g) => ({
      id: g.id,
      title: g.title,
      releaseCount: g.releases.length,
      resolved: enrichments.has(g.title),
      appid: enrichments.get(g.title)?.appid ?? null,
      tags: enrichments.get(g.title)?.tags ?? null,
    }));
  }

  const requestedMap = await resolveAndEnrichBatch(env, [title]);
  const requested = requestedMap.get(title);
  if (!requested) {
    return json(
      { seeded, statementsWritten: written, note: grouped.size ? "seeded what xREL matched; the requested title itself has no Steam match" : "no xREL releases, and no Steam match for that title either" },
      5,
    );
  }

  const alreadySeeded = [...enrichments.values()].some((e) => e.appid === requested.appid);
  if (alreadySeeded) return json({ seeded, statementsWritten: written }, 5);

  const game: ParsedGame = {
    id: slugify(requested.title || title),
    xrel_key: "",
    title,
    year: requested.year ?? null,
    releases: [],
  };
  written += await upsertGames(env.orlaz_catalog, [game], requestedMap);
  seeded.push({
    id: game.id,
    title: requested.title || title,
    releaseCount: 0,
    resolved: true,
    appid: requested.appid,
    tags: requested.tags,
  });

  return json({ seeded, statementsWritten: written, note: "requested title had no xREL releases of its own -- added from Steam as uncracked" }, 5);
};

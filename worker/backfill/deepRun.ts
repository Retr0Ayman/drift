import type { Env } from "../shared/env";
import type { RawXrelRelease } from "../shared/xrel";
import { FRANCHISE_SEED_TITLES } from "../shared/franchiseSeeds";
import { handleXrelSearch } from "../routes/xrel/index";
import { groupRowsByTitle, slugify } from "./parse";
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
/* Retried across ticks, not just within one: a seed that keeps failing is
   given up on after this many ticks, so a title that can never resolve
   (delisted, or xREL files it under a name Steam can't match) can't hold a
   slot at the front of the queue forever. */
const MAX_SEED_ATTEMPTS = 4;

/* True when xREL returned a group that IS this seed (same slug, or the seed
   plus a dash-separated xREL disambiguator like "...-2022") but it never
   resolved against Steam -- i.e. the game exists and was dropped. Siblings
   from the same fuzzy search (a predecessor, an unrelated "...Battlefield...")
   failing to resolve says nothing about whether THIS seed landed, so they
   don't count. Exported for testing. */
export function seedTargetMissed(seed: string, groupedTitles: string[], resolvedTitles: Set<string>): boolean {
  const k = slugify(seed);
  return groupedTitles.some((t) => {
    const s = slugify(t);
    const isTarget = s === k || s.startsWith(`${k}-`) || k.startsWith(`${s}-`);
    return isTarget && !resolvedTitles.has(t);
  });
}

async function processSeedTitle(env: Env, title: string): Promise<{ found: number; written: number; targetMissed: boolean }> {
  const res = await handleXrelSearch({
    request: new Request(`https://internal.invalid/api/xrel?q=${encodeURIComponent(title)}`),
    env,
  });
  if (!res.ok) return { found: 0, written: 0, targetMissed: false };
  const data = (await res.json()) as SearchResponse;
  const rows = data.list || [];
  if (!rows.length) return { found: 0, written: 0, targetMissed: false };

  const grouped = groupRowsByTitle(rows);
  if (!grouped.size) return { found: 0, written: 0, targetMissed: false };
  const titles = [...grouped.values()].map((g) => g.title);
  const enrichments = await resolveAndEnrichBatch(env, titles);
  await upsertGames(env.orlaz_catalog, [...grouped.values()], enrichments);
  return {
    found: grouped.size,
    written: enrichments.size,
    targetMissed: seedTargetMissed(title, titles, new Set(enrichments.keys())),
  };
}

/* Up to 3 attempts total, short backoff between -- a title search that came
   back empty is treated as a clean "nothing to find" on the first genuine
   try (not retried needlessly), but a partial write (found some games,
   resolved fewer than that) is retried, since that gap is exactly the
   transient-Steam-resolve-under-load signature this file's other comment
   already describes, not a real "this game has no appid" result. */
async function processSeedTitleWithRetry(env: Env, title: string): Promise<boolean> {
  // Whether the seed itself landed, as opposed to whether every sibling in
  // xREL's fuzzy search did -- the caller only gives up on a seed that
  // genuinely never landed. Starts pessimistic so an attempt that throws
  // every time (a malformed upstream response) counts as a miss.
  let landed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { found, written, targetMissed } = await processSeedTitle(env, title);
      landed = !targetMissed;
      if (found === 0 || written >= found) return landed;
    } catch {
      landed = false;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return landed;
}

/* FIX (confirmed live, RDR2-missing investigation): this used to track
   progress as a bare numeric index into FRANCHISE_SEED_TITLES
   (deep_seed_index) and short-circuit entirely once deep_phase reached
   "done". That's silently wrong for a list this file's own header comment
   already documents as meant to grow over time by hand -- confirmed live
   against production D1: deep_phase was "done" with deep_seed_index at
   359, yet "red dead redemption 2" sits at index 177 in the CURRENT array
   and was never written. The only way that happens is the Rockstar block
   (grand theft auto v/vi/trilogy/iv, red dead redemption 2/1, l.a. noire,
   max payne) got inserted into the MIDDLE of this array after the cursor
   had already walked past that position under an earlier, shorter/
   differently-ordered version of the list -- a numeric index has no way to
   tell "this position held an already-processed title" apart from "this
   position now holds a brand-new one after an edit", so anything inserted
   at or before the cursor's already-reached position was permanently
   skipped with phase stuck at "done" and no error anywhere to surface it.

   Tracking a persisted SET of already-processed title STRINGS instead
   (deep_seed_done, JSON-encoded) fixes this structurally: membership is by
   title text, not array position, so it's immune to future insertions
   anywhere in FRANCHISE_SEED_TITLES regardless of where they land. First
   run under this fix starts from an empty set (deep_seed_index/its old
   "done" phase are no longer read) and re-walks every seed title once --
   wasteful-looking but harmless (upsertGames is already idempotent, same
   ON CONFLICT DO UPDATE every other backfill relies on) and is exactly
   what actually self-heals this bug's full blast radius, not just RDR2's
   own case: any other franchise title added to companies.ts's
   FRANCHISE_MAP after the original list reached "done", wherever it
   landed, gets genuinely re-checked instead of staying silently stuck. */
export async function runDeepBackfillTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const doneRaw = await getBackfillState(db, "deep_seed_done");
  const done = new Set<string>(doneRaw ? (JSON.parse(doneRaw) as string[]) : []);

  const remaining = FRANCHISE_SEED_TITLES.filter((t) => !done.has(t));
  if (!remaining.length) {
    await setBackfillState(db, "deep_phase", "done");
    return;
  }

  // Read only once there's real work, so the steady-state tick (every seed
  // done) stays a single backfill_state read.
  const failsRaw = await getBackfillState(db, "deep_seed_fails");
  const fails: Record<string, number> = failsRaw ? (JSON.parse(failsRaw) as Record<string, number>) : {};

  const batch = remaining.slice(0, SEEDS_PER_TICK);
  for (const title of batch) {
    // FIX (confirmed live, 2026-11-03): this used to add every seed to `done`
    // unconditionally, success or not. So a single bad moment from Steam
    // (processSeedTitleWithRetry only retries inside one tick) permanently
    // skipped a game: Monster Hunter Wilds -- with a DenuvOwO hypervisor
    // release -- Battlefield 3 (7 releases) and Total War: Pharaoh were all
    // missing from the catalog for exactly this reason, and all three
    // resolved and seeded fine when re-run by hand. A seed now only becomes
    // done once it actually lands, or after MAX_SEED_ATTEMPTS ticks of not
    // landing, so a transient failure gets retried later and a title that can
    // never resolve still can't hold a queue slot forever.
    let landed = false;
    try {
      landed = await processSeedTitleWithRetry(env, title);
    } catch {
      // skip, move on to the next seed
    }
    if (landed) {
      done.add(title);
      delete fails[title];
    } else {
      fails[title] = (fails[title] || 0) + 1;
      if (fails[title] >= MAX_SEED_ATTEMPTS) {
        done.add(title);
        delete fails[title];
      }
    }
  }

  await setBackfillState(db, "deep_seed_fails", JSON.stringify(fails));
  await setBackfillState(db, "deep_seed_done", JSON.stringify([...done]));
  await setBackfillState(db, "deep_phase", done.size >= FRANCHISE_SEED_TITLES.length ? "done" : "seeding");
}

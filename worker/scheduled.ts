import type { Env } from "./shared/env";
import { handleXrelBrowse } from "./routes/xrel/browse";
import { handleXrelGroup } from "./routes/xrel/group";
import { handleXrelP2PGroup } from "./routes/xrel/p2pGroup";
import type { RawXrelRelease } from "./shared/xrel";
import { STARRED_GROUPS, methodForGroup, isRepackGroup, isAnonymousUpload, isWindowsRelease } from "./shared/constants";
import { groupRowsByTitle } from "./backfill/parse";
import { resolveAndEnrichBatch } from "./backfill/resolve";
import { upsertGames, existingGameIds } from "./backfill/db";
import { withSubrequestBudget } from "./shared/subrequestBudget";
import { runGroupReliabilityTick } from "./backfill/groupReliability";
import { runDenuvoRemovalStatsTick } from "./backfill/denuvoRemoval";
import { runCrackEtaStatsTick } from "./backfill/crackEta";

interface ListResponse {
  list?: RawXrelRelease[];
}

const SEEDED_MARKER_KEY = "__seeded__";

/* Pulls the same two sources the frontend's catalog relies on: page 1 of the
   main Windows browse feed, plus each starred P2P group's full history (P2P
   groups never show up in /browse at all -- see xrel/group.ts's own comment
   for why). Calls the route handlers directly with a synthetic same-origin
   Request rather than a real self-fetch back into this Worker -- identical
   logic and xREL-side caching, no extra network hop.

   Each starred group is upgraded from the capped/relevance-sorted search
   baseline (xrel/group.ts) to the genuinely-paginated p2p/releases.json
   source (xrel/p2pGroup.ts) whenever it turns up more -- same upgrade
   worker/backfill/run.ts's processStarredGroup already does, and for the
   same reason: the baseline's own doc comment admits its pagination is
   dead (xREL replays page 1 for every page), so its "most recent" result
   can sit weeks stale even though the group has posted more recently.
   Without this upgrade here, every 15-minute alert/D1-sync tick was
   checking a source that could already be stale on arrival. */
/* FIX (confirmed live gap, reliability sweep): none of the three fetch+parse
   steps below were isolated -- a malformed/empty body from xREL (a real,
   observed failure mode elsewhere in this codebase, see appdetails.ts's own
   history) makes `.json()` throw, and a raw network-level failure makes the
   `fetch()` inside handleXrelBrowse/handleXrelGroup/handleXrelP2PGroup throw
   too. Either one, uncaught, propagated all the way out of collectCandidates
   -- meaning ONE starred group having a bad moment took down the ENTIRE
   15-minute tick, both the Discord alert path and the D1 steady-state sync,
   not just that one group's slice. Every other fetch loop in this codebase
   (resolveAndEnrichBatch, drmBackfillRun, lookupDrmForAppids) already
   isolates per-item failures so one bad item can't sink an entire batch --
   this brings collectCandidates in line with that same discipline. */
export async function collectCandidates(env: Env): Promise<RawXrelRelease[]> {
  const seen = new Map<string, RawXrelRelease>();

  try {
    const browseRes = await handleXrelBrowse({
      request: new Request("https://internal.invalid/api/xrel/browse?page=1&per_page=100"),
      env,
    });
    if (browseRes.ok) {
      const data = (await browseRes.json()) as ListResponse;
      for (const rel of data.list || []) seen.set(rel.id, rel);
    }
  } catch {
    // Browse feed having a bad moment must not stop the starred-group loop
    // below from still contributing whatever it can this tick.
  }

  for (const name of STARRED_GROUPS) {
    try {
      const groupRes = await handleXrelGroup({
        request: new Request(`https://internal.invalid/api/xrel/group?name=${encodeURIComponent(name)}`),
        env,
      });
      let rows: RawXrelRelease[] = [];
      if (groupRes.ok) rows = ((await groupRes.json()) as ListResponse).list || [];

      const groupId = rows.find((r) => r.group_id)?.group_id;
      if (groupId) {
        try {
          const deepRes = await handleXrelP2PGroup({
            request: new Request(`https://internal.invalid/api/xrel/p2p-group?max_pages=1&group_id=${encodeURIComponent(groupId)}`),
            env,
          });
          if (deepRes.ok) {
            const deepRows = ((await deepRes.json()) as ListResponse).list || [];
            if (deepRows.length > rows.length) rows = deepRows;
          }
        } catch {
          // Deep P2P upgrade failing still leaves the baseline `rows` from
          // the search endpoint above intact -- degrade, don't lose it.
        }
      }

      for (const rel of rows) seen.set(rel.id, rel);
    } catch {
      // One starred group's lookup failing must not lose every other
      // group's (or the browse feed's) already-collected candidates.
    }
  }

  return [...seen.values()];
}

/* Same "is this actually a real Windows game crack" bar the frontend applies
   in src/lib/catalog.ts's parseReleaseRows -- without it, a TV/movie entry
   sharing xREL's API, a non-Windows platform release, or a repack/anonymous
   reupload could trigger an alert that misrepresents what actually
   happened (a repack didn't crack anything; crediting one here would be the
   same mislabel isRepackGroup/isAnonymousUpload guard against everywhere
   else in this app). */
export function isAlertable(rel: RawXrelRelease): boolean {
  const ext = rel.ext_info || {};
  if (ext.type && ext.type !== "master_game") return false;
  if (!ext.title) return false;
  if (!isWindowsRelease(rel.dirname || "")) return false;
  const group = rel.group_name || "";
  if (isRepackGroup(group) || isAnonymousUpload(group)) return false;
  return true;
}

async function postDiscordAlert(webhookUrl: string, rels: RawXrelRelease[]): Promise<void> {
  const embeds = rels.map((rel) => {
    const group = rel.group_name || "unknown";
    const method = methodForGroup(group);
    return {
      title: rel.ext_info?.title || rel.dirname,
      description: `${method === "hv" ? "Hypervisor" : "Traditional"} crack by **${group}**`,
      url: rel.link_href || undefined,
      color: method === "hv" ? 0xb072f5 : 0x2de2d1,
    };
  });

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: rels.length === 1 ? "New crack tracked:" : `${rels.length} new cracks tracked:`,
      embeds,
    }),
  });
}

/* Cron-triggered (see wrangler.jsonc's `triggers.crons`): diffs newly-seen
   release IDs against the SEEN_RELEASES KV namespace and posts a Discord
   embed for anything genuinely new. First-ever run seeds SEEN_RELEASES with
   everything currently visible *without* alerting on any of it -- otherwise
   the first cron tick after this ships would post one alert per release
   already sitting in the catalog, which isn't "new" by any reasonable
   reading of the feature. Both env bindings are optional at the type level
   for exactly this reason: a deploy can land before the KV namespace is
   created and the webhook secret is set (both require manual, non-scriptable
   Cloudflare/Discord dashboard steps -- see DEPLOY.md), and this should
   silently no-op until then rather than error every 15 minutes. */
export async function runScheduledAlert(env: Env, candidates?: RawXrelRelease[]): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL || !env.SEEN_RELEASES) return;

  const releases = (candidates ?? (await collectCandidates(env))).filter(isAlertable);

  const alreadySeeded = await env.SEEN_RELEASES.get(SEEDED_MARKER_KEY);
  if (!alreadySeeded) {
    await Promise.all(releases.map((rel) => env.SEEN_RELEASES.put(`rel:${rel.id}`, "1")));
    await env.SEEN_RELEASES.put(SEEDED_MARKER_KEY, "1");
    return;
  }

  const newReleases: RawXrelRelease[] = [];
  for (const rel of releases) {
    const already = await env.SEEN_RELEASES.get(`rel:${rel.id}`);
    if (!already) newReleases.push(rel);
  }
  if (!newReleases.length) return;

  await Promise.all(newReleases.map((rel) => env.SEEN_RELEASES.put(`rel:${rel.id}`, "1")));

  // Discord caps embeds at 10 per message -- chunk rather than truncate so
  // an unusually busy 15-minute window still alerts on everything found.
  for (let i = 0; i < newReleases.length; i += 10) {
    await postDiscordAlert(env.DISCORD_WEBHOOK_URL, newReleases.slice(i, i + 10));
  }
}

/* orlaz Phase 3: once the resumable backfill (worker/backfill/run.ts) has
   walked the full catalog, this is what keeps D1 current from then on --
   collectCandidates() already pulls exactly the "what's new right now"
   slice (browse page 1 + every starred group) every 15 minutes for the
   Discord alerts above; upserting that same slice into D1 too means no
   second, separate ongoing crawl is needed. Runs every tick regardless of
   backfill phase, not gated on it -- this is a small, cheap, idempotent
   upsert (the ts-based WHERE clause in upsertGames' release upsert is a
   no-op when nothing's actually changed), so there's no harm running it
   in parallel with the slower historical backfill still working through
   older pages in the background. Unlike runScheduledAlert, this doesn't
   depend on the Discord webhook/KV being configured -- D1 is already
   provisioned (see shared/env.ts), so this can run from the very first
   deploy. */
/* Max NEW (not yet in D1) titles resolved+enriched per tick. Each costs
   roughly 4-6 subrequests (resolve, appdetails, colour sample, hi-res header
   probe), so this is what keeps the sync inside its budget. Titles D1
   already has need no enrichment at all -- upsertGames writes their release
   rows without it -- so previously re-resolving EVERY title in the three
   starred groups' histories each tick was what blew past 50 subrequests and
   silently dropped most of the work. Overflow titles are simply picked up on
   the next tick (they are still absent from D1). */
export const SYNC_NEW_TITLE_CAP = 3;

export async function runSteadyStateSync(env: Env, candidates?: RawXrelRelease[]): Promise<void> {
  const grouped = groupRowsByTitle(candidates ?? (await collectCandidates(env)));
  const games = [...grouped.values()];
  const known = await existingGameIds(env.orlaz_catalog, games.map((g) => g.id));
  const fresh = games.filter((g) => !known.has(g.id)).slice(0, SYNC_NEW_TITLE_CAP);
  const enrichments = await resolveAndEnrichBatch(env, fresh.map((g) => g.title));
  await upsertGames(env.orlaz_catalog, games, enrichments);
}

// Per-task subrequest budgets for the 15-minute slot (Workers Free: 50 per
// invocation). Collect 7 typical (1 browse + 3 groups x (search + 1 p2p
// page)), sync <= 3 new titles x ~6, leaving room for D1 and the aggregates.
const BUDGET_COLLECT = 12;
const BUDGET_SYNC = 22;

async function guarded(name: string, task: () => Promise<unknown>): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (e) {
    console.error(`slot15 ${name} failed:`, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return false;
  }
}

/* The whole 15-minute invocation, run SEQUENTIALLY so the cheap, important
   work (Discord alert, steady-state sync) goes first and can never be
   starved by whatever follows, and so each task has its own enforced
   subrequest budget (worker/shared/subrequestBudget.ts). Candidates are
   collected ONCE and shared -- the alert and the sync each used to collect
   their own copy, doubling the xREL traffic. The pure-D1 aggregates run last
   and need no external fetches. The Steam stale-refresh sweep no longer
   lives here: see worker/index.ts (it runs in the housekeeping slot's idle
   minutes, where it has a whole invocation to itself). */
export async function runFifteenMinuteSlot(env: Env): Promise<void> {
  let candidates: RawXrelRelease[] = [];
  await guarded("collect", async () => {
    candidates = await withSubrequestBudget(BUDGET_COLLECT, () => collectCandidates(env));
  });
  const alert = await guarded("alert", () => runScheduledAlert(env, candidates));
  const sync = candidates.length ? await guarded("sync", () => withSubrequestBudget(BUDGET_SYNC, () => runSteadyStateSync(env, candidates))) : false;
  await Promise.all([
    guarded("groupReliability", () => runGroupReliabilityTick(env)),
    guarded("denuvoRemoval", () => runDenuvoRemovalStatsTick(env)),
    guarded("crackEta", () => runCrackEtaStatsTick(env)),
  ]);
  console.log(`slot15 done candidates=${candidates.length} alert=${alert} sync=${sync}`);
}

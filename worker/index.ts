import type { Env } from "./shared/env";
import type { Handler } from "./shared/types";
import { CORS } from "./shared/http";
import { handleAppdetails } from "./routes/appdetails";
import { handleResolve } from "./routes/resolve";
import { handleBuild } from "./routes/build";
import { handleXrelSearch } from "./routes/xrel/index";
import { handleXrelBrowse } from "./routes/xrel/browse";
import { handleXrelArchive } from "./routes/xrel/archive";
import { handleXrelInfo } from "./routes/xrel/info";
import { handleXrelNfo } from "./routes/xrel/nfo";
import { handleXrelGroup } from "./routes/xrel/group";
import { handleXrelP2PGroup } from "./routes/xrel/p2pGroup";
import { handleFaq } from "./routes/faq";
import { handleFx } from "./routes/fx";
import { handleSummary } from "./routes/summary";
import { handleDigest } from "./routes/digest";
import { handleFact } from "./routes/fact";
import { handleOutlook } from "./routes/outlook";
import { handleSearchAssist } from "./routes/searchAssist";
import { handleSitemap } from "./routes/sitemap";
import { handleBadge } from "./routes/badge";
import { handleWishlist } from "./routes/wishlist";
import { handleFeed } from "./routes/feed";
import { handleCatalog } from "./routes/catalog";
import { handleCatalogGame } from "./routes/catalogGame";
import { handleWatchlistTrack } from "./routes/watchlistTrack";
import { handleTrending } from "./routes/trending";
import { handleWatchlistSync } from "./routes/watchlistSync";
import { runScheduledAlert, runSteadyStateSync } from "./scheduled";
import { runBackfillTick } from "./backfill/run";
import { runDeepBackfillTick } from "./backfill/deepRun";
import { runArchiveBackfillTick } from "./backfill/archiveRun";
import { runDrmRecheckTick } from "./backfill/drmBackfillRun";
import { withSubrequestBudget } from "./shared/subrequestBudget";
import { runFirstSeenReconcileTick } from "./backfill/reconcileFirstSeen";
import { runStaleRefreshTick } from "./backfill/refreshStale";
import { runEnrichmentRepairTick } from "./backfill/repairEnrichment";
import { runHeaderUpgradeTick } from "./backfill/headerUpgrade";
import { runGroupReliabilityTick } from "./backfill/groupReliability";
import { handleGroupReliability, handleGroupReliabilityRecompute } from "./routes/groupReliability";
import { runDenuvoRemovalStatsTick } from "./backfill/denuvoRemoval";
import { handleDenuvoRemoval, handleDenuvoRemovalRecompute } from "./routes/denuvoRemoval";
import { runCrackEtaStatsTick } from "./backfill/crackEta";
import { handleCrackEta, handleCrackEtaRecompute } from "./routes/crackEta";
import { handleDenuvoStatus } from "./routes/denuvoStatus";
import { handleAdminRefreshGame } from "./routes/adminRefreshGame";
import { handleAdminSeedTitle } from "./routes/adminSeedTitle";

/* This is a Worker with static assets (wrangler.jsonc `main` + `assets`), not
   classic Cloudflare Pages -- confirmed live: the workers.dev domain and
   `wrangler deploy` model don't auto-route a `functions/` directory the way
   Pages Functions does. So this fetch handler explicitly routes /api/* to the
   handlers below and falls back to env.ASSETS.fetch(request) for everything
   else (the built SPA + its static files). */
// Must match the second/third/fourth/fifth entries in wrangler.jsonc's
// `triggers.crons` exactly -- ScheduledEvent.cron is how the one scheduled()
// handler below tells the five triggers apart. There's no sixth: Cloudflare
// caps a Worker at 5 cron triggers (confirmed live -- a 6th's schedules API
// call 400s), so the first-seen reconciliation piggybacks on this one
// instead of getting its own, the same way the 15-minute trigger already
// combines two unrelated tasks below.
const BACKFILL_CRON = "*/2 * * * *";
const DEEP_BACKFILL_CRON = "*/3 * * * *";
const DRM_RECHECK_CRON = "*/4 * * * *";
const HOUSEKEEPING_CRON = "*/5 * * * *";

// SUBREQUEST BUDGETS (Workers Free: 50 per invocation, retries and redirect
// hops included; D1/KV calls are also subrequests per Cloudflare's docs
// (separate 1,000 internal cap), so each budget leaves room for the task's own
// D1 calls and even the conservative reading stays under 50). Every cron slot
// is ONE invocation, so the budgets of whatever runs in it must sum well
// under 50. Enforced, not hoped for: see worker/shared/subrequestBudget.ts.
//
//   every 2 min   backfill (phase = done: no external calls)     unbudgeted
//   every 3 min   deep backfill + archive crawl (both done)      20 + 20
//   every 4 min   DRM recheck, ALONE in its invocation           38 (+~7 D1 = 45)
//   every 5 min   housekeeping, ONE task per invocation,         repair 34, reconcile 38,
//                 staggered by minute: :10 enrichment repair,    header 30 (each + a few
//                 :25 first-seen reconcile, :40 header upgrade;  D1 calls, <= 45)
//                 other minutes idle
//   every 15 min  alert + sync + stale refresh + aggregates      NOT budgeted here: its
//                 stale-refresh batch (150 rows) alone exceeds 50.
const BUDGET_DRM = 38;
const BUDGET_REPAIR = 34;
const BUDGET_RECONCILE = 38;
const BUDGET_HEADER = 30;
const BUDGET_DEEP = 20;
const BUDGET_ARCHIVE = 20;

const ROUTES: Record<string, Handler> = {
  "/api/appdetails": handleAppdetails,
  "/api/resolve": handleResolve,
  "/api/build": handleBuild,
  "/api/xrel": handleXrelSearch,
  "/api/xrel/browse": handleXrelBrowse,
  "/api/xrel/archive": handleXrelArchive,
  "/api/xrel/info": handleXrelInfo,
  "/api/xrel/nfo": handleXrelNfo,
  "/api/xrel/group": handleXrelGroup,
  "/api/xrel/p2p-group": handleXrelP2PGroup,
  "/api/faq": handleFaq,
  "/api/fx": handleFx,
  "/api/summary": handleSummary,
  "/api/digest": handleDigest,
  "/api/fact": handleFact,
  "/api/outlook": handleOutlook,
  "/api/badge": handleBadge,
  "/api/wishlist": handleWishlist,
  "/api/feed.xml": handleFeed,
  "/api/search-assist": handleSearchAssist,
  "/api/catalog": handleCatalog,
  "/api/catalog/game": handleCatalogGame,
  "/api/group-reliability": handleGroupReliability,
  "/api/group-reliability/recompute": handleGroupReliabilityRecompute,
  "/api/denuvo-removal": handleDenuvoRemoval,
  "/api/denuvo-removal/recompute": handleDenuvoRemovalRecompute,
  "/api/denuvo-status": handleDenuvoStatus,
  "/api/crack-eta": handleCrackEta,
  "/api/crack-eta/recompute": handleCrackEtaRecompute,
  "/api/admin/refresh-game": handleAdminRefreshGame,
  "/api/admin/seed-title": handleAdminSeedTitle,
  "/api/watchlist/track": handleWatchlistTrack,
  "/api/trending": handleTrending,
  "/api/watchlist/sync": handleWatchlistSync,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path.startsWith("/api/")) {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      const handler = ROUTES[path];
      if (handler) return handler({ request, env });
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (path === "/sitemap.xml") return handleSitemap({ request, env });

    return env.ASSETS.fetch(request);
  },

  // Five cron patterns (see wrangler.jsonc's `triggers.crons`), dispatched
  // by which one fired: the original 15-minute trigger runs the Discord
  // alerts (worker/scheduled.ts), the small steady-state D1 sync,
  // worker/backfill/refreshStale.ts's independent Steam-metadata freshness
  // sweep (oldest-updated-first, small batch, keyed off each game's own
  // already-known appid -- unlike steady-state sync, this one isn't gated
  // on any recent crack/xREL activity, since a game can go stale on Steam's
  // side with zero cracking-scene activity to ever re-trigger a check
  // otherwise), AND worker/backfill/groupReliability.ts's group-reliability
  // star-rating recompute -- a pure D1 aggregate over the releases table
  // already sitting there (no external HTTP calls), so it piggybacks on
  // this slot rather than needing its own trigger (Cloudflare's 5-cron cap
  // is already fully spent, see below). Internally throttled to roughly
  // once an hour (RECOMPUTE_INTERVAL_MS) since the underlying data only
  // shifts a little between 15-minute ticks. Same reasoning covers
  // worker/backfill/denuvoRemoval.ts's per-publisher Denuvo-removal-pattern
  // recompute and worker/backfill/crackEta.ts's Crack ETA Predictor
  // recompute -- both pure D1 aggregates, both hourly-throttled, both
  // sharing this slot rather than needing their own trigger; a separate, more frequent
  // trigger drives the resumable
  // historical backfill (worker/backfill/run.ts) until it completes, then
  // becomes a cheap no-op forever after -- see that file's own comment for
  // why this needs its own faster cadence instead of piggybacking on the
  // 15-minute one; a third drives the deep, search-by-title backfill for
  // older titles the browse-feed backfill structurally can't reach (see
  // worker/backfill/deepRun.ts); a fourth drives the deep archive crawl
  // (worker/backfill/archiveRun.ts), the largest of the five -- expect it
  // to run for days; a fifth walks every existing games row exactly once to
  // reconcile the false-Denuvo tag backlog against a real PCGamingWiki
  // lookup (worker/backfill/drmBackfillRun.ts's runDrmBackfillTick), then
  // -- once that one-time pass reaches "done" -- switches this same slot
  // over to an ongoing oldest-checked-first DRM recheck (runDrmRecheckTick)
  // that cycles the whole table forever, so a real later DRM change on
  // PCGamingWiki's side (a title getting Denuvo removed, say) doesn't sit
  // stale indefinitely just because its row was already visited once. AND,
  // alongside it, keeps sweeping the false-crack-timing backlog against
  // real xREL group history (worker/backfill/reconcileFirstSeen.ts) AND,
  // also sharing this slot, repairing the false-blank-metadata backlog left
  // by the appid-echoed-on-failure bug (worker/backfill/repairEnrichment.ts's
  // own comment) AND upgrading any game's header image to a real high-res
  // library CDN variant if it isn't one already (worker/backfill/
  // headerUpgrade.ts) -- a plain WHERE-clause eligibility check, no cursor
  // needed, since an upgraded row just stops matching on its own -- Cloudflare
  // caps a Worker at 5 cron triggers (confirmed live), so this one slot now
  // carries four unrelated one-time/ongoing reconciliation tasks, same as
  // the 15-minute trigger already combining multiple unrelated tasks. Like
  // the first-seen reconciliation and the DRM recheck, the enrichment
  // repair and header upgrade both deliberately never reach a
  // terminal "done" state -- a row a tick attempts and still fails (Steam
  // having a bad moment right now) must stay eligible for a later tick, not
  // get marked "visited" and skipped forever. waitUntil so none of these
  // get torn down before their D1 writes (and, for the alert path, the KV
  // writes/webhook POST) finish.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === BACKFILL_CRON) {
      ctx.waitUntil(runBackfillTick(env));
      return;
    }
    if (event.cron === DEEP_BACKFILL_CRON) {
      // Both of these have finished (phase = done) and cost nothing; they share
      // a slot so the */4 slot can be dedicated to the DRM recheck.
      ctx.waitUntil(
        Promise.all([withSubrequestBudget(BUDGET_DEEP, () => runDeepBackfillTick(env)), withSubrequestBudget(BUDGET_ARCHIVE, () => runArchiveBackfillTick(env))]),
      );
      return;
    }
    if (event.cron === DRM_RECHECK_CRON) {
      // Alone in its invocation: nothing else can be starved by it.
      ctx.waitUntil(withSubrequestBudget(BUDGET_DRM, () => runDrmRecheckTick(env)));
      return;
    }
    if (event.cron === HOUSEKEEPING_CRON) {
      // Hourly tasks, one per invocation (staggered by minute) so they never
      // share a 50-subrequest cap. `force` bypasses their own hourly throttle
      // because the minute gate already makes them hourly.
      const minute = new Date(event.scheduledTime).getUTCMinutes();
      if (minute === 10) ctx.waitUntil(withSubrequestBudget(BUDGET_REPAIR, () => runEnrichmentRepairTick(env, true)));
      else if (minute === 25) ctx.waitUntil(withSubrequestBudget(BUDGET_RECONCILE, () => runFirstSeenReconcileTick(env, true)));
      else if (minute === 40) ctx.waitUntil(withSubrequestBudget(BUDGET_HEADER, () => runHeaderUpgradeTick(env, true)));
      return;
    }
    ctx.waitUntil(
      Promise.all([
        runScheduledAlert(env),
        runSteadyStateSync(env),
        runStaleRefreshTick(env),
        runGroupReliabilityTick(env),
        runDenuvoRemovalStatsTick(env),
        runCrackEtaStatsTick(env),
      ]),
    );
  },
};

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
import { handleFact } from "./routes/fact";
import { handleSearchAssist } from "./routes/searchAssist";
import { handleSitemap } from "./routes/sitemap";
import { handleBadge } from "./routes/badge";
import { handleWishlist } from "./routes/wishlist";
import { handleFeed } from "./routes/feed";
import { handleCatalog } from "./routes/catalog";
import { runScheduledAlert, runSteadyStateSync } from "./scheduled";
import { runBackfillTick } from "./backfill/run";
import { runDeepBackfillTick } from "./backfill/deepRun";
import { runArchiveBackfillTick } from "./backfill/archiveRun";

/* This is a Worker with static assets (wrangler.jsonc `main` + `assets`), not
   classic Cloudflare Pages -- confirmed live: the workers.dev domain and
   `wrangler deploy` model don't auto-route a `functions/` directory the way
   Pages Functions does. So this fetch handler explicitly routes /api/* to the
   handlers below and falls back to env.ASSETS.fetch(request) for everything
   else (the built SPA + its static files). */
// Must match the second/third/fourth entries in wrangler.jsonc's
// `triggers.crons` exactly -- ScheduledEvent.cron is how the one scheduled()
// handler below tells the four triggers apart.
const BACKFILL_CRON = "*/2 * * * *";
const DEEP_BACKFILL_CRON = "*/3 * * * *";
const ARCHIVE_BACKFILL_CRON = "*/4 * * * *";

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
  "/api/fact": handleFact,
  "/api/badge": handleBadge,
  "/api/wishlist": handleWishlist,
  "/api/feed.xml": handleFeed,
  "/api/search-assist": handleSearchAssist,
  "/api/catalog": handleCatalog,
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

  // Four cron patterns (see wrangler.jsonc's `triggers.crons`), dispatched
  // by which one fired: the original 15-minute trigger runs the Discord
  // alerts (worker/scheduled.ts) plus the small steady-state D1 sync
  // alongside it; a separate, more frequent trigger drives the resumable
  // historical backfill (worker/backfill/run.ts) until it completes, then
  // becomes a cheap no-op forever after -- see that file's own comment for
  // why this needs its own faster cadence instead of piggybacking on the
  // 15-minute one; a third drives the deep, search-by-title backfill for
  // older titles the browse-feed backfill structurally can't reach (see
  // worker/backfill/deepRun.ts); a fourth drives the deep archive crawl
  // (worker/backfill/archiveRun.ts), the largest of the four -- expect it
  // to run for days. waitUntil so none of these get torn down before their
  // D1 writes (and, for the alert path, the KV writes/webhook POST) finish.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    if (event.cron === BACKFILL_CRON) {
      ctx.waitUntil(runBackfillTick(env));
      return;
    }
    if (event.cron === DEEP_BACKFILL_CRON) {
      ctx.waitUntil(runDeepBackfillTick(env));
      return;
    }
    if (event.cron === ARCHIVE_BACKFILL_CRON) {
      ctx.waitUntil(runArchiveBackfillTick(env));
      return;
    }
    ctx.waitUntil(Promise.all([runScheduledAlert(env), runSteadyStateSync(env)]));
  },
};

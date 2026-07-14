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
import { handleFaq } from "./routes/faq";
import { handleFx } from "./routes/fx";
import { handleSummary } from "./routes/summary";
import { handleSearchAssist } from "./routes/searchAssist";

/* This is a Worker with static assets (wrangler.jsonc `main` + `assets`), not
   classic Cloudflare Pages -- confirmed live: the workers.dev domain and
   `wrangler deploy` model don't auto-route a `functions/` directory the way
   Pages Functions does. So this fetch handler explicitly routes /api/* to the
   handlers below and falls back to env.ASSETS.fetch(request) for everything
   else (the built SPA + its static files). */
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
  "/api/faq": handleFaq,
  "/api/fx": handleFx,
  "/api/summary": handleSummary,
  "/api/search-assist": handleSearchAssist,
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

    return env.ASSETS.fetch(request);
  },
};

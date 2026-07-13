import type { Env } from "./env";

/* This is a Worker with static assets (wrangler.jsonc `main` + `assets`), not
   classic Cloudflare Pages -- confirmed live: the workers.dev domain and
   `wrangler deploy` model don't auto-route a `functions/` directory the way
   Pages Functions does. Route handlers below are plain functions dispatched
   by worker/index.ts's own router, not PagesFunction exports. */
export type HandlerContext = { request: Request; env: Env };
export type Handler = (ctx: HandlerContext) => Response | Promise<Response>;

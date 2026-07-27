export interface Env {
  XREL_CLIENT_ID?: string;
  XREL_CLIENT_SECRET?: string;
  // Set via the Cloudflare dashboard (Workers & Pages -> drift -> Settings ->
  // Variables and Secrets), never in code or chat. Powers FAQ generation and
  // the AI-assisted extras (group/publisher blurbs, search interpretation) --
  // every one of those routes checks for this and returns an honest
  // "unavailable" response if it's unset, rather than assuming it exists.
  GROQ_API_KEY?: string;
  // Static-assets binding, configured via `assets.binding` in wrangler.jsonc --
  // this is what makes `env.ASSETS.fetch(request)` serve the built Vite app.
  ASSETS: Fetcher;
  // KV namespace for the Discord-alert Cron Trigger (worker/scheduled.ts) --
  // remembers which release IDs have already been alerted on so the same
  // crack doesn't get re-posted every time the cron fires. Binding created
  // via `wrangler kv namespace create SEEN_RELEASES` (needs Cloudflare auth,
  // can't be scripted from inside the repo) and wired up in wrangler.jsonc's
  // `kv_namespaces` -- see DEPLOY.md.
  SEEN_RELEASES: KVNamespace;
  // Discord webhook URL for new-release alerts. Set via the Cloudflare
  // dashboard (Workers & Pages -> drift -> Settings -> Variables and
  // Secrets), same dashboard-only pattern as GROQ_API_KEY above -- never in
  // code or chat. Optional on purpose: the scheduled handler no-ops rather
  // than throwing if this (or SEEN_RELEASES) isn't configured yet, so an
  // in-progress deploy just silently doesn't alert instead of erroring every
  // 15 minutes.
  DISCORD_WEBHOOK_URL?: string;
  // D1 binding for the catalog database (orlaz-catalog), see
  // wrangler.jsonc's `d1_databases` and orlaz-phase3-database.md. Unlike
  // SEEN_RELEASES above, this one's already provisioned (a real
  // database_id is in wrangler.jsonc) -- not optional at the type level.
  orlaz_catalog: D1Database;
  // Optional shared-secret gate for /api/admin/* (worker/shared/adminAuth.ts)
  // -- same dashboard-only, never-in-code-or-chat pattern as GROQ_API_KEY/
  // DISCORD_WEBHOOK_URL above, and same "unset = feature not active" default
  // rather than a hard requirement: every other route in this app is
  // deliberately public/unauthenticated (see groupReliability.ts's own
  // comment on why that's an accepted tradeoff for a solo-admin surface with
  // no destructive actions), and /api/admin/refresh-game only ever
  // re-fetches a game D1 already has, so nothing currently breaks by this
  // being unset. /api/admin/seed-title is the one route that performs real
  // inserts of new rows from arbitrary input, though -- setting this secret
  // is the opt-in lever to require a token for that route (and any future
  // route added under /api/admin/*) without changing default behavior for
  // whoever hasn't set it.
  ADMIN_TOKEN?: string;
}

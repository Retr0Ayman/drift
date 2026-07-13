# DRIFT — deploy (one Cloudflare Worker, static assets + API together)

One deployable unit: a Cloudflare **Worker with static assets** (`wrangler.jsonc`,
`main: worker/index.ts`, `assets.directory: ./dist`). The Worker's `fetch` handler
routes `/api/*` to the ported route handlers under `worker/routes/**` and falls back
to `env.ASSETS.fetch(request)` (the built Vite app) for everything else.

This is **not** classic Cloudflare Pages — confirmed against the live deploy
(`drift.aymanestifanos9.workers.dev`, a `workers.dev` domain): Pages Functions'
`functions/`-directory auto-routing simply doesn't apply to this model, which is why
`/api/*` was silently falling through to the SPA's `index.html` before this fix.
GitHub Pages and the old standalone `drift-api` Worker are retired; nothing to clean
up there beyond turning GitHub Pages off if you'd previously enabled it (repo →
Settings → Pages → Source → `None`).

## 1. Deploying

Two ways to get code live — use whichever the `drift` Worker project is already
wired to:

**A. `wrangler deploy` (direct, always works, needs a Cloudflare login):**
```
npm install
npm run deploy      # = npm run build && wrangler deploy
```
`wrangler deploy` reads `wrangler.jsonc` (`name: "drift"`), builds nothing itself —
`npm run build` (part of the script) produces `dist/`, which `assets.directory`
points at — and pushes both the Worker script and the static assets in one deploy.
First run prompts a browser login (`wrangler login`) if not already authenticated.

**B. Git integration (Workers Builds, if the dashboard project is connected to this
repo under Workers → your project → Settings → Build):** every `git push` to `main`
triggers Cloudflare to run `npm run build` and deploy automatically, same as Pages'
Git integration did — just configured under **Workers**, not **Pages**, in the
unified dashboard. If the current `drift` Worker isn't connected this way yet, wire
it up there, or just use `wrangler deploy` directly (option A) whenever you want to
push a release.

## 2. Secrets (xREL NFO images — optional, everything else needs none)

Every route that matters — the live release feed, group classification (including
the P2P `voices38`/`DenuvOwO` lookup), drift detection — needs **no xREL auth at
all**: `release/latest.json`, `search/releases.json` and `release/info.json` are all
unauthenticated per xREL's own API docs. Only the real scanned NFO *image*
(`nfo/release.json`) sits behind OAuth, and there's no static token to paste — it
needs a **Consumer Key/Secret** from an app registered on xREL, a manual approval
step on their end that may never happen. That's fine — the generated ASCII `.nfo` is
the permanent NFO experience, not a placeholder waiting on this.

If you ever do get a Key/Secret: dashboard → Workers & Pages → `drift` → **Settings**
→ **Variables and Secrets** → add:

| name | value |
|---|---|
| `XREL_CLIENT_ID` | the Consumer Key |
| `XREL_CLIENT_SECRET` | the Consumer Secret |

Mark both as **Secret** (encrypted), not plaintext. Never committed to git, never
pasted in chat — dashboard-only. Without them, `/api/xrel/nfo` returns `501` and the
client falls back to the ASCII `.nfo` — nothing breaks.

## 3. Sanity-check the routes

Once deployed, hit these directly against the live host:

```
https://drift.aymanestifanos9.workers.dev/api/appdetails?appid=2358720      -> {appid, title, desc, currentBuild, dlc:[appids], ...}
https://drift.aymanestifanos9.workers.dev/api/resolve?title=Watch+Dogs       -> {appid:243470, matchedName:"Watch_Dogs™"}
https://drift.aymanestifanos9.workers.dev/api/resolve?title=Watch+Dogs+2     -> {appid:447040, matchedName:"Watch_Dogs® 2"}
https://drift.aymanestifanos9.workers.dev/api/build?appid=2358720            -> {appid, buildid}
https://drift.aymanestifanos9.workers.dev/api/xrel?latest=1                  -> {list:[...]} (xREL releases, page 1 only)
https://drift.aymanestifanos9.workers.dev/api/xrel/browse?page=1&per_page=60 -> {list:[...], total_count} — the main Windows-category catalog feed
https://drift.aymanestifanos9.workers.dev/api/xrel/group?name=DenuvOwO       -> {list:[...]} — that group's real releases (P2P groups aren't in /browse at all, see worker/routes/xrel/group.ts)
https://drift.aymanestifanos9.workers.dev/api/xrel/nfo?id=<relid>            -> PNG, or 501 if secrets unset
```

Anything under `/api/` that isn't one of the routes above returns a `404` JSON body
(not the SPA) — see the `ROUTES` table in `worker/index.ts`.

## 4. Local dev

- `npm run dev` — plain Vite dev server (fast HMR), but `/api/*` calls 404 — fine
  for pure UI work.
- `npm run worker:dev` — builds, then serves the real build through `wrangler dev`
  (the actual Workers+Assets runtime, `ASSETS` binding included) — the faithful
  production-equivalent check. No Cloudflare login needed for routes that don't
  touch secrets; the NFO route just 501s locally the same way it does in prod
  without secrets configured.

## 5. Optional: curated build-id refresh (`status.json` path)

Unchanged, untouched by this migration, and not the primary data path (the live
xREL feed is). Only relevant if the app is ever pointed at `STATUS_FEED` instead of
the live path:

- [`sync-builds.js`](sync-builds.js) — reads `status.json`, asks
  `api.steamcmd.net` for each game's latest public build id, writes changes back.
- [`.github/workflows/build-sync.yml`](.github/workflows/build-sync.yml) — runs it
  every 6 hours and commits `status.json` if anything changed.

## Recap: what's free vs. what needs a human

| piece | cost | human touch after setup |
|---|---|---|
| Cloudflare Worker + static assets (100k req/day) | free | none if Git-connected; otherwise `npm run deploy` per release |
| Steam / steamcmd data | free, no key | none |
| xREL release list, search, P2P group lookup, drift detection | free, no key | none |
| xREL NFO images | free | optional, needs an xREL-approved Consumer Key/Secret — skip it, ASCII `.nfo` is permanent |
| build-id refresh (curated path) | free (GitHub Actions minutes) | none |

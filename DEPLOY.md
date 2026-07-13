# DRIFT — deploy (free, one Cloudflare Pages project)

One project now, not three: the React/Vite frontend and the API (`functions/api/**`,
Cloudflare Pages Functions) deploy together from this repo. Cloudflare's Git
integration builds and deploys both on every `git push` — no more pasting code into
the dashboard by hand. GitHub Pages and the standalone `drift-api` Worker are
retired; nothing to clean up there beyond turning GitHub Pages off if you'd
previously enabled it (Settings → Pages → Source → `None`).

## 1. One-time setup (you do this — the only manual step)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** tab → **Connect to Git**.
2. Pick this repo (`Retr0Ayman/drift`) and branch `main`.
3. Build settings:
   | field | value |
   |---|---|
   | Framework preset | `Vite` (or None — the settings below are explicit either way) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `/` |
   Functions need no separate configuration — Cloudflare auto-detects the
   `/functions` directory at the repo root and deploys every route under it
   alongside the static build.
4. **Save and Deploy.** Cloudflare gives you a URL like
   `https://drift.pages.dev` (or `https://<project-name>.pages.dev` if the name
   differs). Every subsequent `git push` to `main` triggers a new build+deploy of
   both the frontend and the functions automatically; pushes to other branches get
   their own preview URL.
5. (Optional) Attach a custom domain under the same project → **Custom domains** —
   Cloudflare handles the TLS cert automatically.

## 2. Secrets (xREL NFO images — optional, everything else needs none)

Every route that matters — the live release feed, group classification (including
the P2P `voices38`/`DenuvOwO` lookup), drift detection — needs **no xREL auth at
all**: `release/latest.json`, `search/releases.json` and `release/info.json` are all
unauthenticated per xREL's own API docs. Only the real scanned NFO *image*
(`nfo/release.json`) sits behind OAuth, and there's no static token to paste — it
needs a **Consumer Key/Secret** from an app registered on xREL, a manual approval
step on their end that may never happen. That's fine — the generated ASCII `.nfo` is
the permanent NFO experience, not a placeholder waiting on this.

If you ever do get a Key/Secret: project → **Settings** → **Environment variables**
→ add for both **Production** and **Preview**:

| name | value |
|---|---|
| `XREL_CLIENT_ID` | the Consumer Key |
| `XREL_CLIENT_SECRET` | the Consumer Secret |

Mark both as **Secret** (encrypted), not plaintext. Never committed to git, never
pasted in chat — dashboard-only, same as before. Without them, `/api/xrel/nfo`
returns `501` and the client falls back to the ASCII `.nfo` — nothing breaks.

## 3. Sanity-check the routes

Once deployed, hit these directly (replace the host with your `*.pages.dev` URL):

```
https://<project>.pages.dev/api/appdetails?appid=2358720            -> {appid, title, desc, currentBuild, dlc:[appids], ...}
https://<project>.pages.dev/api/resolve?title=Watch+Dogs             -> {appid:243470, matchedName:"Watch_Dogs™"}
https://<project>.pages.dev/api/resolve?title=Watch+Dogs+2           -> {appid:447040, matchedName:"Watch_Dogs® 2"}
https://<project>.pages.dev/api/build?appid=2358720                  -> {appid, buildid}
https://<project>.pages.dev/api/xrel?latest=1                        -> {list:[...]} (xREL releases, page 1 only)
https://<project>.pages.dev/api/xrel/browse?page=1&per_page=60       -> {list:[...], total_count} — the main Windows-category catalog feed
https://<project>.pages.dev/api/xrel/group?name=DenuvOwO             -> {list:[...]} — that group's real releases (P2P groups aren't in /browse at all, see functions/api/xrel/group.ts)
https://<project>.pages.dev/api/xrel/nfo?id=<relid>                  -> PNG, or 501 if secrets unset
```

## 4. Local dev

- `npm run dev` — plain Vite dev server (fast HMR), but `/api/*` calls 404 — fine
  for pure UI work.
- `npm run pages:dev` — builds, then serves the real build through
  `wrangler pages dev`, functions included, on one origin — the faithful
  production-equivalent check. Requires no Cloudflare login for routes that don't
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
| Cloudflare Pages hosting + Functions (100k req/day) | free | none |
| Steam / steamcmd data | free, no key | none |
| xREL release list, search, P2P group lookup, drift detection | free, no key | none |
| xREL NFO images | free | optional, needs an xREL-approved Consumer Key/Secret — skip it, ASCII `.nfo` is permanent |
| build-id refresh (curated path) | free (GitHub Actions minutes) | none |

Everything above runs with zero ongoing intervention once step 1 is done.

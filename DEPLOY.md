# DRIFT — deploy (free, no server to maintain)

Two pieces: the site (static, GitHub Pages) and the API engine (Cloudflare
Worker, free tier). Optional: a GitHub Action that refreshes `status.json`
on a schedule if you're using the curated-feed path instead of/alongside
the live xREL path.

## 1. Deploy the Worker (`worker.js`)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name (e.g. `drift-api`) → **Deploy** (deploys the default template first).
3. **Edit code** → delete the template contents → paste in the full contents of `worker.js` → **Deploy**.
4. Note the URL Cloudflare gives you: `https://drift-api.<your-subdomain>.workers.dev`.

### NFO image secrets (optional, and probably not worth chasing)

Everything that matters — the live release feed, group classification, drift
detection — needs **no xREL auth at all**: `release/latest.json`,
`search/releases.json` and `release/info.json` are all unauthenticated per
xREL's own API docs. Only the real scanned NFO *image* (`nfo/release.json`)
sits behind OAuth, and there's no static token to paste — you'd need a
**Consumer Key/Secret** from an "app" registered on xREL, which is a manual
approval step on their end. Nobody's lined that up, and it may just never
happen — that's fine, it's not blocking anything. The generated ASCII `.nfo`
already in `drift.html` is the permanent NFO experience, not a placeholder.

If you ever do get a Key/Secret, it starts working with zero other changes —
in the Worker → **Settings** → **Variables and Secrets** → add:

| name | value |
|---|---|
| `XREL_CLIENT_ID` | the Consumer Key |
| `XREL_CLIENT_SECRET` | the Consumer Secret |

Without these, `/xrel/nfo` returns `501` and the client silently falls back
to the generated ASCII `.nfo` — nothing breaks.

### Sanity-check the routes

Once deployed, hit these directly in a browser (replace the host):

```
https://drift-api.<sub>.workers.dev/?appid=2358720                 -> {appid, title, desc, currentBuild, dlc:[appids], ...}
https://drift-api.<sub>.workers.dev/resolve?title=Black+Myth+Wukong -> {appid, matchedName} — title lookup, small &
                                                                        targeted (Steam storesearch, not the full app list)
https://drift-api.<sub>.workers.dev/build?appid=2358720            -> {appid, buildid}
https://drift-api.<sub>.workers.dev/xrel?latest=1                  -> {list:[...]} (xREL releases, page 1 only)
https://drift-api.<sub>.workers.dev/xrel/browse?page=1&per_page=60 -> {list:[...], total_count} — paginated; this is
                                                                        what drift.html actually walks on scroll
https://drift-api.<sub>.workers.dev/xrel/nfo?id=<relid>            -> PNG, or 501 if secrets unset
```

`findAppid()` in `drift.html` calls `/resolve` on demand, one small request per
unresolved title, cached client-side. An earlier design downloaded Steam's
entire ~190k-entry app list (`?applist=1`) through the Worker on every page
load just to do this lookup locally — too heavy to reliably relay and parse
in a browser, and that route has been removed.

`drift.html`'s catalog loader (`goLive()`/`loadNextLivePage()`/`refreshLiveFeed()`)
calls `/xrel/browse` directly, not `/xrel?latest=1` — the latter still works
as a quick one-page sanity check but isn't what the live site uses.

If `/xrel?latest=1` errors or comes back empty, the site just stays on the
seed `GAMES` array and `#livelabel` shows `SEEDED` — it fails closed, not
loudly.

## 2. Wire the site to the Worker

In `drift.html`, find `CONFIG` near the top of the `<script>` block:

```js
const CONFIG = {
  STEAM_PROXY: "https://drift-api.<sub>.workers.dev/?appid=",
  XREL_PROXY:  "https://drift-api.<sub>.workers.dev/xrel",
  STATUS_FEED: null,   // or "./status.json" to use the curated override instead
};
```

Leaving `XREL_PROXY` set makes `goLive()` the primary data path on every page
load; the built-in `GAMES` seed array is only ever shown as a fallback.

## 3. Host the site (GitHub Pages)

1. Repo → **Settings** → **Pages** → **Source**: `Deploy from a branch` → `main` → `/ (root)`.
2. Save. GitHub gives you `https://<user>.github.io/<repo>/` in a minute or two.
3. (Optional) Add a custom domain under the same Pages settings — GitHub
   handles the TLS cert automatically once DNS is pointed at it.

No build step — `drift.html` is served as-is.

## 4. Optional: curated build-id refresh (`status.json` path)

Only needed if you're using `STATUS_FEED` (curated overrides) instead of, or
alongside, the live xREL path — it keeps `currentBuild` in `status.json`
fresh so drift detection stays accurate even without live xREL data.

Already wired up in this repo:

- [`sync-builds.js`](sync-builds.js) — reads `status.json`, asks
  `api.steamcmd.net` for each game's latest public build id, writes changes
  back.
- [`.github/workflows/build-sync.yml`](.github/workflows/build-sync.yml) —
  runs it every 6 hours (`workflow_dispatch` also lets you trigger it
  manually from the Actions tab) and commits `status.json` if anything
  changed.

Nothing to configure — once the workflow file is on `main` with **Actions**
enabled for the repo (Settings → Actions → General → Allow all actions), it
just runs. It needs `contents: write` permission to commit back, which the
workflow file already requests.

## Recap: what's free vs. what needs a human

| piece | cost | human touch after setup |
|---|---|---|
| GitHub Pages hosting | free | none |
| Cloudflare Worker (100k req/day) | free | none |
| Steam / steamcmd data | free, no key | none |
| xREL release list + search | free, no key | none |
| xREL release feed, groups, drift detection | free, no key | none |
| xREL NFO images | free | optional, needs an xREL-approved Consumer Key/Secret — skip it, ASCII `.nfo` is permanent |
| build-id refresh (curated path) | free (GitHub Actions minutes) | none |

Everything above runs with zero ongoing intervention. The NFO-image secrets
are the one piece that isn't self-serve — leave them unset and nothing about
the site is degraded, it just shows the generated ASCII `.nfo` always.

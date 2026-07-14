# orlaz — Phase 3: D1 database (the real fix for "not enough games")

This is now the priority, ahead of anything else queued. "88+ publishers" / "not anywhere near enough games" and the Pragmata/voices38 accuracy bug are the same root cause: the site has never had its own copy of the catalog. Every page derives counts and per-game data from whatever's currently sitting in the browser's `games` array, which only reflects however many pages of `/api/xrel/browse` happen to have loaded client-side — page 1 (~60-100 releases) by default, more only if something explicitly calls `loadMore()`. Confirmed live: `/api/xrel/browse` actually has **50 pages, ~5000 releases total** server-side. None of that is wrong data, it's just never been fully pulled anywhere.

A real database, populated once by walking the whole thing and kept current by the cron job that already exists, fixes: the publisher/group counts (no more "+"), the Pragmata-class P2P accuracy bug (properly, not via the client-side merge hack proposed as a stopgap in `orlaz-accuracy-search-franchise.md` — if this ships first, skip that item, the database makes it unnecessary), and "not enough games" directly, since the frontend can finally just ask for everything instead of reconstructing a partial picture from paginated live calls.

---

## 1. Set up D1 (one manual step, same pattern as the KV namespace before)

```
wrangler d1 create orlaz-catalog
```

This needs Cloudflare auth and can't be scripted from inside the repo — same as `wrangler kv namespace create` was for the Discord alerts. Run it yourself, then paste the printed `database_id` into `wrangler.jsonc`'s `d1_databases` block (the agent should write the block with a placeholder ID and leave a comment exactly like the `SEEN_RELEASES` KV block did, rather than guessing a real one).

---

## 2. Schema

Two tables, mirroring `src/types/game.ts`'s existing `Game`/`Release` shape closely enough that the API layer (section 4) can return something the frontend barely has to adapt to:

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,         -- same slug as Game.id
  xrel_key TEXT,
  title TEXT NOT NULL,
  appid INTEGER,
  year INTEGER,
  released TEXT,
  developer TEXT,
  publisher TEXT,
  genres TEXT,                 -- JSON array, same as Game.genres
  tags TEXT,                   -- JSON array
  current_build INTEGER,
  desc TEXT,
  fact TEXT,
  metacritic INTEGER,
  source_name TEXT,
  source_url TEXT,
  updated_at INTEGER NOT NULL  -- unix ms, last time this row was refreshed
);

CREATE TABLE releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id),
  method TEXT NOT NULL,        -- 'hv' | 'trad'
  group_name TEXT NOT NULL,
  build INTEGER,
  version TEXT,
  date TEXT,
  ts INTEGER,
  note TEXT,
  xrel_id TEXT,
  link_href TEXT,
  is_repack INTEGER DEFAULT 0,
  is_anonymous INTEGER DEFAULT 0
);
CREATE INDEX idx_releases_game ON releases(game_id);
CREATE INDEX idx_releases_ts ON releases(ts);
```

(`dlc`, `screenshots`, etc. from `appdetails.ts`'s richer response can stay resolved live per-game-page-view as they already are — no need to persist everything, just what every list/directory page needs to stop guessing at.)

---

## 3. Backfill — the actual engineering challenge here

Walking all 50 pages of `browse_category`, plus every `STARRED_GROUPS` P2P group's full history, then resolving each title to a Steam appid (`resolve.ts`'s existing logic) and enriching via `appdetails.ts`, is potentially thousands of Steam API calls. **Do not try to do this in one request** — Workers have real CPU/wall-time limits even inside a cron's `waitUntil`, and a backfill that times out halfway leaves the database in a worse state (partially populated, looking complete) than not having one at all.

Design this as resumable, incremental work, not a single big job:

- Track progress somewhere durable (a small `backfill_state` table in the same D1 database, or a KV key) — e.g. "last browse page processed," "last starred group processed."
- Each cron tick (the existing 15-minute trigger in `worker/scheduled.ts`, or a separate more-frequent one just for backfill while it's incomplete), process a bounded batch — a few browse pages' worth of titles, resolve+enrich each, upsert into D1, advance the progress marker. Stop and yield once a time/CPU budget is spent, pick up where it left off next tick.
- Once the progress marker reaches the end (page 50, all starred groups exhausted), flip to steady-state: the existing `collectCandidates()`/`isAlertable()` logic in `worker/scheduled.ts` already runs every 15 minutes and already knows how to find genuinely new releases (that's what feeds the Discord alerts and, per the last brief, the RSS feed) — extend it to also upsert new games/releases into D1 as they appear, instead of a separate backfill pass forever.
- Resolving every title against Steam's storesearch is the slow part (one external HTTP call per title, sequential or lightly parallelized to avoid hammering Steam) — budget for this being the majority of backfill time, not the xREL calls themselves (those are already Cloudflare-edge-cached).

---

## 4. New read API, and retiring the client-side crawl

New route(s) under `/api/catalog` (exact shape is a judgment call — a single `GET /api/catalog?page=&per_page=` returning `{games: Game[], total, hasMore}` straight from D1 is the simplest version) replacing what `useLiveCatalog.ts` currently does by paginating live `/api/xrel/browse` calls in the browser. Once this exists:

- `useLiveCatalog.ts` fetches from `/api/catalog` instead — same hook shape/interface if possible (`games`, `status`, `loading`, `hasMore`, `loadMore`) so `useCatalog()` consumers elsewhere don't need touching, but now every page can genuinely load "everything" instead of being capped at whatever's been paginated in-browser.
- `publishersIndex`/`groupsIndex` (`src/lib/companies.ts` / `src/lib/groups.ts`) then compute real, complete counts — remove the "+"-suffix honesty workaround from Phase 1 section 4/5 entirely once this lands, it's no longer needed.
- `GameDetail.tsx` gets a game's releases (scene AND P2P, already merged at write-time in D1) directly — no more needing the client-side cross-reference hack proposed for the Pragmata bug. If that fix from `orlaz-accuracy-search-franchise.md` already shipped by the time this does, it's safe to leave in place (harmless redundant coverage) or remove — don't spend time ripping it out defensively if it's not causing problems.
- Search (`useAutocomplete.ts`'s `localMatches`) can now search the real full catalog instead of just whatever's loaded — the "not found while it's still loading" race condition from the other brief gets meaningfully rarer too, since a `/api/catalog` fetch is one request instead of a client-side multi-page crawl, but the loading-state fix from that brief should still land regardless (this doesn't eliminate the race, it shrinks the window).

---

## What NOT to touch

Don't change `worker/routes/xrel/**` themselves (they're still the source backfill reads from) or the Discord alert webhook logic in `worker/scheduled.ts` beyond adding the D1-upsert step alongside it. Don't attempt the backfill synchronously inside a user-facing request — if there's ever a temptation to "just crawl it all when someone visits /publishers," that's the exact bug this phase exists to remove, not a shortcut to it.

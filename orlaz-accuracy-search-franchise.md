# orlaz — accuracy fix + search fixes + franchise navigation

Not a numbered phase — these are bug reports plus one feature request that came up while reviewing the live site, worth their own focused pass before or alongside whatever Phase 3/4 work is queued.

---

## 1. P2P crack accuracy — the big one, real data correctness bug

**Confirmed root cause** (Pragmata showing no crack despite a real voices38 release is one example of a whole class of bug, not a one-off):

- `GameDetail.tsx` renders `game.releases`, which comes entirely from `useCatalog()` → `useLiveCatalog()` → `parseReleaseRows()` in `src/lib/catalog.ts`. That function only ever processes rows from `/api/xrel/browse` (the Windows-category feed).
- `worker/routes/xrel/browse.ts` — its own comment says P2P groups **never appear in that feed at all**. Confirmed live, not a guess.
- The only place this app currently cross-references a P2P group's releases against real games is `GroupProfile.tsx`, and only in one direction: given a group, find its games (`allReleases(games).filter(...)` for scene, plus a live P2P lookup for the group itself). There is no reverse lookup — given a game, check whether a P2P group has cracked it.
- Net effect: any title that voices38 or DenuvOwO has released, but that isn't independently in the browse feed under some other (scene) group, silently shows as uncracked or missing that release entirely on its own `GameDetail` page. This affects every P2P-only crack across the whole catalog, not just Pragmata.

**Fix**: `GameDetail` needs to merge in P2P releases for the specific game it's showing, the same way `GroupProfile` already fills in P2P data for a specific group — just running the match in the other direction.

- `src/hooks/useStarredGroupSummaries.ts` already fetches the full raw release rows for every `STARRED_GROUPS` entry (via `fetchGroupReleases`, from `src/lib/xrel.ts`) — it just throws away everything except aggregate counts (`GroupEntry`) on the way to its return value. Either extend this hook to also expose the raw rows (keyed by normalized title), or add a sibling hook — e.g. `usePlatformP2PIndex()` — that does the same starred-groups fetch and returns a `Map<normalizedTitle, XrelReleaseRow[]>`.
- In `GameDetail.tsx`, look up `game.title` (normalized the same way titles are normalized elsewhere — see `normalizeTitle` in `companies.ts` for the existing pattern: strip `™®©`, trim, lowercase) against that P2P index. Any match gets converted into a `Release` (same shape `parseReleaseRows` builds — `method` via `methodForGroup`, `group` from `row.group_name`, `date`/`ts` from `row.time`, `note` from `row.dirname`) and merged into `game.releases` before `sortReleasesByPriority` runs, not appended after — a P2P crack needs to compete for "which release do we lead with" on equal footing with scene releases, not get bolted on as an afterthought.
- Same caution as everywhere else in this codebase: don't fabricate a build number for these (they're `build: null`, same "unverified" status as `GroupProfile`'s live rows already handle correctly via `relStatus`).

This is genuinely more accurate today than "wait for Phase 3's database" would be — the starred-groups fetch already exists and already gets called on nearly every page via `useStarredGroupSummaries`, so this is closing a real gap with data already being pulled, not new infrastructure.

### 1b. P2P rows show no version, no build, no real status color — fix this at the same time

Confirmed by reading the code directly: `ReleaseCard.tsx` (used for every release on a `GameDetail` page) already renders all of this properly — `Version`, `Crack build` with `fmtBuild()`, and a real status Pill colored via `relStatus` (`--out` for outdated, `--accent` for current, `--unv` grey for unverified). None of that is missing there. But `GroupProfile.tsx`'s P2P live rows (`DisplayRow`, the `liveExtraRows` built from `useGroupReleases`) never had those fields at all — just a title, an HV/TRAD pill, and either a timing label or a bare "xREL ↗" link. That's why voices38/DenuvOwO rows read as version-less and colorless: 007 First Light, Pragmata, and every other P2P-only title all go through that same bare row type.

Two real problems to fix together:

- **Version**: every P2P release row has a real `dirname` (e.g. `"007-First-Light-DenuvOwO"`, or with an update suffix like `-Update.3-`) — run it through the same `parseVersionFromDirname()` already used in `src/lib/catalog.ts` for scene releases, don't leave it unparsed just because the row happens to come from the P2P path.
- **Status color, honestly**: P2P live releases have no real Steam build ID (`build: null` by design — see `relStatus`'s own comment: rendering "Current" without a real build match is a false claim, and that rule shouldn't change). So don't fabricate an exact build-match green/red. Instead, add a second, clearly-distinct status signal based on **recency relative to every other tracked release for the same game**: if a P2P release is the most recent tracked release for that title (across every group/method), color it green as "likely current" — if a newer release from any group exists after it, color it red as "likely outdated, newer crack available." Label these visibly differently from the exact-match `Current`/`Outdated` pills scene releases get (e.g. a distinct pill label like "Likely current" / "Likely outdated" vs. the plain "Current" / "Outdated" scene releases earn from a real build match) — the visual red/green distinction the user wants, without quietly blurring it into the same claim as an exact match.
- Apply this to both places P2P rows render: `GroupProfile.tsx` directly, and the merged rows inside `GameDetail.tsx`'s `game.releases` from section 1's fix — ideally by making `GroupProfile.tsx` render through the same `ReleaseCard` component GameDetail uses (passing a synthetic `Game`-shaped wrapper if needed) rather than maintaining two separate row-rendering implementations that will drift out of sync again exactly like this.

### 1c. Group page rows should link to the game page too, not only the NFO

Right now, `GroupProfile.tsx`'s `liveExtraRows` (any title not already in the loaded seed catalog) render as `external: true` and go straight to the xREL NFO page — no way to reach the game's own `/game/:id` page at all, since the comment justifying this says "no local detail page for a title that isn't in the seed catalog." That's not actually true anymore than it is for search: `SearchBar.tsx`'s live results already solve exactly this by resolving an unseen title to a real Steam appid on click (`buildLiveGameFromRows(s.title)` in `src/lib/catalog.ts`, then `onLiveGameResolved(game)` to merge it into the catalog via `mergeOne`, then navigate to `/game/${game.id}`). Reuse that same resolve-on-demand path here instead of assuming "not in the seed catalog yet" means "no page exists."

Once `GroupProfile` renders through `ReleaseCard` (per 1b), this mostly falls out naturally — `ReleaseCard` already shows the NFO link (`release.link_href`, "View .NFO on xREL ↗") as one element of a card that's otherwise about the local game. The remaining piece: a P2P row whose title isn't yet a locally-known game needs the same on-click resolve `SearchBar` already does, so the card's own navigation target becomes a real `/game/:id` instead of nothing. End result the user wants: **both** a way to reach the game's own page and a way to reach the NFO, not a choice between them.

---

## 2. Search shows "not found" prematurely on first load

Symptom: right after the site loads, searching briefly shows no results / not-found, then correcting itself a moment later once the real results come in.

Likely cause, based on `useAutocomplete.ts`: `localMatches` filters over whatever `games` currently is — which is `SEED_GAMES` or an empty/partial array until `useLiveCatalog`'s first `/api/xrel/browse` page resolves. Meanwhile the live xREL search (`searchLive`) is debounced 300ms (`useDebounce`). There's a real window — after the debounce fires but before either the catalog has synced or the live fetch has resolved — where `results.length === 0` and `loading` may already have flipped false, which is exactly the state that would render an empty/not-found UI instead of a loading one.

Fix: make sure the "is this genuinely empty" state is distinct from "still waiting on the catalog to sync" and "still debouncing/fetching live results" — check `useCatalog()`'s own `status`/`loading` (`"seeded" | "syncing" | "live"`, already exposed by `useLiveCatalog`) as an additional gate before ever rendering a not-found state in `SearchBar.tsx`. If the catalog status isn't `"live"` yet, or the live fetch hasn't resolved yet, show a loading indicator, never "not found" — "not found" should only ever mean "we actually checked and there's nothing," not "we haven't finished checking yet."

---

## 3. Franchise navigation from search

The infrastructure for this already exists, it's just not reachable as its own destination. `src/lib/companies.ts` has `FRANCHISE_MAP`, `franchiseFor(title)`, and `groupByFranchise(games)` — currently only used inside `PublisherProfile.tsx` to group one publisher's own titles into sections (`franchise-block`s with a plain `<h2>` title, not a link).

**Add a real franchise page and wire search into it:**

- New route, e.g. `/franchise/:slug` → new component (`src/components/franchise/FranchiseProfile.tsx` or similar), filtering the full catalog by `franchiseFor(g.title) === franchiseName` (reverse-slugify the URL param against the known franchise names, same `slugify` helper used everywhere else) and rendering the matches — reuse `GameCard`/`franchise-grid` styling already built for `PublisherProfile`'s franchise sections rather than inventing new layout.
- In `PublisherProfile.tsx`, make each franchise's `<h2 className="franchise-title">` an actual `<Link to={`/franchise/${slugify(f.name)}`}>` instead of plain text — free extra navigation entry point once the route exists.
- In search: when a query's local/live results resolve, also check whether the query (or a strong match against it) corresponds to a known franchise name from `FRANCHISE_MAP`'s values (dedupe the map's values into a lookup set once, not per-keystroke). If it matches, surface a suggestion row above or alongside the normal results — same UI pattern already built for the deterministic status/year `intent` row in `SearchBar.tsx` ("Filter by **Hypervisor**" etc.) — reading something like "Go to the **Watch Dogs** franchise ›", navigating to `/franchise/watch-dogs` on select.
- Keep this deterministic (franchise-name string matching against the real map), not AI-guessed — same "never fabricate, only surface what's actually known" rule the rest of the search stack already follows (`parseSearchIntent`'s own doc comment says exactly this about status/year intents; apply the same discipline here).

---

## What NOT to touch

Don't touch `worker/scheduled.ts`, the Phase 1 redesign's `tokens.css`/`GlassPanel.css`, or anything under `worker/routes/xrel/**` — item 1's fix is a client-side merge using data already fetched via existing hooks, not a change to how those routes themselves work.

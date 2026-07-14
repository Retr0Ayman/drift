Drift — 1 hour build brief

Repo: Retr0Ayman/drift. Read against current main — file paths and function names below are real, not guesses.

Order matters. Do them in this sequence so each feature can build on the last one without conflicts.


0. Before any of this (2 min, do it yourself first)

Confirm what's actually live vs. what's on main (see the deploy-mismatch issue from earlier). If your local machine has uncommitted changes to worker/routes/xrel/group.ts or GroupProfile.tsx, commit or stash them before turning an agent loose — otherwise it'll build on top of a moving target. Not asking the agent to do this part.


1. Watchlist + Drift Alerts (~20 min) — build this first

The core "drift" concept, made personal. No backend changes needed — everything required already exists in lib/format.ts: anyOutdated(g), relOutdated(g, r), driftDelta(g) all already compute exactly what you need.

Add:


src/hooks/useWatchlist.ts — a hook that persists an array of game IDs to localStorage (key like drift:watchlist), with toggle(id), isWatched(id), watched: string[]. Follow the same pattern as the other hooks in src/hooks/ (plain useState + useEffect syncing to storage, no external state lib).
A star/watch toggle button on src/components/game/ReleaseCard.tsx and src/components/game/GameDetail.tsx — reuse Pill.tsx or a simple icon button, match existing visual language (glass panels, existing color tokens in src/styles/tokens.css).
New route /watchlist → new component src/components/watchlist/Watchlist.tsx, registered in src/App.tsx next to the other routes. Filters games (from useCatalog()) down to watched IDs, sorted by anyOutdated(g) first (outdated games surface at the top), each card showing driftDelta(g) when positive — "N builds behind."
Empty state: "You're not watching anything yet — star a game to get notified when its crack drifts out of date."


Don't: touch the worker, don't add accounts/auth, don't try to push browser notifications in this pass — localStorage + a dedicated page is the whole feature.


2. Speed Leaderboard (~20 min)

Uses data you already collect. Ranks groups by how fast they crack games after Steam release.

First, a small refactor (do this before building the page): crackTimingLabel and dPlusNLabel in src/lib/format.ts both independently recompute the same days value and then format it differently. Pull the shared math into one exported helper:

```ts
export function crackTimingDays(g: Game, r: Release): number | null {
  const releaseTsVal = g.released ? Date.parse(g.released) : NaN;
  const crackTsVal = releaseTs(r);
  if (isNaN(releaseTsVal) || crackTsVal == null) return null;
  return Math.round((crackTsVal - releaseTsVal) / 86400000);
}
```

Then have both existing functions call it instead of duplicating the calc. This is what the leaderboard aggregation needs raw access to.

Add:


src/lib/leaderboard.ts — a pure function buildLeaderboard(games: Game[]): LeaderboardRow[] that walks allReleases(games) (already exported from src/lib/groups.ts), calls crackTimingDays(g, r) per release, and aggregates per group: release count with a valid timing, average days, fastest (min) days, slowest (max) days. Skip releases where crackTimingDays returns null (no Steam release date to compare against) — don't fabricate zeroes.
src/components/groups/Leaderboard.tsx — sortable table (fastest avg first by default) inside a GlassPanel, one row per group, columns: group name, avg D+N, fastest crack (link to that release), releases counted. Route it at /leaderboard, link it from Navbar.tsx and from GroupsDirectory.tsx.
Handle negative averages gracefully (a group that leaks before official release skews average negative — that's correct, not a bug, just label the column "avg (negative = early leaks)" or similar).



3. Discord Alerts (~20 min, plus manual setup after)

This is the one that touches the Worker, not just the frontend — budget it last so the other two ship even if this runs long.

What it needs:


A Cloudflare KV namespace to remember which release IDs have already been alerted on (so it doesn't spam the same crack every time the cron fires). Agent can't create the KV namespace itself (needs wrangler kv namespace create run by you, with Cloudflare auth) — have it write the code assuming a binding named SEEN_RELEASES exists, and leave a clear wrangler.jsonc diff plus a one-line note for you to run the create command and paste the resulting namespace ID in.
A Cron Trigger in wrangler.jsonc (e.g. every 15 min: "crons": ["*/15 * * * *"]).
worker/scheduled.ts (or similar) exporting a scheduled handler wired up in worker/index.ts: pulls page 1 of /api/xrel/browse plus each starred group via the existing xrel/group.ts logic, diffs release IDs against SEEN_RELEASES, and for anything new, POSTs an embed to a Discord webhook URL read from env.DISCORD_WEBHOOK_URL (a secret, same pattern as XREL_CLIENT_ID in DEPLOY.md — dashboard-only, never committed).
Keep the Discord message simple: game title, group, method (HV/TRAD), link to the xREL page.


After the agent's done, you still have to: create the KV namespace, add the DISCORD_WEBHOOK_URL secret in the Cloudflare dashboard, and actually make a webhook in your Discord server's channel settings. None of that is scriptable from inside the repo — flag it clearly if the agent tries to skip past it.


One-shot prompt (copy this into Claude Code)

Working in the drift repo (Retr0Ayman/drift). Build three features in this
exact order, committing after each one so partial progress survives if you
run out of time: (1) a localStorage watchlist with a /watchlist page that
surfaces drifted-outdated watched games first, (2) a group speed leaderboard
at /leaderboard ranking groups by average days-to-crack-after-Steam-release,
(3) a Discord webhook alert on a Cron Trigger for new releases. Full spec
for all three, including exact files to touch and a required refactor of
crackTimingLabel/dPlusNLabel in src/lib/format.ts, is in
drift-1hr-build-brief.md in this repo's root -- read it first. Match the
existing code style: heavy explanatory comments above anything non-obvious,
GlassPanel/Pill for UI, hooks pattern in src/hooks/. Don't invent data --
if a value can't be honestly computed (e.g. no Steam release date to diff
against), skip it or show "—", never fabricate. Stop and report back if
feature 3 needs a Cloudflare KV namespace ID or Discord webhook secret you
don't have -- don't guess placeholder values into committed code.

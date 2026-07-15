# orlaz — D1 releases aren't updating on new group releases + carousel layout bug

Confirmed live: Persona 3 Reload shows one tracked release from DenuvOwO, "Cracked in 780 days" (roughly its original release date, Feb 2024) — but DenuvOwO posted a genuinely new update for this game today, and it's not reflected. "Crack options (1)" means nothing has been added or updated since the first-ever row was written.

---

## 1. Likely root cause: upsert not actually updating on conflict

The `releases` schema added `UNIQUE(game_id, group_name)` (a deliberate deviation from the brief's literal schema, per the backfill commit's own notes — collapsing a group's repeated updates into one row instead of accumulating duplicates). That's a reasonable design, but only if the upsert path in `worker/backfill/db.ts`'s `upsertGames()` actually does `ON CONFLICT (game_id, group_name) DO UPDATE SET build = ?, version = ?, date = ?, ts = ?, update_count = update_count + 1, ...` (or equivalent) whenever a newer release for that same group+game comes in.

Check whether it's actually doing that, or whether it's silently doing `ON CONFLICT DO NOTHING` (or only ever inserting, erroring on conflict and getting swallowed by a try/catch — the same failure shape already found twice this round: the `/api/catalog` bound-parameter bug and the earlier P2P cache-TTL issue). If the first-ever release for a group+game gets written once and every subsequent one silently no-ops, that exactly matches what's showing here — an old crack frozen in place while real newer ones exist and never land.

**Fix**: confirm the upsert clause actually updates `build`, `version`, `date`, `ts`, `note`, `xrel_id`, `link_href` on conflict, and increments `update_count` (the field already exists in the schema and `/api/catalog` already reads it as `rel_update_count` — `ReleaseCard.tsx` already renders "Updated Nx" from it, so this is meant to work, just isn't). Only update when the incoming release is actually newer (compare `ts`) — don't let an out-of-order backfill batch overwrite a newer row with older data.

---

## 2. Verify against a live, fresh example

Don't just fix and assume — after the fix, trigger `runSteadyStateSync` (or wait for its next natural tick) and confirm Persona 3 Reload's DenuvOwO row actually picks up today's real release: new `build`/`version`/`date`, `update_count` incremented past 1. Check a second game/group pair too if one's available, not just this one title.

---

## 3. Carousel bleeds under the sidebar panel

Confirmed live on multiple game pages (Watch Dogs, Watch Dogs 2, Persona 3 Reload) — the carousel image renders wider than its column and visibly extends behind the sidebar's status panel instead of stopping cleanly at the edge. On Persona 3 Reload's page the game's own logo text is visibly poking out from behind/around the white "HYPERVISOR" status card, and the same edge-bleed shows on every other game page checked. This isn't an intentional overlapping-hero-image design choice — it reads as broken, the main column and the sidebar aren't respecting each other's boundaries.

Check `GameDetail.css`'s `.detail-grid` / `.detail-main` / `.detail-side` rules (and whatever `Carousel`'s own CSS does for width/overflow) — the carousel likely isn't constrained to `.detail-main`'s actual column width, rendering full-bleed under `.detail-side` instead of stopping where the two-column grid says it should. Fix so the carousel's right edge lines up cleanly with where the sidebar begins, no overlap, on both the Phase 1 light layout and the new dark mode.

---

## What NOT to touch

Don't change the `UNIQUE(game_id, group_name)` constraint itself — collapsing to one row per group is the right call, the bug is in what happens on conflict, not the constraint's existence. Don't touch `/api/catalog`'s read query, this is a write-path bug for item 1. For item 3, don't restructure the overall detail-grid layout beyond fixing the width/overflow issue — this is a containment bug, not a redesign.

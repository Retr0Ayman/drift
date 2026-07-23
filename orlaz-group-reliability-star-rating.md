# orlaz — automatic, data-driven group reliability star rating (1-5 stars)

Want a star rating per group (scene + P2P) shown on the Groups page, reflecting how reliable/good their releases actually are. Important constraint, confirmed via research: **there is no real "scene group reputation API"** — CrackWatch only tracks crack status (cracked/not cracked), not quality; xREL's public API is release listings, not a reputation dataset. Group reputation as discussed casually (Discord, Reddit, NFO drama) is just community folklore, not a queryable data source. So this must NOT be an AI-guessed/vibes-based score presented as fact — that would be the exact kind of fabrication this project has repeatedly stamped out elsewhere (fake DRM, fake crack timing, etc.). Instead, build a real, re-computable score from actual release data this project already ingests or can pull from xREL.

---

## 1. Identify real, objective signals available per group

Investigate what xREL's actual API responses contain per release (check `worker/backfill/` — wherever xREL data is currently parsed) for signals that indicate crack quality/reliability, for example:

- **Nuke status** — xREL and/or NFO data sometimes reflects a release being nuked (marked bad/incomplete/wrong by the scene) — check if this is actually present and parseable in the data orlaz already pulls, or would need an additional xREL endpoint/field.
- **"Proper"/fix release frequency** — if a group's crack for a game later needed a "PROPER," "REPACK," "FIX," or similar follow-up release (by them or another group) correcting a broken original crack, that's a real, direct signal the original was flawed. This project already has crack-vs-repack chronological data (Crack Timeline, `first_seen_ts` work) — this can likely be built directly on top of that.
- **Time-to-fix** — if a crack needed correcting, how long it took (same day fix vs. weeks-broken) is a legitimate reliability signal.
- **Release volume/consistency** — a large, consistent release history over time (like TENOKE's 906 tracked releases) is itself weak-but-real signal of an established, active group vs. a one-off/inactive one — use cautiously, volume alone isn't quality.

Be upfront in the completion report about which of these are actually derivable from real data available right now vs. which would need new data collection — don't force a signal that isn't really there.

## 2. Compute a 1-5 star score automatically from whichever real signals are confirmed available

Design a transparent, explainable formula (not an AI/LLM-generated score) combining the confirmed real signals above into a 1-5 rating per group. Recompute this periodically (piggyback on an existing cron/backfill job rather than adding a whole new one, if reasonable) so it updates automatically as new release/fix data comes in — this should never need manual re-curation. Store the computed score (and ideally which underlying signals fed it) in D1 alongside the group's existing data.

## 3. Display it on the Groups page

Add the star rating to each group card (5-star visual, matching the existing pill/badge design system — reuse existing tokens, don't invent new colors). Consider a small tooltip/expandable detail showing *why* a group has its score (e.g. "2 releases required a proper fix out of 54") so it reads as a transparent computed metric, not an opaque arbitrary number — this reinforces that it's real data, not vibes.

---

## What NOT to do

- Do NOT have an LLM (Groq or otherwise) generate or guess star ratings based on general "reputation" knowledge — no fabricated/vibes-based scores presented as objective fact, consistent with how this project has always required real grounding for anything shown as fact.
- Do NOT hardcode specific groups' star ratings manually (e.g. DenuvOwO=5, voices38=4) — the whole point is this must be automatic and re-computed from real data, not a manually curated list that goes stale.
- If a proposed signal turns out not to be reliably available from real data, drop it rather than approximating it with a guess.

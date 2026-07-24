# orlaz — cracks must be the default/primary view; repacks go behind an explicit toggle, not just a tag

Follow-up/sharpening of the earlier repack-distinction ask (`orlaz-p2p-classification-and-repack-distinction.md`, item 2) — that brief left the exact UI treatment open to judgment ("badge, de-emphasis, or a toggle"). Concrete spec now: **cracks are the default, primary content. Repacks are hidden behind an explicit toggle/subsection, not mixed into the same default list with just a different-colored tag.** Right now repacks and cracks still show up interleaved in the same list with equal visual weight — that's the actual complaint, a passive tag isn't enough.

---

## 1. Release lists default to showing only real cracks

Wherever a list of releases for a game (or group, or anywhere release lists appear — game detail "Crack options" tab, group pages, home/digest) is rendered, the default view should show only genuine cracks (using the existing Crack Timeline / `first_seen_ts` chronological data already built this session to distinguish true-original-crack releases from repacks/updaters). Repacks should NOT appear in this default list at all.

## 2. A clear, explicit toggle/subsection reveals repacks on demand

Add a toggle (tab, expandable section, or switch — match the existing design system's patterns for this, e.g. similar to how "Crack options (7)" is already its own tab on the game detail page) that a user can click to reveal repacks separately. Label it clearly (e.g. "Repacks" or "Show repacks (N)") so it's obvious this is a secondary, opt-in view, not equal footing with the crack list.

## 3. Apply consistently everywhere release lists appear

Game detail page, group pages, home page/digest — anywhere a release list currently mixes cracks and repacks together needs this same default-cracks-only + toggle-for-repacks treatment, not just one page.

---

## What NOT to touch

Don't delete repack data — it's still there, just behind the toggle. Don't change the underlying Crack Timeline/first_seen_ts logic that determines what counts as a genuine crack vs. a repack — that classification already exists and is correct, this is purely about how it's displayed.

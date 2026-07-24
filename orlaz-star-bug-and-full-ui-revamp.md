# orlaz — star ratings all show "Not yet rated" despite real data, plus: drop dark/light mode, full site UI revamp (liquid glass + lava lamp, one universal theme)

Two screenshots confirmed live (Groups page, P2P and Scene tabs). Two separate problems:

---

## Part A — bug: every group shows "Not yet rated," including ones with hundreds of releases

The migrations (`0007_filter_playmagic_releases.sql`, `0008_add_group_reliability.sql`) ran successfully against production D1 (confirmed: 34 rows written, then 3 rows written, no errors). But every single group card — including TENOKE (912 cracks), RUNE (457 cracks), ElAmigos (169 cracks), x.X.RIDDICK.X.x (122 cracks), DenuvOwO (177 cracks) — shows "Not yet rated," even though the brief's own stated minimum sample size was just 5 releases. This is not the expected "small/new group, not enough data" case — these are the biggest, most active groups in the catalog. Something is broken between the migration and the actual score computation/display, not a legitimate "no data yet" state.

Investigate and fix:
- Has the hourly reliability-recompute cron job (piggybacked on the existing 15-min cron per the last report) actually run even once since deploy? Check logs/last-run timestamp.
- If it has run, check whether it's writing to the right column/table, whether the frontend (`GroupCard`-equivalent component on the Groups page) is reading the right field, and whether a null/undefined default is being shown instead of a computed value even when one exists.
- If it hasn't run yet, either trigger it manually once to backfill immediately, or confirm exactly when it will next run and report that clearly instead of leaving this ambiguous.
- Verify with a real query against production D1 directly (not just code review) that at least one group actually has a non-null computed score after this is fixed, and that the Groups page then reflects it.

---

## Part B — full site UI revamp: drop dark/light mode entirely, one universal "liquid glass + lava lamp" theme everywhere

Decision: remove the dark/light mode toggle and the underlying theme-switching system entirely. One single, deliberately-designed universal look across the whole site, combining:

- **Liquid glass** — the existing translucent/blurred glass tile treatment (already built this session: `--glass-highlight`, `--glass-ambient`, `--glass-shadow-lg` tokens, blur, translucency, border-radius system) applied consistently to every card/tile/panel site-wide.
- **Lava lamp background** — the glossy, saturated, merging metaball blob background (blue/magenta/purple, specular highlights, near-black or deep base) — that background work should underpin this whole site now, not just the home page hero.

This is a full-site consistency pass, not a page-by-page patch:

1. **Remove the theme toggle UI element** (moon/sun icon in the navbar) and the underlying dark/light CSS variable switching logic — collapse `tokens.css` (and wherever light/dark variants are currently defined) down to one single set of values tuned specifically for this glass-on-lava-lamp look. Don't just hardcode "dark mode values as the only mode" without checking they were actually designed for permanence — tune contrast/readability deliberately for text sitting on top of a colorful moving background, since that's a harder readability case than a flat dark/light background.
2. **Apply the lava lamp background sitewide**, not just the home page — Groups, Digest, Publishers, Watchlist, and individual game detail pages should all sit on the same glossy blob background system (with the existing per-game cover-art color reactivity preserved specifically on game detail pages; other pages use the neutral/default palette).
3. **Audit every page for legibility** against the new background — text contrast, card/tile opacity, and glass blur intensity all need to hold up against a moving, colorful backdrop, not just a static dark background. This is a real risk area (colorful moving background behind text is much easier to get wrong than a flat one) — check contrast on every page type, not just the homepage hero where the current implementation was designed.
4. **Reuse the already-established design tokens/system** (radius scale, glass tokens, status colors, pill/badge system) rather than inventing new ones — this project already did a full design-consistency audit earlier this session (border-radius scale, accent color discipline, etc.); this revamp should sit on top of that existing system, not replace it.

---

## What NOT to touch

Don't change the underlying status-color meanings (hv/trad/dead/out/unc/unv) or the P2P/Scene group data logic — this is a visual/theme consolidation, not a data change. Don't remove the beta/LIVE badges.

# orlaz — version picker fix + dark mode

Two things from live review of `VersionPicker` (just shipped in `26c1f6f`) plus a new feature request.

---

## 1. Version picker: build number showing "—", and it looks broken, not just unstyled

Screenshot from the live Watch Dogs 2 page: the "Best crack build" row in the status panel reads "—", and the version picker trigger reads "Update 1 —" (dash where the build pill should be), despite the page claiming "7 crack options tracked." Below it, the actual release card shows a real traditional release from CPY, "Cracked in 466 days," "Updated 4x" — so there's real release data on this page, but neither the top summary nor the picker is surfacing a build number for any of it.

**Investigate before styling anything** — this could be two different things and they need different fixes:

- **A real bug**: `bestBuild()` (in `src/lib/format.ts`) isn't finding/returning a build from `mergedGame.releases` even though releases clearly exist, or `VersionPicker`'s own `fmtBuild(selectedRelease.build)` is being called on a release whose `build` field never got populated during parsing for this specific release (a CPY traditional release — check whether `parseReleaseRows`/the P2P merge path both reliably set `build` when xREL's dirname or metadata actually contains one). Compare against a game/release combo known to have a confirmed build number and confirm the field is actually being read correctly end to end.
- **Or genuinely no build exists for this specific release** (CPY's own release truly has no confirmed build match) — in which case showing a bare "—" is technically honest but reads as broken UI, not "we don't know yet." If that's the case, the fix is presentation, not data: never render a bare dash for a build slot — use the same "Unverified" language/treatment the rest of the app already uses for unknown builds (see `relStatus`'s existing Pill treatment referenced in the accuracy brief's section 1b), so an unknown build reads as an intentional state, not a rendering failure.

Check both. Whichever it turns out to be, "Update 1" as a version label is also suspicious for a game with 7 tracked releases across presumably multiple updates — confirm `parseVersionFromDirname()` is actually extracting real version strings for every group's dirname format, not just defaulting to a generic "Update N" placeholder when parsing fails silently.

---

## 2. Version picker layout: should be an open list, not a collapsed dropdown

The reference screenshot (Steam's own "choose a version" — already shared) shows every tracked version as a visible row: version label, build-number pill, checkmark on the selected row, "Latest" tag on the newest — all visible at once, no click required to see what's tracked. What actually shipped is a Radix `Select` trigger that shows only the currently-picked row collapsed, and requires a click to open the rest — functionally fine, but it's not what was asked for and it's not what the reference showed.

**Fix**: change `VersionPicker.tsx` from a `Select`-style single-value trigger to an always-open, inline scrollable list inside the sidebar panel — same data and same per-row rendering already built (`releaseKey`, `latestKey`, checkmark via `RadixSelect.ItemIndicator`-equivalent, build `Pill`), just rendered as a static list of rows instead of gated behind a collapsed trigger. Radix `Select` isn't the right primitive for "always visible" — either drop Radix here and render a plain list with a controlled "selected" row (click a row to select it, same as clicking a `RadixSelect.Item` does now), or use Radix `RadioGroup`/a plain button list styled to match. Keep the existing `VersionPicker.css` visual language (Pill, spacing) — this is a structural change (open list vs. collapsed dropdown), not a full restyle.

---

## 3. Dark mode

Auto, based on system preference (`prefers-color-scheme: dark`) — no manual toggle for this pass.

- `src/styles/tokens.css` currently defines the Phase 1 light/paper palette as the only palette. Add a dark variant of every token currently defined there (background, text, border, the `--accent`/`--out`/`--unc`/`--dead`/`--unv`/`--hv` status colors, glass/aura gradient colors) inside a `@media (prefers-color-scheme: dark) { :root { ... } }` block (or the CSS custom-property pattern already in use, check how tokens.css structures light values first and mirror it) — every token needs a real dark-mode value, not just a handful, or parts of the site will silently stay light-only.
- Status colors (`--accent`, `--out`, `--unc`, `--dead`, `--unv`, `--hv`) need to stay clearly distinguishable against a dark background — don't just reuse the light-mode hex values as-is, check contrast.
- The Phase 1 "aura" conic-gradient treatment on the search bar and hero panels needs its own dark-mode variant too, not just the flat card colors — check `GlassPanel.css` for where that gradient is defined and give it a dark-appropriate version rather than leaving it looking washed-out or blown-out against a dark background.
- Don't add a toggle UI for this pass — purely `prefers-color-scheme`-driven. If a toggle gets requested later, that's separate follow-up work (needs a persisted preference, `localStorage` + override logic).

---

## What NOT to touch

Don't touch the data-fetching logic in `usePlatformP2PIndex`/`worker/routes/xrel/group.ts` (verified working, item 4 from the last round) — this round is about what's already-fetched data renders as, not how it's fetched. Don't add a dark-mode toggle button in this pass, system-preference only.

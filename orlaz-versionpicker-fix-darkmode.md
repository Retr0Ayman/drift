# orlaz — revert version picker, fix build/version display, dark mode

Correction on the previous round: the `VersionPicker` component (`26c1f6f`) was a misread of the original ask. The reference screenshot (Steam's "choose a version" list) was only ever meant to show the *formatting* — how a version label and build number should look together (label + build pill) — not a request to build an actual version-switching control. This site doesn't serve manifests or downloads, there's nothing for a user to actually "choose" — switching versions has no effect on anything. Revert it.

---

## 1. Revert VersionPicker entirely

- Remove `<VersionPicker releases={releases} />` and its wrapping `GlassPanel` from `GameDetail.tsx`'s sidebar — back to how the sidebar looked before `26c1f6f` (status panel, then straight to the action buttons: View on Steam / Build history / News source).
- Delete `src/components/game/VersionPicker.tsx` and `VersionPicker.css` — don't leave them as dead unused files.
- The only thing worth keeping from that work is the underlying data-correctness fixes if `813af25` already landed (see section 2) — those apply to `ReleaseCard`, not the picker, so they survive the revert regardless.

---

## 2. Version/build formatting — apply it to the release cards, where it actually belongs

What was actually wanted: each release already shown in the "Crack options" tab (`ReleaseCard.tsx`) should display its version and build number clearly formatted — version label next to a build-number pill, same clean look as the reference screenshot's rows — not a separate control. Confirm `ReleaseCard.tsx`'s existing `Version` / `Crack build` fields use that pill/badge treatment (it already renders both per the accuracy brief's section 1b, this is a formatting check, not new plumbing).

The underlying data bugs flagged last round still apply here regardless of the revert, since they affect every release display, not just the removed picker:

- **Build showing "—" incorrectly**: if `813af25` isn't already committed, confirm `bestBuild()` (`src/lib/format.ts`) and `ReleaseCard`'s own build lookup actually find a real build when one exists in the release data, rather than defaulting to `0`/null and rendering a bare dash. Where a build is genuinely unknown, use the existing "Unverified" label/pill treatment instead of a bare dash — a dash alone reads as broken, not "unknown."
- **Version label showing "Update 1" / generic placeholders**: confirm `parseVersionFromDirname()` correctly extracts real version strings (e.g. `"1.0.6"`) for every group's dirname format, not silently falling back to a generic "Update N" when parsing fails.

If `813af25` already landed and both are confirmed fixed on `ReleaseCard`, this section is just a formatting/spacing check, not a data fix.

---

## 3. Dark mode — now with a manual toggle

Originally scoped as system-preference-only; upgraded on request to a real toggle. Default to `prefers-color-scheme: dark` on first visit, but add a visible light/dark toggle (nav or header, wherever fits the existing layout without crowding it) that overrides the system default and persists the choice in `localStorage` (e.g. `orlaz:theme`, values `"light" | "dark" | "system"`). On load: read the stored preference if one exists, otherwise fall back to `prefers-color-scheme`.

- `src/styles/tokens.css` currently defines the Phase 1 light/paper palette as the only palette. Add a full dark variant of every token currently defined there (background, text, border, the `--accent`/`--out`/`--unc`/`--dead`/`--unv`/`--hv` status colors, glass/aura gradient colors). Since this now needs a manual override, not just a media query, drive it with a `data-theme="dark"` attribute (or class) on `<html>`/`<body>` that a small hook sets/toggles — CSS then keys off `[data-theme="dark"] { ... }` for the overrides, with the `prefers-color-scheme` media query only used to pick the *initial* value before any stored preference exists.
- Status colors need to stay clearly distinguishable against a dark background — don't just reuse the light-mode hex values as-is, check contrast.
- The Phase 1 "aura" conic-gradient treatment on the search bar and hero panels needs its own dark-mode variant too — check `GlassPanel.css` for where that gradient is defined and give it a dark-appropriate version rather than leaving it washed-out or blown-out against a dark background.
- Toggle UI: simple sun/moon icon button is fine, match existing icon-button patterns already in the codebase (e.g. `WatchToggle`) rather than inventing new button styling.

---

## 4. Carousel shows a blank box when a Steam image 404s

Confirmed by reading `GameDetail.tsx`: when `mergedGame.appid` is truthy, the carousel unconditionally tries to load `library_hero.jpg`, `header.jpg`, and `capsule_616x353.jpg` from Steam's CDN for every game, and the only failure handling is `onError={(e) => (e.currentTarget.style.display = "none")}` — hiding the broken `<img>` with nothing to replace it. Older/less common titles (confirmed live on Watch Dogs, the original) don't have all three image sizes on Steam's CDN, so a slide renders as an empty grey box instead of content. Unresolved games (no `appid`) already get a proper `carousel-placeholder` div ("Screenshot N · streams from Steam when live") — resolved games with a missing specific image size should fall back to the same placeholder treatment for that slide instead of a blank box, or skip that slide from the carousel entirely rather than rendering nothing.

---

## What NOT to touch

Don't touch the data-fetching logic in `usePlatformP2PIndex`/`worker/routes/xrel/group.ts` (verified working, item 4 from the last round) — this round is about what's already-fetched data renders as, not how it's fetched. Don't rebuild any version-switching control — the revert in section 1 is final, not a placeholder for a smaller version of the same idea.

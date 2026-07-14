# orlaz — Phase 1: rebrand + hybrid light/glass redesign + directory count fix

Phase 1 of 3 (database migration and AI features are separate briefs, coming after this one ships and gets checked out live). Supersedes the earlier all-flat "e-book" version of this brief — direction changed after reviewing mockups: **light/paper base everywhere, with a flowing gradient "aura" glass treatment reserved for a couple of key elements**, not full minimalism and not full glass either.

Read against current `main` (commit `ae35805`). File paths below are real.

---

## 0. Comment style for this pass (applies to everything below)

The existing codebase has a habit of long, essay-length "why" comments explaining every decision (you'll see them all over `src/lib/`, `worker/routes/`). Don't extend that habit into new code written for this phase. Normal, professional-grade comments only — a line explaining a genuinely non-obvious choice is fine, a paragraph justifying it isn't. This applies to code comments specifically; it has no bearing on commit messages or anything user-facing (nothing in this brief puts developer notes in the UI anyway — the "A / B" labels in the concept mockups were chat-only, not something that was ever going into the real build).

---

## 1. Rebrand: Orvyn → orlaz

Always lowercase, never capitalized. Every place "Orvyn" appears as user-facing text becomes "orlaz":

- `src/components/layout/Navbar.tsx` — `<span className="navbar-title">Orvyn</span>`
- `src/components/layout/Footer.tsx` — "Orvyn by DaRealAyman · status & build tracker..."
- `src/components/home/Hero.tsx` — the `<motion.h1 className="hero-word">Orvyn</motion.h1>`
- `index.html` — `<title>Orvyn · by DaRealAyman</title>`
- `src/components/publishers/PublishersDirectory.tsx` — "Every publisher Orvyn is tracking" (found while reading this file for the count-fix below)
- `src/components/layout/IntroAnimation.tsx` — the splash screen's "Orvyn" word

Grep for "Orvyn" afterward to catch anything not listed here.

Leave `wrangler.jsonc`'s `"name": "drift"`, the repo name, and `package.json` alone — renaming those risks breaking the live deployment's routing. This phase is a skin change, not an infra change.

**Attribution stays, just restyled.** Keep "by DaRealAyman" — it's already in `Navbar.tsx` (`navbar-sub`) and `Footer.tsx`, don't remove it, just carry it into the new palette. Small, low-emphasis (`--ink-3`, small-caps or letter-spaced uppercase like the current `navbar-sub` treatment) — a quiet credit line, not a second headline. "orlaz" is the loud element; "by DaRealAyman" stays exactly as understated as it already is today, just recolored for the light theme.

**Cut the blunt tagline.** `Hero.tsx`'s `hero-tag` — "Crack · build · version tracker" — comes out. The product should read as self-evident from the actual UI (the live signal stats, the search bar, the catalogue itself) rather than a literal technical label explaining what it is. Delete the line rather than replace it with different copy; if the hero feels like it needs *something* between the wordmark and the description paragraph, that's a judgment call, but don't just swap in a different one-liner that does the same job.

---

## 2. Design direction: light base, glass aura on select elements only

Two concepts were mocked up and compared directly. **This one won**, not the all-flat version and not full-glass-everywhere:

- **Base**: paper-light surfaces (`#f7f5f0` page, `#ffffff` raised), near-black ink (`#17150f`), same register as the original e-book brief.
- **Cards**: flat by default — thin hairline border (`rgba(23,21,15,0.1–0.12)`), minimal shadow, no blur. This is the vast majority of the UI: publisher cards, group cards, game cards, the leaderboard table, the watchlist.
- **The aura**: a slowly rotating conic-gradient ring (soft, desaturated — think `#6b4fa055` purple through `#1f7a6c55` teal, low opacity, not neon) framing a thin frosted-glass panel. Reserved for a small number of high-visibility spots so it reads as a deliberate signature, not a theme applied everywhere:
  - The global search bar (`src/components/search/SearchBar.tsx` / `.css`) — the flagship placement, closest to the actual "Apple Intelligence" reference (a search/input surface).
  - One hero-level stat panel per page at most — e.g. the "Live signal" panel in `Hero.tsx` and the equivalent in `PublishersDirectory.tsx` (`publishers-signal`) and `GroupsDirectory.tsx`. Use judgment on whether all three or just the homepage one earns it; the goal is restraint, not consistency for its own sake.

Everything else — `GlassPanel` as used on individual cards throughout `GameCard`, `ReleaseCard`, `GroupProfile`, `PublisherProfile`, `Leaderboard`, `Watchlist` — stays flat, no aura, no blur.

**Implementation approach**: keep `GlassPanel` as the default flat card (rewrite `GlassPanel.css` to the flat hairline-border style, no `backdrop-filter`, no glow `::before`). Add a new opt-in variant — a prop like `aura` on `GlassPanel`, or a separate small component if that's cleaner — that wraps children in the rotating conic-gradient ring + a lighter `backdrop-filter: blur()` frosted panel. Apply it only at the handful of call sites listed above.

Rough CSS for the aura ring (adapt values, this is a starting point not a copy-paste mandate):

```css
.aura-ring {
  border-radius: var(--r-lg);
  padding: 1.5px;
  background: conic-gradient(from var(--aura-angle, 0deg), #6b4fa055, transparent 35%, #1f7a6c55, transparent 75%);
  animation: aura-spin 9s linear infinite;
}
.aura-ring > * {
  border-radius: calc(var(--r-lg) - 1.5px);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
}
@property --aura-angle {
  syntax: "<angle>";
  initial-value: 0deg;
  inherits: false;
}
@keyframes aura-spin {
  to { --aura-angle: 360deg; }
}
```

**Rewrite `src/styles/tokens.css`** with the light palette (same values as the original brief's proposal — repeating here since that version's been superseded):

```css
:root {
  color-scheme: light;
  --bg-0: #f7f5f0;
  --bg-1: #ffffff;
  --bg-2: #efece4;
  --ink: #17150f;
  --ink-2: rgba(23, 21, 15, 0.68);
  --ink-3: rgba(23, 21, 15, 0.45);
  --ink-4: rgba(23, 21, 15, 0.14);
  --accent: #17150f;
  --accent-ink: #f7f5f0;
  --accent-dim: rgba(23, 21, 15, 0.06);
  --accent-dim-2: rgba(23, 21, 15, 0.1);
  --hv: #6b4fa0;
  --trad: #1f7a6c;
  --dead: #2f7a4f;
  --out: #b5602a;
  --unc: #a13f34;
  --unv: #7a7263;
  --glass-border: rgba(23, 21, 15, 0.12);
  --glass-border-strong: rgba(23, 21, 15, 0.2);
  --glass-shadow: 0 1px 2px rgba(23, 21, 15, 0.06);
  --glass-shadow-lg: 0 2px 8px rgba(23, 21, 15, 0.08);
  --font-display: ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif;
  --font: -apple-system, system-ui, Inter, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  --r-lg: 8px;
  --r-md: 6px;
  --r-sm: 4px;
  --pill: 999px;
  --wrap: 1180px;
}
```

(Radii are slightly less severe than the original all-flat brief's 2–4px — 6–8px reads less "print document," better suited to sitting next to the rounder aura panels. Judgment call, adjust if it looks off in practice.)

Apply `var(--font-display)` to h1/h2/hero-word for the serif-headings-on-sans-body feel.

**Sweep for leftover glass-era styling** the token rewrite alone won't catch: `Navbar.css` and `Navbar.tsx`'s inline `rgba(255,255,255,...)`/`rgba(0,0,0,...)` scroll-shadow values, plus `Groups.css`, `GameCard.css`, `Pill.css`, `SegmentedControl.css`, `Select.css`, `Pagination.css`, `Hero.css`, `GameDetail.css`, `Carousel.css`, `globals.css`. Grep `src/**/*.css` and `src/**/*.tsx` for `backdrop-filter`, `rgba(255, 255, 255`, `rgba(0, 0, 0`, and `glow`.

`favicon.svg`, `DriftMark.tsx`, `DriftGlyph.tsx` — redraw as flat single-weight line art that works on paper-white (no gradient fills, no glow), or at minimum strip the existing gradient/glow down to a solid `currentColor` stroke if a full redraw doesn't fit in this pass.

---

## 3. Logo: an "O" that becomes "orlaz"

There's already a splash screen doing roughly this shape of thing — `IntroAnimation.tsx` shows a circular mark centered on screen, holds for 2.2s, then measures the real navbar logo's position (`getBoundingClientRect`) and animates the mark zooming/translating into it while the "Orvyn" word and sub-label fade out separately. Rebuild that concept as an actual letterform transition instead of a generic ring sliding to a different location while unrelated text fades:

- Redraw the mark itself (`DriftMark.tsx`, and the matching shape in `IntroAnimation.tsx`'s inline SVG, and `favicon.svg`) as a stylized capital **O** letterform — something that unambiguously reads as "the first letter of orlaz," not a generic circle/ring.
- On the splash, instead of the word "orlaz" fading in as separate text next to the mark, have the **O animate into position as the literal first character of the word**, with "rlaz" extending out from it (sliding in, or revealing) so the mark visibly becomes the wordmark rather than sitting beside it.
- The codebase already uses Framer Motion (`motion/react`) everywhere, including a hand-rolled version of exactly this position-matching trick (the manual `getBoundingClientRect` + `x`/`y`/`scale` animation in `IntroAnimation.tsx`). Framer Motion's `layoutId` prop does this kind of shared-element transition natively — give the standalone splash "O" and the "o" character inside the navbar's rendered "orlaz" wordmark the same `layoutId`, and Motion will auto-interpolate size/position between them on mount/unmount instead of it needing to be hand-measured. Worth using here instead of extending the manual-measurement approach further.
- Keep the "BY DAREALAYMAN" sub-label and the skip button/reduced-motion fallback from the current implementation — those already work fine, this is about the mark-to-wordmark transition specifically, not a rebuild of the whole splash mechanism.

---

## 4. Fix: publisher/group counts are wrong

The "57 publishers shown" number (and every count on that page — "SEGA · 7 titles," etc.) is real code, but it's counting the wrong thing. Root cause, confirmed by reading the source:

`PublishersDirectory.tsx` calls `publishersIndex(games)` (`src/lib/companies.ts`), which just tallies `games[].publisher` — and `games` comes from `useCatalog()`, which is `useLiveCatalog()`'s state. That hook only fetches **page 1** of `/api/xrel/browse` on mount (`per_page=60`); further pages only load via `loadMore()`, which nothing calls automatically on the Publishers or Groups pages. So "57 publishers" and every per-publisher count is only ever counting whatever's in that first page of ~60 releases — not the real catalog. This is the exact same class of bug as the DenuvOwO group-count issue from earlier in the project, just showing up on a different page.

**Fix**: before `publishersIndex`/`groupsIndex` compute their counts, the full catalog needs to actually be loaded, not just page 1. Two ways to do it, pick based on how bad the page-count turns out to be in practice:

- **If it's a reasonable number of pages** (check `pagination.total_pages` on a live `/api/xrel/browse?page=1&per_page=100` response first): have `PublishersDirectory` and `GroupsDirectory` call `loadMore()` in a loop on mount until `hasMore` is false, show a loading state while that runs, then compute the index once fully loaded. `useLiveCatalog` already exposes `hasMore` and `loadMore` for exactly this.
- **If it's a lot of pages** (slow, bad UX to block on): this is genuinely what Phase 2's database is for — don't over-engineer a client-side full-crawl workaround if it's going to feel worse than just waiting for the real fix. In that case, ship this phase with an honest label change instead of a fake-precise wrong number — e.g. "57+ publishers (page 1 of the catalog)" — and note in the PR description that full accuracy lands with Phase 2's D1 migration, which the cron job (already being built for Discord alerts) will feed with the complete catalog instead of a paginated crawl.

Use judgment on which path once you've actually checked how many pages `/api/xrel/browse` has server-side (900s Cloudflare-edge-cached per `browse.ts`, so a full crawl isn't hammering xREL even if it's a lot of requests) — but don't ship a number that's presented as complete when it isn't, that's the actual bug, not just "the count is low."

---

## A note on "AI everywhere"

That's real, and it's coming — but it's Phase 3, not this one, on purpose: AI features need the database from Phase 2 to have anything real to work off (search over a live-but-partial client array isn't worth building twice). What this phase does do to set it up: the aura treatment lands on the search bar specifically, which is the natural seat for "ask it something" later rather than a plain text filter. Nothing to build here, just don't be surprised the AI itself isn't in this pass — it's next.

---

## What NOT to touch in this phase

No changes to `worker/**`, `src/hooks/useGroupReleases.ts`, `src/hooks/useStarredGroupSummaries.ts`, or the P2P group-lookup logic — those are separate from the browse-pagination issue this section fixes and are already working correctly. If `loadMore`-on-mount needs new logic added to `useLiveCatalog.ts` itself (likely, to support "load everything" as a mode distinct from the existing scroll-triggered `loadMore`), that's in scope; rewriting catalog-fetching logic beyond what's needed for this fix is not.

# orlaz — move GameFact to its own sidebar widget + AI-tag aura treatment

Two focused UI changes, both self-contained.

---

## 1. Move "Did you know" out of Overview, into its own sidebar widget

Right now `GameFact` renders inside the Overview tab (`GameDetail.tsx`'s `detail-overview` content, alongside `mergedGame.desc`). Move it out entirely — it should be its own standalone `GlassPanel` widget in the sidebar (`detail-side`), positioned directly under the existing `side-actions` panel (the one with View on Steam / Build history · SteamDB / News source · xREL buttons) — so the sidebar order becomes: status panel → action buttons panel → GameFact widget.

- Remove `<GameFact game={mergedGame} />` from the Overview tab's JSX.
- Add a new `<GlassPanel className="side-panel">` wrapping `<GameFact game={mergedGame} />` in `detail-side`, after the existing `side-actions` panel.
- `GameFact` already handles its own empty/loading state (per the existing "quiet no-op, never a placeholder" pattern the other AI features follow) — if it renders nothing when there's no fact yet, wrap it so the empty `GlassPanel` doesn't show as a blank box (either have `GameFact` itself return `null` when empty and conditionally skip rendering the wrapping panel, matching how the sidebar already skips the P2P/version panels when empty elsewhere in this file).

---

## 2. Give AI-generated content tags their own aura treatment

Every place this app marks something as AI-generated (the small "AI" label/badge on `AiSummary`, `FaqSection`, and `GameFact` — check each component for however it currently flags itself, they may not all do it identically) should get a visually distinct treatment using the Phase 1 aura system, not a plain grey Pill like everything else.

- Reuse the existing aura tokens from `tokens.css` (`--aura-a`, `--aura-b`, `--aura-blur`) and the rotating-gradient technique already built for `.glass-panel--aura` (search bar / hero panel) in `GlassPanel.css` — but scaled down to badge size, not a full panel wash. A small pill/tag with a subtle rotating conic-gradient ring or glow at badge scale, same visual language, same colors, just proportioned for a small inline tag instead of a full panel.
- This is a deliberate, scoped extension of the "aura reserved for search bar + one hero panel per page" rule from Phase 1 — extend it specifically to AI-content indicator tags, nothing else. Don't spread the aura treatment to any other UI element while doing this.
- Apply consistently across all three components (`AiSummary`, `FaqSection`, `GameFact`) so the "this is AI-generated" signal looks the same everywhere it appears, light and dark mode both.

---

## What NOT to touch

Don't change what `GameFact`/`AiSummary`/`FaqSection` actually generate or their grounding/fail-honest logic — this is presentation only. Don't apply the aura treatment anywhere outside AI-content tags.

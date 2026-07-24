# orlaz — blobs are all uniform perfect circles (need size/shape variety) and per-game color reactivity has stopped working

Two real regressions/gaps confirmed after the last blob-rebalance round:

---

## 1. Blobs are all near-identical perfect circles — need real size and shape variety

The new `BLOBS` data array (rewritten last round from 5 large hand-written blocks to 20 smaller ones) is producing blobs that all look like uniform perfect circles of similar size. Want real variety:

- **Size variety**: a genuine mix of big and small blobs, not 20 blobs that are all roughly the same size just smaller than before. Vary the size range meaningfully across the array (some noticeably larger anchor blobs, many smaller ones scattered around/between them).
- **Shape variety**: perfect circles read as fake/uniform — real lava-lamp blobs (and the original reference image/mockup) have soft, irregular, slightly organic shapes, not geometrically perfect circles. This could come from: varying border-radius per blob (e.g. `border-radius: 42% 58% 55% 45% / 48% 42% 58% 52%`-style irregular values instead of `50%`), slightly randomizing each blob's aspect ratio (not perfectly square width/height), or leaning on the blur/goo merging itself to naturally distort edges where blobs are close enough to interact. Use whichever approach fits the current rendering technique (check whether it's pure CSS shapes, SVG, or the goo-filter approach) but the end result needs to NOT read as a grid of identical circles.

## 2. Per-game accent color reactivity appears to have stopped working

The background blobs should shift color toward the specific game's cover-art-derived accent color on game detail pages (via the existing `useAmbientAccent`/color-extraction system, built earlier this session) — this reactivity isn't visibly happening anymore; the blobs look like they're using the same fixed blue/magenta/purple palette everywhere regardless of which game's page is open. Investigate whether this is a real regression from the `BLOBS` array rewrite (e.g. the new array hardcodes fixed colors per blob instead of referencing the CSS custom properties `useAmbientAccent` sets on `:root`/the accent variables) — check that each blob's color is still pulling from the accent CSS variables (`--ambient-primary`, `--cosmic-a`/`--cosmic-b` or whatever the current variable names are) rather than a literal hardcoded hex value baked into the new data array. Fix so the reactivity that worked earlier this session is restored, verified on at least 2-3 game pages with visually distinct cover art colors (e.g. Watch Dogs 2's blue/fog tones vs. a game with a red or green-dominant cover).

---

## What NOT to touch

Don't reduce the overall blob count back down, don't reintroduce the earlier bug where blobs were sized so large they ate all negative space — keep the many-small-blobs density from last round, just make them vary in size/shape and restore color reactivity.

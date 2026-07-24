# orlaz — per-game color reactivity is a center-screen hue wash, not actual per-blob color changes

Confirmed by direct observation: the "reactive" per-game accent color is NOT visibly changing individual blobs' colors. What's actually happening is a general hue shift concentrated in the middle of the screen — looks like a single overlay/vignette/gradient wash tinting the center, not each designated "reactive-role" blob genuinely rendering in the game's accent color. This means the last fix (raising reactive blob count to 8/20, blend ratio to 72/28) technically changed some CSS variable/blend value, but the actual visual mechanism isn't what was assumed — it's not 8 distinct blobs shifting color, it's some other layer (possibly a radial gradient overlay, or a single large ambient wash element separate from the individual blob divs) picking up the accent color and washing over the center of the screen.

---

## 1. Find the actual element producing the center-screen hue change

Don't trust the last round's fix conceptually — inspect the real deployed DOM/CSS structure and find exactly which element is visibly changing color right now. Likely candidates: a separate `.ambient-wash`/vignette/radial-gradient overlay element (distinct from the individual `.ambient-blob-N` divs) that predates the blob rework and is the actual thing reading `--ambient-primary`/accent variables, while the individual blobs themselves are NOT actually wired to those variables despite the "8/20 reactive-role" changes claimed last round.

## 2. Make individual blobs actually change color, not just a center wash

The real goal (stated multiple times this session) is that individual blob shapes scattered across the whole viewport should visibly shift toward the game's accent color — not a soft central hue overlay. Trace each of the "reactive-role" blobs' actual CSS and confirm each one's own `background`/gradient literally references the accent CSS variable (not a shared overlay element positioned near the center). If the current architecture has a separate center-positioned wash element doing the visible color work instead of the blobs themselves, either wire the actual blob divs' colors to the accent variable directly, or remove/de-emphasize the center wash element so it's not misleadingly doing the job the blobs were supposed to do.

## 3. Verify with the real screenshot tool this time

Per the separate ask to get Playwright working with its own bundled Chromium — use that to actually capture and inspect the home page and 2-3 different game pages with visually distinct cover art, and confirm blobs scattered across the FULL viewport (not just center) are visibly different colors between game pages, not just a center blur tint.

---

## What NOT to touch

Don't touch blob size/shape variety from the last round if that part is confirmed actually working — this is specifically about color reactivity being wrongly localized to the center instead of distributed across individual blobs.

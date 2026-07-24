# orlaz — game detail carousel should show the cover/header image first, not screenshots

Confirmed live on the Watch Dogs 2 game detail page: the image carousel currently opens on an in-game screenshot, with the game's actual cover/header art buried later in the carousel order (or not distinctly first). The cover/header image should always be the first slide shown when a game page loads — screenshots come after it, not before.

---

## 1. Fix carousel image ordering

Find the carousel component on the game detail page (likely in `GameDetail.tsx` or a dedicated carousel component) and whatever builds its image array. The game's stored cover/header image (already a real field in the schema — added via migration `0002_add_header_image.sql` earlier in this project's history) should always be inserted first in the array, with Steam screenshots appended after it, regardless of the order they come back from the Steam API or however the array is currently assembled.

## 2. Check this didn't regress from something else

If the header image used to be first and isn't anymore, check whether a recent change (the background/accent-color work, or anything else touching `GameDetail.tsx` this session) accidentally reordered or dropped it from the front of the array. If it was never first to begin with, just fix the ordering directly.

---

## What NOT to touch

Don't change which images are included (still show all screenshots after the cover), don't touch the carousel's own visuals/controls (arrows, dots, blur treatment) — this is purely about slide order.

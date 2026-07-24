# orlaz — swap a few big blobs for many small ones, and kill the weird moving white streak on tiles/search bar

Two issues confirmed live on the game detail page, now that the background is actually working correctly:

---

## 1. Too few, too large blobs — want many small ones instead

Now that the ambient background is finally rendering correctly (large blobs with clear gaps between them, near-black base), the actual density/scale isn't right — currently a handful of large blobs (the 46-58vmax sizing from the last fix, since roughly halved). Want the opposite balance: many smaller blobs spread across the viewport instead of a few big ones. Rework the blob generation to produce a higher count of smaller blobs (rough guideline: think 15-25+ smaller blobs instead of 5 large ones), keeping the same glossy specular-highlight treatment and near-black base/gaps that were just fixed — don't reintroduce the earlier bug where blobs were so large they ate all the negative space. Smaller blobs should still be large enough to read clearly as glossy spheres (not tiny specks), just more numerous and more scattered.

## 2. Weird white shape constantly moving on top of the search bar and tiles

There's a distracting white/light streak or shape that keeps animating on top of the search bar and glass tiles — moving independently of the background blobs, sitting visually on top of the glass surfaces themselves. This is very likely the `liquid-sheen` class's `::before` pseudo-element (an idle-drifting light streak under the glass, animated via `liquid-idle-drift` in `globals.css`, mentioned in an earlier fix this session about tile corner-clipping) — now that tile clipping is fixed, this sheen animation is fully visible and reads as a distracting, "weird" artifact rather than a subtle glass highlight.

Investigate this specific animation and either: tone it down significantly (much lower opacity, slower/subtler motion, smaller range of motion) so it reads as a barely-there glass highlight instead of an obvious moving white blob, or remove it entirely if it doesn't add anything now that the background itself provides visual interest. Check every place `liquid-sheen` (or equivalent) is applied — search bar, tiles, panels — since the complaint mentions both.

---

## What NOT to touch

Don't change the base near-black background color or the corner-clipping fix from the last round — both are correct now. Don't touch the crack timeline/repack toggle work, unrelated.

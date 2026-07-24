# orlaz — game detail page has real rendering bugs: ghosted duplicate tags, missing Survival, clashing background color

Screenshot confirmed live on the Watch Dogs 2 detail page. Several distinct, real problems visible, not just "needs a redesign":

---

## 1. DRM/protection tags are rendering doubled/ghosted on top of each other

Below the Developer/Publisher/Released row, the tag/pill area shows two overlapping layers of text — solid dark pills ("Action", "Adventure") sit fine, but there's a second, faded/ghosted orange layer of text underneath/behind showing what looks like duplicate DRM tags ("Denuvo Anti-Tamper", "Easy Anti-Cheat", "Steam DRM" appears twice, once as a solid pill and once as ghosted text bleeding through). Fix the actual layering/duplication so DRM only renders once, in one consistent location, not stacked underneath other pills.

## 2. Survival stat still shows a blank dash

Right panel shows "Survival — " with no value, for Watch Dogs 2. Investigate why this specific game has no value when the underlying feature is supposed to be live.

## 3. Background color is actively hurting legibility on this page

The warm orange/brown gradient blob sitting behind the metadata/tag area makes text genuinely hard to read (the tag pill text is low-contrast against it, borderline illegible in the screenshot). This is likely the per-game cover-art color extraction picking an accent color that clashes badly with this specific game's light sky-blue/fog cover image — investigate whether the extraction logic needs a legibility/contrast check (e.g. reject or dampen extracted colors that produce poor contrast against the text/pill colors used on top of them) rather than using the raw extracted color unconditionally.

## 4. General "slow moving artifacts/glitches" on the page

Beyond the specific issues above, there's a general visual noisiness/glitchiness reported — investigate whether this is: (a) the ambient background blob animation compositing oddly with the glass panels (backdrop-filter banding/ghosting), (b) the still-in-progress background revamp work leaving inconsistent/half-applied styles on this page type specifically (game detail may not have been checked as thoroughly as the homepage), or (c) something else. Check this page type specifically as part of whatever background/legibility work is already underway — game detail pages have more overlapping glass panels (hero image carousel, stat panel, crack outlook panel, Did You Know panel) than the simpler homepage, so are a harder test case and should be checked explicitly, not assumed to inherit fixes cleanly from homepage-focused testing.

---

## What NOT to touch

Don't touch the Crack Outlook / Did You Know AI content panels' actual content generation — this is about visual rendering only.

# orlaz — P2P group classification gaps + repacks need distinguishing from real cracks

Real feedback from a dev friend who actually knows the scene/P2P landscape (Discord, quoted directly):

> why's RIDDICK not marked as P2P on orlaz
> ShadowEagle, PLAYMAGiC, 3DM, "P2P", Black_Box, GOG, FCKDRM, ALI213, EMPRESS, RVTFiX and a ton more too — speaking of PLAYMAGiC they're a trainer group not a game rls group
> i'd say first thing to do is hide/distinguish repack rlses on here from the cracks and repacks as cracks are more important than some repack and is confusing

Two distinct, real issues here — not style opinions, factual classification gaps.

---

## 1. P2P group classification is incomplete/manually curated and missing real groups

Per the Groups page, "P2P" groups appear to be a small manually-curated/starred list (currently only 2: DenuvOwO, voices38), justified as "Starred groups are tracked directly since xREL has no way to browse their releases by category." `x.X.RIDDICK.X.x` is a real, well-known P2P group and isn't marked as one — find wherever this starred/P2P list is defined (likely a hardcoded array or D1 table) and add it, plus audit against this friend's list of other real P2P/repack groups that should probably be recognized: **ShadowEagle, 3DM, Black_Box, GOG, FCKDRM, ALI213, EMPRESS, RVTFiX** (and "P2P" itself, apparently a literal group name). Don't blindly add all of these without a quick sanity check — confirm each is a genuine release group (scene, P2P, or repack) before adding, same diligence as everything else this project does.

**Important correction from the friend:** PLAYMAGiC is NOT a release group at all — it's a trainer group (makes game trainers/mods, not cracks/releases). If PLAYMAGiC shows up anywhere in the catalog as if it were a release source, that's a data-quality bug distinct from the P2P-list gap — investigate whether it's polluting release data and, if so, filter it out entirely rather than categorizing it.

## 2. Repacks need to be visually/structurally distinguished from original cracks, not mixed in

The core complaint: repacks (games repackaged by a group after being cracked by someone else, usually to compress size or bundle DLC) are currently presented on the same footing as original cracks, which is confusing and buries what actually matters — who really cracked the game first. Since this project already has real chronological Crack Timeline data (added earlier this session, distinguishing genuine-first releases from later repacks/updaters), that data should now be surfaced visually: add a clear distinguishing tag/badge ("Repack" vs "Crack") on release entries, and consider whether repacks should be visually de-emphasized, collapsed/hidden behind a toggle, or simply just clearly labeled — use judgment on the best UI treatment, but the underlying signal (is this release the true original crack, or a later repack) should already exist from the Crack Timeline work and just needs a proper visual treatment applied consistently everywhere release lists appear (game detail page, group pages, home/digest).

---

## What NOT to touch

Don't remove repack data entirely — the ask is to distinguish/de-emphasize, not delete; repacks are still useful information, just shouldn't be confused with or as prominent as the real crack.

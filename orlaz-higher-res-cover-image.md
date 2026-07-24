# orlaz — swap the stored cover image source from Steam's low-res header_image to a real high-res CDN variant

Root cause of the blurry cover confirmed: the stored cover (460x215) comes from Steam's `appdetails` API `header_image` field, which is Steam's old, fixed-size legacy store asset — genuinely capped at that resolution by Steam itself, not something orlaz is downscaling. Now that the carousel shows this image first (per the just-shipped cover-first fix), its low resolution is much more visible/noticeable than when it was buried in the carousel.

Steam has higher-resolution image variants available directly from its CDN (`cdn.cloudflare.steamstatic.com` / `shared.steamstatic.com`), independent of the legacy `header_image` field, commonly used by SteamDB and third-party launchers instead of the old header image:

- `library_hero` — wide background art, high resolution
- `library_600x900_2x` — high-res vertical portrait/capsule
- `library_capsule_2x` — newer, sharper capsule variant (Steam recently doubled several of its standard asset sizes and is phasing out the old smaller specs)

---

## 1. Investigate which of these are reliably available per game

Check which of these CDN image variants are actually reachable/valid for a sample of games already in the catalog (they follow a predictable URL pattern based on appid, e.g. `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/library_hero.jpg` — confirm the exact real path format and handle cases where a given variant 404s for a specific game, since not everything may have every asset size, especially older titles).

## 2. Swap the stored/used cover source to the highest-quality reliably-available variant

Prefer `library_hero` (widescreen, matches the carousel's aspect ratio best) if consistently available; fall back to `library_600x900_2x` or the existing `header_image` if not, rather than breaking entirely for games missing the preferred asset. Update wherever the cover image URL is currently sourced/stored (likely in the Steam enrichment pipeline, `worker/backfill/appdetails.ts` or `steam.ts`) so this applies both to newly-enriched games and, ideally, backfills existing catalog entries too.

## 3. Confirm it actually looks sharp in the carousel

Verify the swapped image renders noticeably sharper in the actual carousel on a few real game pages, not just that the URL resolves.

---

## What NOT to touch

Don't change the carousel's cover-first ordering logic just shipped — this is only about the quality of the image being shown first, not its position.

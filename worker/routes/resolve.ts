import type { Handler } from "../shared/types";
import { json, enc } from "../shared/http";

interface StoreSearchItem {
  type: string;
  name: string;
  id: number;
}
interface StoreSearchResponse {
  items?: StoreSearchItem[];
}

/* FIX (confirmed live against Steam's storesearch): Steam returns titles like
   "Watch_Dogs™" and "Watch_Dogs® 2" with a literal underscore where the
   real title has a space. The previous norm() stripped ™®© but never
   touched underscores, so norm("Watch_Dogs™") -> "watch_dogs" never matched
   norm("Watch Dogs") -> "watch dogs", and /resolve?title=Watch+Dogs always
   returned appid:null. Verified fix: both now normalize to "watch dogs" /
   "watch dogs 2" and match appid 243470 / 447040.

   SECOND FIX (confirmed live): Steam lists EA's sports titles with a brand
   prefix Steam itself adds -- "EA SPORTS™ Madden NFL 26" (appid 3230400) --
   but xREL's own ext_info.title for the same release is just "Madden NFL
   26", no prefix. Exact-match-after-normalization then never matched, so
   /resolve?title=Madden+NFL+26 always returned appid:null even though the
   Steam listing genuinely exists. Stripping a leading "EA SPORTS " is safe
   on both sides: for titles where xREL *does* include the brand (confirmed
   live for "EA Sports FC 26", which matches Steam's "EA SPORTS FC™ 26"
   verbatim) stripping it from both leaves the same shorter string equal on
   both sides, so it doesn't break that case either.

   THIRD FIX (confirmed live): Steam's real listing for Assassin's Creed
   Shadows is "Assassin’s Creed Shadows" -- a Unicode right single
   quotation mark (U+2019), not the ASCII apostrophe (U+0027) xREL's own
   ext_info.title uses. The old character class here only stripped the
   ASCII one, so the Steam side kept its curly quote through
   normalization while the xREL side lost its straight one entirely --
   "assassin's creed shadows" vs "assassin's creed shadows" never matched,
   /resolve returned appid:null despite the correct item genuinely being
   in Steam's results, and this silently starved worker/backfill/
   deepRun.ts's resolve step for this exact seed title (found the release
   group via xREL search, failed to resolve every retry, gave up for
   good -- see that file's own comment on why a failed resolve isn't
   retried past the seed pass completing). Any other title with a
   possessive apostrophe where Steam uses proper typography would hit the
   identical failure; the curly apostrophe is common enough on Steam's
   side that this is worth a real character-class fix, not a one-off
   special case for this title. */
function norm(s?: string | null): string {
  return (s || "")
    .replace(/[™®©]/g, "")
    .replace(/_/g, " ")
    .replace(/^ea sports\s+/i, "")
    .replace(
      /\b(game of the year|goty|definitive|deluxe|ultimate|enhanced|complete|remastered|remake|director'?s cut|gold|standard|digital)\s*(edition)?\b/gi,
      "",
    )
    .replace(/[:\-–—'’‘".!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const handleResolve: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const title = url.searchParams.get("title");
  if (!title) return json({ error: "pass ?title=" }, 60, 400);
  try {
    // FIX (QA sweep): this used to skip caching entirely -- cf.cacheEverything
    // would have let a bad/empty Steam response get stuck cached at the edge
    // for a full hour, so the safe fix at the time was no caching at all.
    // cacheTtlByStatus gets the caching benefit back for a real 2xx (this
    // route is hit constantly during backfill/enrichment) while still never
    // caching an error status, so a bad response still just retries later
    // instead of getting stuck.
    const r = await fetch("https://store.steampowered.com/api/storesearch/?term=" + enc(title) + "&l=english&cc=us", {
      cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
    } as RequestInit);
    if (!r.ok) return json({ query: title, appid: null }, 30);
    const data = (await r.json()) as StoreSearchResponse;
    const items = data.items || [];
    // Exact match only (after normalization), no "first result" fallback -- a
    // wrong match is worse than no thumbnail.
    const target = norm(title);
    const app = items.find((x) => x.type === "app" && norm(x.name) === target) || null;
    return json(
      { query: title, appid: app ? app.id : null, matchedName: app ? app.name : null },
      app ? 3600 : 30,
    );
  } catch {
    return json({ query: title, appid: null }, 30);
  }
};

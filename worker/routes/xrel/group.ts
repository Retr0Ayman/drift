import type { Handler } from "../../shared/types";
import { json, enc } from "../../shared/http";
import { normalizeP2P, type RawXrelRelease } from "../../shared/xrel";

interface SearchReleasesResponse {
  results?: RawXrelRelease[];
  p2p_results?: RawXrelRelease[];
}

const MAX_PAGES = 20;

/* Root cause of "DenuvOwO/voices38 missing from Groups entirely": xREL has no
   way to browse P2P releases by category or by group -- confirmed live: p2p=1
   and group_name= are silently ignored on both release/browse_category.json
   and release/latest.json, and neither p2p/latest.json nor
   p2p/browse_category.json exist (404). The only endpoint that ever returns
   p2p_results is search/releases.json?q=<term>, which searches by term, not by
   group. This works around that by searching for the group's own name (P2P
   dirnames end in "-<GroupName>", e.g. "Deathloop-DenuvOwO") and then hard-
   filtering the response to an exact, case-insensitive group-name match so an
   unrelated title that happens to contain the same text can't leak in.
   Verified live: ?name=DenuvOwO returns Borderlands 4, Monster Hunter Wilds,
   Deathloop, Black Myth: Wukong, Mafia: The Old Country, etc.; ?name=voices38
   returns Atomic Heart, Hogwarts Legacy, Dead Space (2023), etc.

   Pagination is defensive, not confirmed working: repeated isolated live
   tests (page=1 vs page=2, per_page=10/100/500, start=, offset=, sort=) all
   returned byte-identical responses -- search/releases.json does not
   currently honor any pagination parameter tried, has no pagination object
   in its response to detect this from, and xREL's own docs are bot-blocked
   (403) to check for an undocumented one. So rather than trust that and loop
   MAX_PAGES times regardless, this keeps requesting further pages only as
   long as each one actually contains a release id not already seen, and
   stops the instant a page adds nothing new -- 2 requests in practice today
   (page 2 repeats page 1), but starts paginating for real with zero code
   changes if xREL's behavior ever changes. Counts from this route reflect
   the real ceiling of what's currently retrievable, not the group's true
   full historical output, which may be higher than what xREL's search will
   currently hand back through this endpoint. */
export const handleXrelGroup: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) return json({ error: "pass ?name=<group>" }, 60, 400);
  const target = name.toLowerCase();

  // Confirmed live: xREL's search intermittently returns a non-OK response
  // under load -- this route gets hit far more often now that the catalog
  // proactively seeds starred groups on every page load, not just when
  // someone opens a group profile. One retry after a brief pause recovers
  // most of these without meaningfully slowing down the common case (only
  // the failing page pays the extra round trip).
  async function fetchPage(page: number): Promise<Response> {
    const api =
      "https://api.xrel.to/v2/search/releases.json?q=" + enc(name) + "&scene=1&p2p=1&per_page=100&page=" + page;
    const opts = { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit;
    const first = await fetch(api, opts);
    if (first.ok) return first;
    await new Promise((res) => setTimeout(res, 400));
    return fetch(api, opts);
  }

  const seen = new Map<string, RawXrelRelease>();
  let upstreamFailed = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await fetchPage(page);
    if (!r.ok) {
      // Page 1 failing must not be conflated with "this group genuinely has
      // 0 releases" -- see the cache-TTL note below.
      upstreamFailed = page === 1;
      break;
    }
    const data = (await r.json()) as SearchReleasesResponse;
    const pageItems = [...(data.results || []), ...(data.p2p_results || []).map(normalizeP2P)].filter(
      (rel) => (rel.group_name || "").toLowerCase() === target,
    );
    if (!pageItems.length) break;

    let addedNew = false;
    for (const rel of pageItems) {
      if (!seen.has(rel.id)) {
        seen.set(rel.id, rel);
        addedNew = true;
      }
    }
    if (!addedNew) break;
  }

  // FIX (confirmed live): this used to cache every response for 900s
  // regardless of outcome, including a transient upstream failure that
  // produces an empty list -- one xREL rate-limit hit would then get
  // remembered as "this group has 0 releases" for the next 15 minutes,
  // for every caller (both the group profile page and the catalog's
  // background seed-merge), long after xREL itself had recovered. An empty
  // result from a real upstream failure now gets a 20s TTL so the next
  // request retries for real instead of replaying the same failure. A
  // genuinely empty result (upstream responded fine, just found nothing)
  // still caches normally -- that's real data, not a symptom of failure.
  const maxage = upstreamFailed ? 20 : 900;
  return json({ list: [...seen.values()] }, maxage);
};

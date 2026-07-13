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

  const seen = new Map<string, RawXrelRelease>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const api =
      "https://api.xrel.to/v2/search/releases.json?q=" +
      enc(name) +
      "&scene=1&p2p=1&per_page=100&page=" +
      page;
    const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
    if (!r.ok) break;
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

  return json({ list: [...seen.values()] }, 900);
};

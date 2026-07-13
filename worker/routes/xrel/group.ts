import type { Handler } from "../../shared/types";
import { json, enc } from "../../shared/http";
import { normalizeP2P, type RawXrelRelease } from "../../shared/xrel";

interface SearchReleasesResponse {
  results?: RawXrelRelease[];
  p2p_results?: RawXrelRelease[];
}

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
   returns Atomic Heart, Hogwarts Legacy, Dead Space (2023), etc. */
export const handleXrelGroup: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  if (!name) return json({ error: "pass ?name=<group>" }, 60, 400);

  const api =
    "https://api.xrel.to/v2/search/releases.json?q=" + enc(name) + "&scene=1&p2p=1&per_page=100";
  const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
  if (!r.ok) return json({ list: [] }, 60, r.status);
  const data = (await r.json()) as SearchReleasesResponse;
  const target = name.toLowerCase();
  const list = [...(data.results || []), ...(data.p2p_results || []).map(normalizeP2P)].filter(
    (rel) => (rel.group_name || "").toLowerCase() === target,
  );
  return json({ list }, 900);
};

import type { Handler } from "../../shared/types";
import { json, relay, enc } from "../../shared/http";
import { normalizeP2P, type RawXrelRelease } from "../../shared/xrel";

interface SearchReleasesResponse {
  total?: number;
  results?: RawXrelRelease[];
  p2p_results?: RawXrelRelease[];
}

export const handleXrelSearch: Handler = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("latest")) {
    const api =
      "https://api.xrel.to/v2/release/latest.json?per_page=" +
      enc(url.searchParams.get("per_page") || "100");
    const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
    return relay(r);
  }

  const api =
    "https://api.xrel.to/v2/search/releases.json?q=" + enc(url.searchParams.get("q")) + "&scene=1&p2p=1";
  const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
  if (!r.ok) return json({ total: 0, list: [] }, 60, r.status);
  const data = (await r.json()) as SearchReleasesResponse;
  // FIX: this route already asked for p2p=1, but xREL splits the response into
  // `results` (scene) vs `p2p_results` (P2P groups, e.g. DenuvOwO/voices38) and
  // the old client only ever read `results` -- P2P search hits were silently
  // dropped. Merge both into one normalized `list`, same shape browse/archive
  // already return, so every consumer handles one shape.
  const list = [...(data.results || []), ...(data.p2p_results || []).map(normalizeP2P)];
  return json({ total: data.total ?? list.length, list }, 900);
};

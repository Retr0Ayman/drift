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
   "watch dogs 2" and match appid 243470 / 447040. */
function norm(s?: string | null): string {
  return (s || "")
    .replace(/[™®©]/g, "")
    .replace(/_/g, " ")
    .replace(
      /\b(game of the year|goty|definitive|deluxe|ultimate|enhanced|complete|remastered|remake|director'?s cut|gold|standard|digital)\s*(edition)?\b/gi,
      "",
    )
    .replace(/[:\-–—'".!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const handleResolve: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const title = url.searchParams.get("title");
  if (!title) return json({ error: "pass ?title=" }, 60, 400);
  try {
    // No cf.cacheEverything on purpose: a bad/empty Steam response must not get
    // stuck cached at the edge for a full hour. Successful resolutions are
    // memoized client-side; a failure just gets a short TTL and retries later.
    const r = await fetch(
      "https://store.steampowered.com/api/storesearch/?term=" + enc(title) + "&l=english&cc=us",
    );
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

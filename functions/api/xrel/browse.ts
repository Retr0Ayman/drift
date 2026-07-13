import type { Env } from "../../_shared/env";
import { relay, enc } from "../../_shared/http";

/* release/browse_category.json?category_name=WINDOWS is xREL's actual Windows-
   games category (confirmed live against release/categories.json + the endpoint
   itself: every page comes back ~100% real Windows game releases with working
   pagination.total_pages). This is the client's primary catalog-crawl feed. Note
   this endpoint has NO p2p support at all -- confirmed live, p2p=1/group_name=
   params are silently ignored -- so P2P groups never appear here; see
   xrel/group.ts for how those get pulled in instead. */
export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const api =
    "https://api.xrel.to/v2/release/browse_category.json?category_name=WINDOWS&page=" +
    enc(url.searchParams.get("page") || "1") +
    "&per_page=" +
    enc(url.searchParams.get("per_page") || "100");
  const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
  return relay(r);
};

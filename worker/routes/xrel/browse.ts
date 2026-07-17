import type { Handler } from "../../shared/types";
import { relay, enc } from "../../shared/http";

/* release/browse_category.json?category_name=WINDOWS is xREL's actual Windows-
   games category (confirmed live against release/categories.json + the endpoint
   itself: every page comes back ~100% real Windows game releases with working
   pagination.total_pages). This is the client's primary catalog-crawl feed. Note
   this endpoint has NO p2p support at all -- confirmed live, p2p=1/group_name=
   params are silently ignored -- so P2P groups never appear here; see
   xrel/group.ts for how those get pulled in instead. */
export const handleXrelBrowse: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const api =
    "https://api.xrel.to/v2/release/browse_category.json?category_name=WINDOWS&page=" +
    enc(url.searchParams.get("page") || "1") +
    "&per_page=" +
    enc(url.searchParams.get("per_page") || "100");
  // FIX (confirmed live, QA sweep): cacheEverything caches ANY status code
  // for the full cacheTtl, including a transient 429/5xx from xREL -- this
  // is exactly what starved feed.ts down to 0 items and could equally have
  // stalled the steady-state sync on this same page/per_page combination
  // for up to 15 minutes after xREL itself recovered. cacheTtlByStatus
  // caches a real 2xx response same as before but never caches an error
  // status, so a transient failure retries on the very next request
  // instead of getting stuck.
  const r = await fetch(api, { cf: { cacheTtlByStatus: { "200-299": 900, "300-599": 0 } } } as RequestInit);
  return relay(r);
};

import type { Handler } from "../../shared/types";
import { json, relay, enc } from "../../shared/http";

/* Deep-history crawl by calendar month, for catalog depth browse_category can't
   reach (its total_count caps around ~5000 most-recent releases). archive does
   NOT combine with category_name (confirmed live) so this is all-categories per
   month; the client applies its own ext_info.type==='master_game' filter, same
   as everywhere else. */
export const handleXrelArchive: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!/^\d{4}-\d{2}$/.test(month || "")) return json({ error: "pass ?month=YYYY-MM" }, 60, 400);
  const api =
    "https://api.xrel.to/v2/release/latest.json?archive=" +
    enc(month) +
    "&page=" +
    enc(url.searchParams.get("page") || "1") +
    "&per_page=" +
    enc(url.searchParams.get("per_page") || "100");
  // Same fix as browse.ts: cacheTtlByStatus never caches an error status,
  // so a transient xREL failure retries next request instead of getting
  // stuck for the full TTL.
  const r = await fetch(api, { cf: { cacheTtlByStatus: { "200-299": 900, "300-599": 0 } } } as RequestInit);
  return relay(r);
};

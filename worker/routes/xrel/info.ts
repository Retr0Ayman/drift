import type { Handler } from "../../shared/types";
import { relay, enc } from "../../shared/http";

export const handleXrelInfo: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const api = "https://api.xrel.to/v2/release/info.json?dirname=" + enc(url.searchParams.get("dirname"));
  // Same fix as browse.ts/archive.ts/etc: cacheTtlByStatus never caches an
  // error status, so a transient xREL failure retries next request instead
  // of getting stuck for the full TTL (see browse.ts's own comment).
  const r = await fetch(api, { cf: { cacheTtlByStatus: { "200-299": 900, "300-599": 0 } } } as RequestInit);
  return relay(r);
};

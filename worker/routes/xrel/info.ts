import type { Handler } from "../../shared/types";
import { relay, enc } from "../../shared/http";

export const handleXrelInfo: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const api = "https://api.xrel.to/v2/release/info.json?dirname=" + enc(url.searchParams.get("dirname"));
  const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
  return relay(r);
};

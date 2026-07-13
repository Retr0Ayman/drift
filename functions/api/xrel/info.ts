import type { Env } from "../../_shared/env";
import { relay, enc } from "../../_shared/http";

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const url = new URL(request.url);
  const api = "https://api.xrel.to/v2/release/info.json?dirname=" + enc(url.searchParams.get("dirname"));
  const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
  return relay(r);
};

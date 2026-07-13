import type { Env } from "../../_shared/env";
import { json, relay, enc } from "../../_shared/http";
import { getXrelToken } from "../../_shared/xrelToken";

/* Real path is /nfo/release.json (needs the "viewnfo" OAuth scope). Without
   XREL_CLIENT_ID/XREL_CLIENT_SECRET set (Pages dashboard env vars -- see
   DEPLOY.md) this 501s and the client falls back to the generated ASCII .nfo,
   which is the permanent NFO experience either way, not a placeholder. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = await getXrelToken(env);
  if (!token) {
    return json(
      { error: "NFO auth not configured (optional). Client falls back to the generated ASCII .nfo." },
      60,
      501,
    );
  }
  const api = "https://api.xrel.to/v2/nfo/release.json?id=" + enc(url.searchParams.get("id"));
  const r = await fetch(api, { headers: { Authorization: "Bearer " + token } });
  return relay(r);
};

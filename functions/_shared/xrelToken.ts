import type { Env } from "./env";

/* xREL OAuth (Client Credentials Grant) -- optional, NFO-image endpoint only.
   Every other xREL route is unauthenticated. Access tokens expire after 1hr
   (xREL docs), so this mints + caches its own, refreshing whenever missing or
   expired. Module-scope vars persist for the lifetime of a warm isolate -- a
   cold start just mints a fresh one. Without XREL_CLIENT_ID/SECRET this returns
   null and callers 501 with a message pointing at the ASCII .nfo fallback. */
let cachedToken: string | null = null;
let cachedExpiry = 0;

export async function getXrelToken(env: Env): Promise<string | null> {
  if (!env.XREL_CLIENT_ID || !env.XREL_CLIENT_SECRET) return null;
  const now = Date.now();
  if (cachedToken && now < cachedExpiry) return cachedToken;
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.XREL_CLIENT_ID,
      client_secret: env.XREL_CLIENT_SECRET,
      scope: "viewnfo",
    });
    const r = await fetch("https://api.xrel.to/v2/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!r.ok) return null;
    const tok = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!tok.access_token) return null;
    cachedToken = tok.access_token;
    cachedExpiry = now + Math.max(0, (tok.expires_in ?? 3600) - 60) * 1000;
    return cachedToken;
  } catch {
    return null;
  }
}

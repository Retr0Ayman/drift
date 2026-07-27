import type { Env } from "./env";

/* Shared gate for every /api/admin/* route -- confirmed via this session's
   security review that /api/admin/seed-title (unlike its read+recompute-
   only sibling refresh-game) performs genuine INSERTs of new rows from
   fully arbitrary, unauthenticated input, a real step beyond the "public
   reads + idempotent recompute, no destructive action" bar every other
   route in this app (including refresh-game) already sits comfortably
   under. Opt-in, not required: ADMIN_TOKEN unset (the default, same as
   GROQ_API_KEY/DISCORD_WEBHOOK_URL) means this returns true unconditionally
   -- every /api/admin/* route keeps working exactly as it does today for a
   solo dev curling it directly, with no secret to configure before this
   deploys. Setting ADMIN_TOKEN in the Cloudflare dashboard is the real
   hardening lever, checked via a constant-time compare against either an
   `X-Admin-Token` header or a `?token=` query param (the latter only for
   convenience -- a header is preferred since a query param can end up in
   logs/history, but this endpoint is only ever hit manually, not from a
   browser address bar people bookmark). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAdminAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_TOKEN) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("X-Admin-Token") || url.searchParams.get("token") || "";
  return provided.length > 0 && timingSafeEqual(provided, env.ADMIN_TOKEN);
}

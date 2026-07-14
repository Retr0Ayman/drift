import type { Handler } from "../shared/types";
import { json, enc } from "../shared/http";

type WishlistData = Record<string, { name?: string }>;

/* Relays Steam's own public, unauthenticated wishlist endpoint -- same "just
   relay, don't fabricate" pattern as appdetails.ts. Steam returns an empty/
   non-JSON body for a private or nonexistent profile rather than a clean
   error, so that case is detected here and surfaced honestly instead of
   silently returning zero results. */
export const handleWishlist: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const steamid = url.searchParams.get("steamid");
  const vanity = url.searchParams.get("vanity");
  if (!steamid && !vanity) {
    return json({ error: "pass ?steamid=<SteamID64> or ?vanity=<custom profile name>" }, 60, 400);
  }

  const path = steamid ? `profiles/${enc(steamid)}` : `id/${enc(vanity)}`;
  const r = await fetch(`https://store.steampowered.com/wishlist/${path}/wishlistdata/`, {
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit);

  if (!r.ok) return json({ error: "Could not reach Steam", appids: [] }, 30, 502);

  let data: unknown;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  if (!data || Array.isArray(data) || typeof data !== "object") {
    return json({ error: "This wishlist is private, empty, or the profile couldn't be found.", appids: [] }, 30, 404);
  }

  const appids = Object.keys(data as WishlistData)
    .map(Number)
    .filter((n) => !isNaN(n));
  return json({ appids, count: appids.length }, 300);
};

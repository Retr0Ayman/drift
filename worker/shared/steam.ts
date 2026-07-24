interface SteamCmdInfo {
  data?: Record<
    string,
    { depots?: { branches?: { public?: { buildid?: string | number; timebuildupdated?: string | number } } } }
  >;
}

export interface BuildInfo {
  buildId: number | null;
  /* Steam's own real, authoritative unix-seconds timestamp of when the
     current public-branch build was actually published (steamcmd.net's
     `timebuildupdated` field, confirmed live present on every appid
     checked) -- NOT something this app derives from its own observation
     history. This is what makes a real "how long has this crack stayed
     current" survival stat possible without needing to wait for our own
     tracking to accumulate history: Steam already recorded the real
     moment, we just weren't reading it before. See GameDetail's Survival
     field / src/lib/format.ts's survivalHrs(). */
  buildUpdatedAt: number | null;
}

export async function fetchBuildInfo(appid: string): Promise<BuildInfo> {
  try {
    // FIX (confirmed live, QA sweep): cacheEverything caches ANY status
    // code for the full cacheTtl -- a transient steamcmd.net failure could
    // get replayed as "no build id" for a full hour. cacheTtlByStatus
    // caches a real 2xx the same as before but never caches an error.
    const r = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, {
      cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
    } as RequestInit);
    const jn = (await r.json()) as SteamCmdInfo;
    const pub = jn.data?.[appid]?.depots?.branches?.public;
    const b = pub?.buildid;
    const t = pub?.timebuildupdated;
    return { buildId: b ? Number(b) : null, buildUpdatedAt: t ? Number(t) : null };
  } catch {
    return { buildId: null, buildUpdatedAt: null };
  }
}

// Thin back-compat wrapper -- badge.ts/build.ts only ever needed the bare
// number, not the timestamp; keeps their call sites unchanged.
export async function buildId(appid: string): Promise<number | null> {
  return (await fetchBuildInfo(appid)).buildId;
}

// Flat, guessable CDN paths -- checked in preference order, widescreen
// first since it best matches the game-detail carousel's own aspect
// ratio. Confirmed live these are real, unofficial Steam library-asset
// conventions (used by SteamDB/third-party launchers), NOT part of the
// appdetails API response -- there is no official field for them, so
// availability has to be checked with a real request per game, not
// assumed. Deliberately does NOT include a guessed header.jpg fallback --
// this exact codebase already confirmed live (GameDetail.tsx's carousel
// comment, and reconfirmed here for EA Sports College Football 27,
// appid 4032350: every one of these paths 404s, including the legacy
// header.jpg guess) that Steam moves many titles' images to a per-app
// HASHED path under shared.akamai.steamstatic.com that no flat guess can
// reconstruct -- coverImg()'s own client-side fallback comment documents
// the exact same lesson. The real appdetails `header_image` field is the
// only header/cover URL ever reliably present for every game; callers
// must fall back to that (never a further guessed path) when both of
// these miss.
const HIGH_RES_VARIANTS = ["library_hero.jpg", "library_600x900_2x.jpg"];

/* Resolves the highest-quality reliably-available cover/header image for
   a game, preferring a high-res CDN library asset over Steam's own
   fixed-460x215 legacy header_image (appdetails.ts's `header` field) --
   confirmed live via HEAD request per candidate, not assumed from the
   URL pattern alone (see HIGH_RES_VARIANTS' own comment for why a guess
   alone isn't trustworthy). Falls back to the real header_image
   (fallbackHeader, always Steam's own genuine URL for this exact game,
   never itself a guess) the instant every high-res candidate 404s or a
   request fails -- this must never return null/undefined when a real
   header_image was available, only ever upgrade it when a real
   higher-quality asset is confirmed to exist. */
export async function resolveHighResHeader(appid: number, fallbackHeader: string | null): Promise<string | null> {
  for (const variant of HIGH_RES_VARIANTS) {
    const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/${variant}`;
    try {
      // HEAD, not GET -- this only needs the status code, and running
      // this per candidate per game during enrichment (not per pageview)
      // shouldn't also pay for downloading image bytes it might throw
      // away on a miss.
      const r = await fetch(url, { method: "HEAD", cf: { cacheTtlByStatus: { "200-299": 86400, "300-599": 60 } } } as RequestInit);
      if (r.ok) return url;
    } catch {
      // network blip on this one candidate -- try the next, same
      // "one failure doesn't take down the whole enrichment" discipline
      // every other backfill tick in this codebase already follows
    }
  }
  return fallbackHeader;
}

export function parseYear(s?: string | null): number | null {
  const m = s && s.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

/* Steam's requirements HTML is a <li>-per-line list (e.g. "OS *: Windows 10");
   turn it into plain-text lines the client can esc() safely, no HTML relayed. */
export function reqLines(html?: string | null): string[] {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
}

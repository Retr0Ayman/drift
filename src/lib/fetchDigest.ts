import type { DigestFacts } from "./digest";

// v2: bumped -- buildDigestFacts (lib/digest.ts) picked up a new
// drmRemovedTitles fact (real PCGamingWiki Removed_DRM data from this
// session's per-build DRM history work); a v1 cache entry generated before
// that fact existed would never mention it even after it becomes the most
// interesting available angle, with no way to notice.
const CACHE_KEY = "drift.digest.v2.";

export interface DigestResult {
  digest: string | null;
  error: string | null;
}

/* Cache key includes the actual totals, not just the calendar day -- FIX
   (confirmed live): a pure per-day cache read as visibly wrong the same
   day it was generated, because the backfills can add hundreds of games
   within a few hours (the archive crawl alone went from ~933 to 960+ in
   under an hour once its own stuck-forever bug was fixed) -- the AI text
   said "200 games, 515 releases" while the stat tiles right below it,
   reading live data, already said 960/1827. Keying on the real numbers
   means any actual change busts the cache automatically, which is the
   thing that should decide staleness here, not a fixed time window. */
export async function fetchDigest(facts: DigestFacts): Promise<DigestResult> {
  const day = new Date().toISOString().slice(0, 10);
  const cacheKey = `${CACHE_KEY}${day}.${facts.totalGames}.${facts.totalReleases}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { digest: cached, error: null };

  try {
    const r = await fetch("/api/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts }),
    });
    const data = (await r.json()) as { digest?: string; error?: string };
    if (!r.ok || !data.digest) {
      return { digest: null, error: data.error || `Digest generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.digest);
    } catch {
      // storage full/unavailable -- still return the freshly generated digest
    }
    return { digest: data.digest, error: null };
  } catch {
    return { digest: null, error: "Could not reach the digest service" };
  }
}

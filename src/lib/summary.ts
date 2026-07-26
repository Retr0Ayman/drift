// v4: bumped -- worker/routes/summary.ts's group prompt picked up a real
// grounding backstop (GROUP_LORE_LEAK) plus richer real facts (reliability
// signals, first/most-recent activity dates, real hv/trad counts) after v3
// entries were already cached. A pre-fix cached group summary had no
// backstop behind it at all -- if one ever slipped in an invented founding/
// identity/drama claim, this bump is what actually gets it regenerated for
// returning visitors instead of serving it forever. Publisher entries also
// regenerate as a side effect of the shared prefix (harmless, that prompt
// itself didn't change).
// v5: bumped again -- the publisher prompt now takes a real Franchises
// fact (PublisherProfile.tsx already computed this for its own franchise-
// block rendering, just never passed it to the AI). factsSignature only
// hashes NUMERIC facts, so this new string-array fact alone would never
// bust an existing v4 cache entry on its own -- a publisher summary
// generated before this fix would never mention its own tracked
// franchises, indefinitely, with no way to notice. Group entries also
// regenerate as a side effect of the shared prefix (harmless, that prompt
// itself didn't change here).
const CACHE_PREFIX = "drift.summary.v5.";

export interface SummaryResult {
  summary: string | null;
  error: string | null;
}

export type SummaryFacts = Record<string, string | number | string[] | undefined>;

/* FIX (confirmed live): a permanent per-key cache read as visibly wrong --
   DenuvOwO's AI summary said "25 tracked releases" while the page's own
   stat card, reading live data, said 168. The backfill/archive work can
   grow a group's or publisher's real count substantially after the first
   summary was ever generated, and this cache had no way to notice. Folding
   every numeric fact (release/title counts, the only figures that actually
   signal "enough has changed to regenerate") into the cache key means a
   real change busts it automatically -- same fix already applied to the
   Digest page's own cache for the identical reason. */
function factsSignature(facts: SummaryFacts): string {
  return Object.values(facts)
    .filter((v): v is number => typeof v === "number")
    .join(".");
}

/* Cached per group/publisher key (+ that numeric signature) in localStorage
   -- generated once per real state, not regenerated every page view, but
   not frozen forever either. Same honesty rule as FAQ generation: a
   missing key or failed call surfaces as a real error, never masked. */
export async function fetchSummary(
  kind: "group" | "publisher",
  key: string,
  name: string,
  facts: SummaryFacts,
): Promise<SummaryResult> {
  const cacheKey = CACHE_PREFIX + kind + "." + key + "." + factsSignature(facts);
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { summary: cached, error: null };

  try {
    const r = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name, facts }),
    });
    const data = (await r.json()) as { summary?: string; error?: string };
    if (!r.ok || !data.summary) {
      return { summary: null, error: data.error || `Summary generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.summary);
    } catch {
      // storage full/unavailable -- still return the freshly generated summary
    }
    return { summary: data.summary, error: null };
  } catch {
    return { summary: null, error: "Could not reach the summary service" };
  }
}

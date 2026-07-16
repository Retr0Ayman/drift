// v3: bumped again -- v2's "ready" gate had its own bug (useGroupReleases
// defaulted `loading` to false, so `ready={!loading}` was briefly true
// before the fetch had even started; see useGroupReleases.ts), plus the
// underlying group data itself just got deepened (real full history via
// group_id pagination instead of the ~30-item capped search). Old v1/v2
// entries are dead keys now, not actively cleaned up, but never read again.
const CACHE_PREFIX = "drift.summary.v3.";

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

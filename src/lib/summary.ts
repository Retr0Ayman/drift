// v2: bumped to invalidate summaries generated before the ready-gating fix
// (AiSummary used to fire on route-param-derived keys alone, so a group's
// summary was frequently generated from a still-loading, artificially low
// release count -- confirmed live on DenuvOwO). Old v1 entries are just
// dead keys now, not actively cleaned up, but never read again.
const CACHE_PREFIX = "drift.summary.v2.";

export interface SummaryResult {
  summary: string | null;
  error: string | null;
}

export type SummaryFacts = Record<string, string | number | string[] | undefined>;

/* Cached per group/publisher key in localStorage -- generated once, not
   regenerated every page view. Same honesty rule as FAQ generation: a
   missing key or failed call surfaces as a real error, never masked. */
export async function fetchSummary(
  kind: "group" | "publisher",
  key: string,
  name: string,
  facts: SummaryFacts,
): Promise<SummaryResult> {
  const cacheKey = CACHE_PREFIX + kind + "." + key;
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

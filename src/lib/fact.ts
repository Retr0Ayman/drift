// v3: bumped -- worker/routes/fact.ts now pulls real, live achievement
// count/feature tags/review volume+label per game (previously reviewPct
// was only ever real for the hand-authored SEED_GAMES set; achievements
// and feature tags weren't used at all), which measurably changes what a
// generated fact can say. A v2 entry was generated against the old, more
// data-starved prompt and would otherwise keep showing a flatter fact
// forever with no way to pick up the improvement.
const CACHE_PREFIX = "drift.fact.v3.";

export interface FactResult {
  fact: string | null;
  error: string | null;
}

export interface FactInput {
  title: string;
  developer?: string;
  genres?: string[];
  released?: string;
  franchise?: string | null;
  reviewPct?: number;
  metacritic?: number;
  dlcCount?: number;
  /* Real appid -- lets worker/routes/fact.ts fetch its own live Steam
     achievement count/feature tags/review summary server-side. Omitted for
     synthetic/seed games with no real Steam listing to fetch. */
  appid?: number;
}

// Cached per game id in localStorage -- generated once, not regenerated
// every page view. Same honesty rule as FAQ/summary: a missing key or
// failed call surfaces as a real error, never masked.
export async function fetchFact(gameId: string, input: FactInput): Promise<FactResult> {
  const cacheKey = CACHE_PREFIX + gameId;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { fact: cached, error: null };

  try {
    const r = await fetch("/api/fact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await r.json()) as { fact?: string; error?: string };
    if (!r.ok || !data.fact) {
      return { fact: null, error: data.error || `Fact generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.fact);
    } catch {
      // storage full/unavailable -- still return the freshly generated fact
    }
    return { fact: data.fact, error: null };
  } catch {
    return { fact: null, error: "Could not reach the fact service" };
  }
}

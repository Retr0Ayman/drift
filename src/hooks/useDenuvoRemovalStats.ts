import { useEffect, useState } from "react";

export interface DenuvoRemovalStat {
  publisher_name: string;
  sample_count: number;
  /* null below worker/backfill/denuvoRemoval.ts's MIN_SAMPLE (2 confirmed
     removals) -- an honest "not enough data yet" the UI must render as
     such, never as a guessed number. sample_count is still real and always
     present, even when median_days is null. */
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  computed_at: number;
}

// Matches /api/group-reliability's own reasoning -- this is only as fresh
// as the last hourly recompute tick, so polling faster couldn't observe
// anything new; this just keeps a long-open tab from sitting on a stale
// fetch forever.
const REVALIDATE_MS = 10 * 60 * 1000;

/* Single small fetch, keyed by publisher_key (slugify(publisher), same key
   lib/companies.ts's publishersIndex already uses everywhere else) -- same
   shape/pattern as useGroupReliability.ts. */
export function useDenuvoRemovalStats(): { data: Record<string, DenuvoRemovalStat>; loading: boolean } {
  const [data, setData] = useState<Record<string, DenuvoRemovalStat>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/denuvo-removal");
        if (!res.ok) return;
        const body = (await res.json()) as { publishers?: Record<string, DenuvoRemovalStat> };
        if (!cancelled) setData(body.publishers || {});
      } catch {
        // Leave whatever was last successfully loaded rather than clearing
        // real data on a transient failure.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const intervalId = setInterval(load, REVALIDATE_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { data, loading };
}

import { useEffect, useState } from "react";

export interface EtaStat {
  name: string;
  sample_count: number;
  /* null below worker/backfill/crackEta.ts's MIN_SAMPLE (3) -- an honest
     "not enough data" state, never a guessed number. sample_count is
     always real and present regardless. */
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  computed_at: number;
}

export interface CrackEtaData {
  publishers: Record<string, EtaStat>;
  groups: Record<string, EtaStat>;
}

const REVALIDATE_MS = 10 * 60 * 1000;

const EMPTY: CrackEtaData = { publishers: {}, groups: {} };

/* Single small fetch -- /api/crack-eta returns the whole crack_eta_stats
   table (both scopes) in one response, same shape/pattern as
   useGroupReliability.ts / useDenuvoRemovalStats.ts. */
export function useCrackEta(): { data: CrackEtaData; loading: boolean } {
  const [data, setData] = useState<CrackEtaData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/crack-eta");
        if (!res.ok) return;
        const body = (await res.json()) as Partial<CrackEtaData>;
        if (!cancelled) setData({ publishers: body.publishers || {}, groups: body.groups || {} });
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

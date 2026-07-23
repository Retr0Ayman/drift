import { useEffect, useState } from "react";

export interface GroupReliability {
  genuine_count: number;
  correction_count: number;
  avg_fix_days: number | null;
  stars: number | null;
  computed_at: number;
}

// Matches /api/catalog's own MAXAGE reasoning (worker/routes/catalog.ts) --
// this is only as fresh as the last hourly recompute tick
// (worker/backfill/groupReliability.ts), so polling faster than that
// couldn't observe anything new; this interval just keeps a long-open tab
// from sitting on a stale fetch forever.
const REVALIDATE_MS = 10 * 60 * 1000;

/* Single small fetch, not per-group -- worker/routes/groupReliability.ts
   returns the whole group_reliability table in one response (a few dozen
   to low hundreds of rows at this catalog's scale), keyed by group_key
   (slugify(group_name), same key GroupsDirectory/GroupProfile already use
   everywhere else). A group with `stars: null` genuinely has fewer than
   MIN_SAMPLE genuine releases tracked yet -- not a loading state, an
   honest "not enough data" the UI must render as such, never as 0 stars. */
export function useGroupReliability(): { data: Record<string, GroupReliability>; loading: boolean } {
  const [data, setData] = useState<Record<string, GroupReliability>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/group-reliability");
        if (!res.ok) return;
        const body = (await res.json()) as { groups?: Record<string, GroupReliability> };
        if (!cancelled) setData(body.groups || {});
      } catch {
        // Leave whatever was last successfully loaded (or the empty
        // default) rather than clearing real data on a transient failure.
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

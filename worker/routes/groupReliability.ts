import type { Handler } from "../shared/types";
import { json } from "../shared/http";

interface Row {
  group_key: string;
  genuine_count: number;
  correction_count: number;
  avg_fix_days: number | null;
  stars: number | null;
  computed_at: number;
}

// Whole table in one response -- this is a small, one-row-per-group cache
// (a few dozen to low hundreds of rows at this catalog's scale), not
// worth paginating like /api/catalog's games. D1 reads are cheap; this is
// only as fresh as the last group-reliability recompute tick (roughly
// hourly, see worker/backfill/groupReliability.ts), so a short cache TTL
// (matching /api/catalog's own MAXAGE reasoning) is enough.
const MAXAGE = 30;

export const handleGroupReliability: Handler = async ({ env }) => {
  try {
    const { results } = await env.orlaz_catalog
      .prepare("SELECT group_key, genuine_count, correction_count, avg_fix_days, stars, computed_at FROM group_reliability")
      .all<Row>();
    const byKey: Record<string, Omit<Row, "group_key">> = {};
    for (const r of results || []) {
      byKey[r.group_key] = {
        genuine_count: r.genuine_count,
        correction_count: r.correction_count,
        avg_fix_days: r.avg_fix_days,
        stars: r.stars,
        computed_at: r.computed_at,
      };
    }
    return json({ groups: byKey }, MAXAGE);
  } catch {
    // Migration not applied yet, or D1 genuinely unreachable -- an honest
    // empty map, same "nothing here yet, not a 500" pattern /api/catalog
    // already follows.
    return json({ groups: {} }, 5);
  }
};

import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { runGroupReliabilityTick } from "../backfill/groupReliability";

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

/* Manual backfill trigger -- confirmed live need: after migrations 0007/
   0008 landed on production D1, /api/group-reliability kept returning an
   empty map because Cloudflare's manual `/cdn-cgi/handler/scheduled` test
   endpoint (what worker/backfill's other one-time debugging used locally)
   404s on a real deployed Worker, not just local wrangler dev -- there was
   no way to force the hourly recompute tick to run once immediately
   without waiting for its next natural cron firing. Same "confirmed real
   answer, not a guess" standard as everywhere else in this app: this lets
   the actual computed_at/groups count be checked directly instead of
   inferring from silence.
   No auth -- same as every other route in this app (all public reads),
   and this is safe to expose: it only ever reads existing releases rows
   and recomputes a derived cache, no destructive action, and `force`
   still respects nothing beyond re-running the same idempotent
   computation early. Left in place rather than removed after the initial
   backfill -- a legitimate way to force a fresh recompute on demand
   (e.g. right after a data-quality fix) without waiting up to an hour. */
export const handleGroupReliabilityRecompute: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const result = await runGroupReliabilityTick(env, force);
    return json(result, 5);
  } catch (e) {
    return json({ ran: false, error: e instanceof Error ? e.message : String(e) }, 5, 500);
  }
};

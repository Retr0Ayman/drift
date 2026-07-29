import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { runDenuvoRemovalStatsTick } from "../backfill/denuvoRemoval";

interface Row {
  publisher_key: string;
  publisher_name: string;
  sample_count: number;
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  computed_at: number;
}

// Small, one-row-per-publisher cache, same MAXAGE reasoning as
// /api/group-reliability -- this is only as fresh as the last hourly
// recompute (worker/backfill/denuvoRemoval.ts).
const MAXAGE = 30;

export const handleDenuvoRemoval: Handler = async ({ env }) => {
  try {
    const { results } = await env.orlaz_catalog
      .prepare("SELECT publisher_key, publisher_name, sample_count, median_days, min_days, max_days, computed_at FROM denuvo_removal_stats")
      .all<Row>();
    const byKey: Record<string, Omit<Row, "publisher_key">> = {};
    for (const r of results || []) {
      byKey[r.publisher_key] = {
        publisher_name: r.publisher_name,
        sample_count: r.sample_count,
        median_days: r.median_days,
        min_days: r.min_days,
        max_days: r.max_days,
        computed_at: r.computed_at,
      };
    }
    return json({ publishers: byKey }, MAXAGE);
  } catch {
    // Migration not applied yet, or D1 genuinely unreachable -- an honest
    // empty map, same "nothing here yet, not a 500" pattern /api/catalog
    // and /api/group-reliability already follow.
    return json({ publishers: {} }, 5);
  }
};

// Manual recompute trigger, same live-forcing need as
// /api/group-reliability/recompute (Cloudflare's manual scheduled-handler
// test endpoint 404s on a real deployed Worker, so this is the only way to
// force a fresh pass without waiting up to an hour). Same "safe to expose"
// reasoning: read-only over existing rows plus a derived-cache recompute,
// no destructive action.
export const handleDenuvoRemovalRecompute: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const result = await runDenuvoRemovalStatsTick(env, force);
    return json(result, 5);
  } catch (e) {
    return json({ ran: false, error: e instanceof Error ? e.message : String(e) }, 5, 500);
  }
};

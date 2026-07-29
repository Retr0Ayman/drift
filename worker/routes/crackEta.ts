import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { runCrackEtaStatsTick } from "../backfill/crackEta";

interface Row {
  scope: "publisher" | "group";
  key: string;
  name: string;
  sample_count: number;
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  computed_at: number;
}

export interface EtaStatDto {
  name: string;
  sample_count: number;
  median_days: number | null;
  min_days: number | null;
  max_days: number | null;
  computed_at: number;
}

const MAXAGE = 30;

export const handleCrackEta: Handler = async ({ env }) => {
  try {
    const { results } = await env.orlaz_catalog
      .prepare("SELECT scope, key, name, sample_count, median_days, min_days, max_days, computed_at FROM crack_eta_stats")
      .all<Row>();
    const publishers: Record<string, EtaStatDto> = {};
    const groups: Record<string, EtaStatDto> = {};
    for (const r of results || []) {
      const target = r.scope === "publisher" ? publishers : groups;
      target[r.key] = {
        name: r.name,
        sample_count: r.sample_count,
        median_days: r.median_days,
        min_days: r.min_days,
        max_days: r.max_days,
        computed_at: r.computed_at,
      };
    }
    return json({ publishers, groups }, MAXAGE);
  } catch {
    return json({ publishers: {}, groups: {} }, 5);
  }
};

export const handleCrackEtaRecompute: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  try {
    const result = await runCrackEtaStatsTick(env, force);
    return json(result, 5);
  } catch (e) {
    return json({ ran: false, error: e instanceof Error ? e.message : String(e) }, 5, 500);
  }
};

import { getBackfillState, setBackfillState } from "./db";

export type DrmSource = "pcgamingwiki" | "steam";

export interface SourceHealth {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  /* When the current unbroken run of failures began; null while healthy. */
  failingSince: number | null;
  consecutiveFailures: number;
  /* HTTP status (or null for a thrown/parse error) of the latest failure. */
  lastStatus: number | null;
  lastError: string | null;
}

export const EMPTY_HEALTH: SourceHealth = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  failingSince: null,
  consecutiveFailures: 0,
  lastStatus: null,
  lastError: null,
};

/* Pure reducer, so the failure bookkeeping is unit-testable. A success
   resets the run; a failure extends it and remembers when it began. */
export function nextHealth(
  prev: SourceHealth,
  ok: boolean,
  now: number,
  info: { status?: number | null; error?: string | null } = {},
): SourceHealth {
  if (ok) {
    return { ...prev, lastAttemptAt: now, lastSuccessAt: now, failingSince: null, consecutiveFailures: 0, lastStatus: null, lastError: null };
  }
  return {
    ...prev,
    lastAttemptAt: now,
    failingSince: prev.failingSince ?? now,
    consecutiveFailures: prev.consecutiveFailures + 1,
    lastStatus: info.status ?? null,
    lastError: info.error ?? null,
  };
}

const key = (s: DrmSource) => `drm_health:${s}`;

export async function getSourceHealth(db: D1Database, source: DrmSource): Promise<SourceHealth> {
  const raw = await getBackfillState(db, key(source));
  if (!raw) return { ...EMPTY_HEALTH };
  try {
    return { ...EMPTY_HEALTH, ...(JSON.parse(raw) as Partial<SourceHealth>) };
  } catch {
    return { ...EMPTY_HEALTH };
  }
}

export async function recordSourceResult(
  db: D1Database,
  source: DrmSource,
  ok: boolean,
  info: { status?: number | null; error?: string | null } = {},
): Promise<void> {
  const next = nextHealth(await getSourceHealth(db, source), ok, Date.now(), info);
  await setBackfillState(db, key(source), JSON.stringify(next));
  // Loud in `wrangler tail`, never silent.
  if (!ok) console.warn(`[drm] ${source} lookup failed (status=${info.status ?? "n/a"}, error=${info.error ?? "n/a"}, consecutive=${next.consecutiveFailures})`);
}

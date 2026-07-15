import type { Env } from "../shared/env";
import { handleResolve } from "../routes/resolve";
import { handleAppdetails } from "../routes/appdetails";

// Same cap src/hooks/useLiveCatalog.ts already uses client-side -- confirmed
// live there that firing more concurrent /resolve calls at once measurably
// caused some to fail to resolve under real load (Steam storesearch rate
// limiting, not this app's own bug).
const RESOLVE_BATCH_SIZE = 6;

export interface Enrichment {
  appid: number;
  year: number | null;
  released: string;
  developer: string;
  publisher: string;
  genres: string[];
  currentBuild: number | null;
  desc: string;
  metacritic: number | null;
}

/* Calls the route handlers directly with a synthetic same-origin Request,
   same pattern worker/scheduled.ts already uses for the xREL routes --
   identical logic and edge caching, no extra network hop back into this
   same Worker. */
export async function resolveTitle(env: Env, title: string): Promise<number | null> {
  const res = await handleResolve({
    request: new Request("https://internal.invalid/api/resolve?title=" + encodeURIComponent(title)),
    env,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { appid?: number | null };
  return data.appid ?? null;
}

export async function enrichFromSteam(env: Env, appid: number): Promise<Enrichment | null> {
  const res = await handleAppdetails({
    request: new Request(`https://internal.invalid/api/appdetails?appid=${appid}`),
    env,
  });
  if (!res.ok) return null;
  const d = (await res.json()) as {
    appid?: number;
    year?: number | null;
    released?: string;
    developers?: string[];
    publishers?: string[];
    genres?: string[];
    currentBuild?: number | null;
    desc?: string;
    about?: string;
    metacritic?: number | null;
  };
  if (!d.appid) return null;
  return {
    appid: d.appid,
    year: d.year ?? null,
    released: d.released || "",
    developer: d.developers?.[0] || "",
    publisher: d.publishers?.[0] || "",
    genres: d.genres || [],
    currentBuild: d.currentBuild ?? null,
    desc: d.about || d.desc || "",
    metacritic: d.metacritic ?? null,
  };
}

/* Resolve+enrich a batch of titles, RESOLVE_BATCH_SIZE at a time -- the
   slow part of a backfill tick, budget for it accordingly (see
   worker/backfill/run.ts). A title that never resolves a real Steam appid
   is left out of the result map entirely, same "a game only ever renders
   if a Steam appid actually resolved" rule the client already follows --
   never insert an unresolved title into D1. */
export async function resolveAndEnrichBatch(
  env: Env,
  titles: string[],
): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();
  for (let i = 0; i < titles.length; i += RESOLVE_BATCH_SIZE) {
    const batch = titles.slice(i, i + RESOLVE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (title) => {
        const appid = await resolveTitle(env, title);
        if (appid == null) return;
        const enrichment = await enrichFromSteam(env, appid);
        if (enrichment) out.set(title, enrichment);
      }),
    );
  }
  return out;
}

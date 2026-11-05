import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { getSourceHealth, type DrmSource } from "../backfill/sourceHealth";

const SOURCES: DrmSource[] = ["pcgamingwiki", "steam"];

/* Source health for the Denuvo tracker's honest status line: when each DRM
   source last answered, and since when it has been failing, if it is. */
export const handleDenuvoStatus: Handler = async ({ env }) => {
  try {
    const entries = await Promise.all(SOURCES.map(async (s) => [s, await getSourceHealth(env.orlaz_catalog, s)] as const));
    return json({ now: Date.now(), sources: Object.fromEntries(entries) }, 30);
  } catch {
    return json({ now: Date.now(), sources: {} }, 5);
  }
};

interface SteamCmdInfo {
  data?: Record<
    string,
    { depots?: { branches?: { public?: { buildid?: string | number; timebuildupdated?: string | number } } } }
  >;
}

export interface BuildInfo {
  buildId: number | null;
  /* Steam's own real, authoritative unix-seconds timestamp of when the
     current public-branch build was actually published (steamcmd.net's
     `timebuildupdated` field, confirmed live present on every appid
     checked) -- NOT something this app derives from its own observation
     history. This is what makes a real "how long has this crack stayed
     current" survival stat possible without needing to wait for our own
     tracking to accumulate history: Steam already recorded the real
     moment, we just weren't reading it before. See GameDetail's Survival
     field / src/lib/format.ts's survivalHrs(). */
  buildUpdatedAt: number | null;
}

export async function fetchBuildInfo(appid: string): Promise<BuildInfo> {
  try {
    // FIX (confirmed live, QA sweep): cacheEverything caches ANY status
    // code for the full cacheTtl -- a transient steamcmd.net failure could
    // get replayed as "no build id" for a full hour. cacheTtlByStatus
    // caches a real 2xx the same as before but never caches an error.
    const r = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, {
      cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
    } as RequestInit);
    const jn = (await r.json()) as SteamCmdInfo;
    const pub = jn.data?.[appid]?.depots?.branches?.public;
    const b = pub?.buildid;
    const t = pub?.timebuildupdated;
    return { buildId: b ? Number(b) : null, buildUpdatedAt: t ? Number(t) : null };
  } catch {
    return { buildId: null, buildUpdatedAt: null };
  }
}

// Thin back-compat wrapper -- badge.ts/build.ts only ever needed the bare
// number, not the timestamp; keeps their call sites unchanged.
export async function buildId(appid: string): Promise<number | null> {
  return (await fetchBuildInfo(appid)).buildId;
}

export function parseYear(s?: string | null): number | null {
  const m = s && s.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

/* Steam's requirements HTML is a <li>-per-line list (e.g. "OS *: Windows 10");
   turn it into plain-text lines the client can esc() safely, no HTML relayed. */
export function reqLines(html?: string | null): string[] {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((s) => s.replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim())
    .filter(Boolean);
}

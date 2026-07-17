interface SteamCmdInfo {
  data?: Record<string, { depots?: { branches?: { public?: { buildid?: string | number } } } }>;
}

export async function buildId(appid: string): Promise<number | null> {
  try {
    // FIX (confirmed live, QA sweep): cacheEverything caches ANY status
    // code for the full cacheTtl -- a transient steamcmd.net failure could
    // get replayed as "no build id" for a full hour. cacheTtlByStatus
    // caches a real 2xx the same as before but never caches an error.
    const r = await fetch(`https://api.steamcmd.net/v1/info/${appid}`, {
      cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
    } as RequestInit);
    const jn = (await r.json()) as SteamCmdInfo;
    const b = jn.data?.[appid]?.depots?.branches?.public?.buildid;
    return b ? Number(b) : null;
  } catch {
    return null;
  }
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

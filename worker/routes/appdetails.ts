import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { fetchBuildInfo, parseYear, reqLines } from "../shared/steam";

interface SteamAppData {
  name: string;
  short_description?: string;
  about_the_game?: string;
  release_date?: { date?: string };
  header_image?: string;
  screenshots?: Array<{ path_full: string }>;
  movies?: Array<{ thumbnail: string; mp4?: { max?: string; ["480"]?: string } }>;
  dlc?: number[];
  genres?: Array<{ description: string }>;
  developers?: string[];
  publishers?: string[];
  metacritic?: { score?: number };
  pc_requirements?: { minimum?: string; recommended?: string } | unknown[];
  is_free?: boolean;
  price_overview?: { final_formatted?: string; final?: number; currency?: string };
}
interface SteamAppDetailsResponse {
  [appid: string]: { success: boolean; data: SteamAppData };
}

export const handleAppdetails: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const appid = url.searchParams.get("appid");
  if (!/^\d+$/.test(appid || "")) return json({ error: "pass ?appid=" }, 60, 400);

  let data: SteamAppDetailsResponse;
  try {
    // FIX (confirmed live, QA sweep): cacheEverything caches ANY status
    // code for the full cacheTtl, including a transient Steam rate-limit/
    // error response -- a single bad moment could get replayed as "success:
    // false" for every caller for a full hour. cacheTtlByStatus caches a
    // real 2xx the same as before but never caches an error status.
    const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`, {
      cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
    } as RequestInit);
    data = (await r.json()) as SteamAppDetailsResponse;
  } catch {
    // FIX (confirmed live): Steam occasionally returns a non-JSON error/
    // rate-limit page instead of the expected appdetails response --
    // r.json() throwing here was uncaught, which crashed every caller all
    // the way up. A client-side fetch().catch() always absorbed this
    // fine, but the D1 backfill (worker/backfill/resolve.ts) calls this
    // handler directly as a function, no HTTP-response boundary in
    // between -- the throw took down the entire cron tick, silently
    // stalling the backfill on every run since deploy. Short TTL so the
    // next request retries instead of caching a transient failure as if
    // it were a genuine "no such app" result.
    //
    // SECOND FIX (confirmed live): both failure paths here used to echo
    // `appid: Number(appid)` back in the body -- resolve.ts's enrichFromSteam
    // only ever checked `if (!d.appid) return null` to detect a failed
    // lookup, so a truthy appid on a FAILED response made that guard never
    // fire. Every transient Steam rate-limit/error got silently treated as a
    // "successful" enrichment with every other field (title/developer/
    // publisher/released/genres/desc/header/currentBuild) undefined, which
    // then got written straight over a game's existing good data -- header
    // and most other columns are unconditional overwrites in db.ts's
    // upsert/refresh SQL (only accent color has fallback-preserving logic
    // there), so this silently corrupted roughly a quarter of the live
    // catalog over time, worst on whichever games got re-touched most
    // (confirmed live against real Steam data: Forza Horizon 6, V Rising,
    // PowerWash Simulator 2, Urban Jungle, Mirror of Heaven all have full
    // real Steam data available right now but sat blanked in D1). No appid
    // field on failure now, so `!d.appid` genuinely means failure.
    return json({ success: false }, 30);
  }
  const node = data[appid as string];
  if (!node || !node.success) return json({ success: false }, 600);
  const d = node.data;
  // Steam returns pc_requirements as {minimum, recommended} HTML strings, or an
  // empty array [] on some delisted/unusual apps -- never assume object shape.
  const pcr = d.pc_requirements && !Array.isArray(d.pc_requirements) ? d.pc_requirements : null;
  const buildInfo = await fetchBuildInfo(appid as string);
  const slim = {
    appid: Number(appid),
    title: d.name,
    desc: (d.short_description || "").trim(),
    about: (d.about_the_game || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700),
    year: parseYear(d.release_date?.date),
    released: d.release_date?.date || "",
    header: d.header_image,
    screenshots: (d.screenshots || []).map((s) => s.path_full),
    trailers: (d.movies || []).map((m) => ({ thumb: m.thumbnail, mp4: m.mp4 && (m.mp4.max || m.mp4["480"]) })),
    dlc: d.dlc || [],
    genres: (d.genres || []).map((x) => x.description),
    developers: d.developers || [],
    publishers: d.publishers || [],
    metacritic: d.metacritic?.score ?? null,
    // "if available" -- Steam omits price_overview entirely for regionally
    // restricted/unlisted apps, and is_free is its own separate flag; null
    // means genuinely unknown, never fabricated as "Free".
    price: d.is_free ? "Free" : (d.price_overview?.final_formatted ?? null),
    // Raw USD amount (cc=us above pins the region, so this is always USD when
    // present) for real currency conversion -- final is in whole cents.
    priceUsd: d.is_free ? 0 : d.price_overview?.final != null ? d.price_overview.final / 100 : null,
    currentBuild: buildInfo.buildId,
    // Real Steam-side timestamp of when this build was published (see
    // fetchBuildInfo's own comment) -- what survivalHrs()/GameDetail's
    // Survival field is actually computed from.
    currentBuildUpdatedAt: buildInfo.buildUpdatedAt,
    pcReq: pcr ? { minimum: reqLines(pcr.minimum), recommended: reqLines(pcr.recommended) } : null,
  };
  return json(slim, 3600);
};

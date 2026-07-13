import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { buildId, parseYear, reqLines } from "../shared/steam";

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

  const r = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`,
    { cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit,
  );
  const data = (await r.json()) as SteamAppDetailsResponse;
  const node = data[appid as string];
  if (!node || !node.success) return json({ appid: Number(appid), success: false }, 600);
  const d = node.data;
  // Steam returns pc_requirements as {minimum, recommended} HTML strings, or an
  // empty array [] on some delisted/unusual apps -- never assume object shape.
  const pcr = d.pc_requirements && !Array.isArray(d.pc_requirements) ? d.pc_requirements : null;
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
    currentBuild: await buildId(appid as string),
    pcReq: pcr ? { minimum: reqLines(pcr.minimum), recommended: reqLines(pcr.recommended) } : null,
  };
  return json(slim, 3600);
};

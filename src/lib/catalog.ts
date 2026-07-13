import type { Game, Release } from "../types/game";
import { slugify } from "./format";
import { methodForGroup } from "./constants";

interface RawRelease {
  id: string;
  dirname: string;
  time?: number;
  group_name?: string;
  link_href?: string;
  ext_info?: { type?: string; id?: string; title?: string };
}

export interface PartialGame extends Game {
  xrelKey: string;
  xrelTime: number;
}

const yearFromTs = (t?: number): number | null => (t ? new Date(t * 1000).getFullYear() : null);
const dateFromTs = (t?: number): string =>
  t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/* Best-effort, non-invented version token pulled from the scene dirname,
   e.g. "...-Update.3-CODEX" -> "Update 3", "...v1.05-RUNE" -> "v1.05". Falls
   back to the raw dirname (still shown via the note field) when nothing
   matches -- never fabricate a Steam build id from this. */
function parseVersionFromDirname(dn?: string): string {
  if (!dn) return "";
  const m = dn.match(/\b(v\d+(?:\.\d+)+|update\.?\d+|build\.?\d+|hotfix\.?\d+|patch\.?\d+)\b/i);
  return m ? m[0].replace(/\./g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
}

/* Turns a page of raw xREL release rows into {xrelKey: gamePartial}. Games-
   only: ext_info.type for a real game is "master_game" (confirmed live),
   not "game". */
export function parseReleaseRows(list: RawRelease[]): Record<string, PartialGame> {
  const byGame: Record<string, PartialGame> = {};
  for (const rel of list) {
    const ext = rel.ext_info || {};
    if (ext.type && ext.type !== "master_game") continue;
    const title = ext.title;
    if (!title) continue;
    const key = ext.id || title;
    if (!byGame[key]) {
      byGame[key] = {
        id: slugify(title),
        xrelKey: key,
        title,
        appid: null,
        year: yearFromTs(rel.time),
        released: "",
        developer: "",
        publisher: "",
        genres: [],
        tags: ["Denuvo"],
        currentBuild: 0,
        survivalHrs: null,
        releases: [],
        desc: "",
        fact: "",
        dlc: [],
        xrelTime: 0,
        source: { name: "xREL", url: "https://www.xrel.to/" },
      };
    }
    const m = methodForGroup(rel.group_name || "");
    const ver = parseVersionFromDirname(rel.dirname) || rel.dirname || "";
    byGame[key].releases.push({
      method: m,
      label: m === "hv" ? "Hypervisor" : "Traditional",
      group: rel.group_name || "scene",
      build: null,
      version: ver,
      date: dateFromTs(rel.time),
      ts: rel.time || 0,
      note: rel.dirname || "",
      xrelId: rel.id,
      link_href: rel.link_href,
    });
    byGame[key].xrelTime = Math.max(byGame[key].xrelTime || 0, rel.time || 0);
  }
  return byGame;
}

/* Title -> appid via the Worker's /resolve route (Steam storesearch, small
   and targeted). Memoized per title so re-polling the same page, or
   re-resolving the same seed titles, doesn't refetch. */
const RESOLVE_CACHE = new Map<string, number | null>();
export async function resolveTitle(title: string): Promise<number | null> {
  const key = title.toLowerCase();
  if (RESOLVE_CACHE.has(key)) return RESOLVE_CACHE.get(key) ?? null;
  try {
    const r = await fetch(`/api/resolve?title=${encodeURIComponent(title)}`);
    const d = (await r.json()) as { appid?: number | null };
    const appid = d.appid ?? null;
    RESOLVE_CACHE.set(key, appid);
    return appid;
  } catch {
    RESOLVE_CACHE.set(key, null);
    return null;
  }
}

interface AppDetailsResponse {
  appid?: number;
  desc?: string;
  about?: string;
  developers?: string[];
  publishers?: string[];
  genres?: string[];
  year?: number | null;
  released?: string;
  currentBuild?: number | null;
  metacritic?: number | null;
  dlc?: number[];
}

export async function enrichFromSteam(game: PartialGame): Promise<void> {
  if (game.appid == null) return;
  try {
    const r = await fetch(`/api/appdetails?appid=${game.appid}`);
    const d = (await r.json()) as AppDetailsResponse;
    if (!d.appid) return;
    game.desc = d.about || d.desc || game.desc;
    game.developer = d.developers?.[0] || game.developer;
    game.publisher = d.publishers?.[0] || game.publisher;
    if (d.genres?.length) game.genres = d.genres;
    game.year = d.year ?? game.year;
    game.released = d.released || game.released;
    game.currentBuild = d.currentBuild ?? game.currentBuild;
    game.metacritic = d.metacritic ?? game.metacritic;
    if (Array.isArray(d.dlc) && d.dlc.length) {
      game.dlc = d.dlc.map((appid) => ({ n: "DLC", p: "—", appid }));
    }
  } catch {
    // leave whatever xREL-derived fields already exist
  }
}

export async function resolveAndEnrich(game: PartialGame): Promise<void> {
  game.appid = await resolveTitle(game.title);
  await enrichFromSteam(game);
}

/* Builds a full, appid-resolved Game from a single raw search-result row --
   used by the search autocomplete's live fallback so picking an unresolved
   suggestion still lands on a real, working detail page. */
export async function buildLiveGame(row: RawRelease): Promise<Game | null> {
  const title = row.ext_info?.title;
  if (!title) return null;
  const appid = await resolveTitle(title);
  if (appid == null) return null;
  const m = methodForGroup(row.group_name || "");
  const release: Release = {
    method: m,
    label: m === "hv" ? "Hypervisor" : "Traditional",
    group: row.group_name || "scene",
    build: null,
    version: parseVersionFromDirname(row.dirname) || row.dirname || "",
    date: dateFromTs(row.time),
    ts: row.time || 0,
    note: row.dirname || "",
    xrelId: row.id,
    link_href: row.link_href,
  };
  const game: PartialGame = {
    id: slugify(title),
    xrelKey: row.ext_info?.id || title,
    title,
    appid,
    year: yearFromTs(row.time),
    released: "",
    developer: "",
    publisher: "",
    genres: [],
    tags: ["Denuvo"],
    currentBuild: 0,
    survivalHrs: null,
    releases: [release],
    desc: "",
    fact: "",
    dlc: [],
    xrelTime: row.time || 0,
    source: { name: "xREL", url: "https://www.xrel.to/" },
  };
  await enrichFromSteam(game);
  return game;
}

/* Newest-first needs a real point in time, not just a bucket year. Prefers
   the Steam release date; falls back to the xREL scene-release timestamp;
   falls back to Jan 1 of the year so seed-only entries with neither still
   sort sanely. */
export function gTimestamp(g: Game): number {
  if (g.released) {
    const t = Date.parse(g.released);
    if (!isNaN(t)) return t;
  }
  if (g.xrelTime) return g.xrelTime * 1000;
  if (g.year) return new Date(g.year, 0, 1).getTime();
  return 0;
}

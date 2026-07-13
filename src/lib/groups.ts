import type { Game, Release } from "../types/game";
import { relOutdated, releaseTs, slugify } from "./format";
import { STARRED_GROUPS } from "./constants";

export interface GameRelease {
  g: Game;
  r: Release;
}

export interface GroupEntry {
  key: string;
  name: string;
  count: number;
  hv: number;
  trad: number;
  out: number;
  lastTs: number;
  starred: boolean;
}

/* Every release already carries its own {group, method}; a group's
   "profile" is just every release across the catalog whose group slugifies
   to the same key -- no separate group data model to keep in sync. */
export function allReleases(games: Game[]): GameRelease[] {
  const list: GameRelease[] = [];
  games.forEach((g) => (g.releases || []).forEach((r) => list.push({ g, r })));
  return list;
}

export function groupsIndex(games: Game[]): GroupEntry[] {
  const map: Record<string, GroupEntry> = {};
  allReleases(games).forEach(({ g, r }) => {
    const name = r.group || "unknown";
    const key = slugify(name);
    if (!map[key]) {
      map[key] = { key, name, count: 0, hv: 0, trad: 0, out: 0, lastTs: 0, starred: STARRED_GROUPS.includes(key) };
    }
    map[key].count++;
    map[key][r.method]++;
    if (relOutdated(g, r)) map[key].out++;
    const ts = releaseTs(r);
    if (ts && ts > map[key].lastTs) map[key].lastTs = ts;
  });
  return Object.values(map).sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}

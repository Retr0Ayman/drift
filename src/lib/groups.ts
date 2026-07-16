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

/* `extra` (from useStarredGroupSummaries) is a real, live full-history
   count for the starred P2P groups -- the same deep fetch GroupProfile
   itself uses, not a guess. Originally only used to fill in a group with
   *zero* presence in `games` (P2P groups never appeared in the main
   Windows browse feed at all, so before the backfill work there was
   nothing here to derive a card from otherwise). FIX (confirmed live):
   now that the backfill/archive work has given DenuvOwO *some* presence in
   `games`, "extra only fills total gaps" started silently preferring
   `games`'s own count even when it was a strict subset of the real one --
   confirmed live, the directory showed 51 for a group GroupProfile's own
   (correct, more complete) count put at 168. `games` is just whatever
   slice of the catalog happened to load client-side; it was never meant to
   be treated as more authoritative than a group's own real full-history
   fetch. Now takes whichever count is actually larger. */
export function groupsIndex(games: Game[], extra: GroupEntry[] = []): GroupEntry[] {
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
  extra.forEach((e) => {
    const existing = map[e.key];
    if (!existing || e.count > existing.count) map[e.key] = e;
  });
  return Object.values(map).sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return b.count - a.count || a.name.localeCompare(b.name);
  });
}

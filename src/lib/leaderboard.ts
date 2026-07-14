import type { Game } from "../types/game";
import { allReleases } from "./groups";
import { crackTimingDays, slugify } from "./format";

export interface LeaderboardRow {
  key: string;
  name: string;
  count: number;
  avgDays: number;
  fastestDays: number;
  fastestGameId: string;
  fastestGameTitle: string;
  slowestDays: number;
}

interface Acc {
  key: string;
  name: string;
  days: number[];
  fastestDays: number;
  fastestGameId: string;
  fastestGameTitle: string;
}

/* Ranks groups by how fast they crack games after Steam release. Only
   releases with a real, parseable Steam release date AND a real crack
   timestamp count -- crackTimingDays returns null rather than a fabricated 0
   for anything it can't honestly compute, and those get skipped rather than
   skew an average toward zero. Repacks and anonymous P2P uploads are
   excluded outright: they rebundle or reupload someone else's DRM bypass,
   they didn't perform it, so crediting them with a "crack time" here would
   be the same kind of mislabel isRepackGroup/isAnonymousUpload already guard
   against everywhere else in the app (see lib/constants.ts). */
export function buildLeaderboard(games: Game[]): LeaderboardRow[] {
  const map: Record<string, Acc> = {};

  allReleases(games).forEach(({ g, r }) => {
    if (r.isRepack || r.isAnonymous) return;
    const days = crackTimingDays(g, r);
    if (days == null) return;

    const name = r.group || "unknown";
    const key = slugify(name);
    if (!map[key]) {
      map[key] = { key, name, days: [], fastestDays: Infinity, fastestGameId: "", fastestGameTitle: "" };
    }
    const acc = map[key];
    acc.days.push(days);
    if (days < acc.fastestDays) {
      acc.fastestDays = days;
      acc.fastestGameId = g.id;
      acc.fastestGameTitle = g.title;
    }
  });

  return Object.values(map).map((acc) => ({
    key: acc.key,
    name: acc.name,
    count: acc.days.length,
    avgDays: acc.days.reduce((sum, d) => sum + d, 0) / acc.days.length,
    fastestDays: acc.fastestDays,
    fastestGameId: acc.fastestGameId,
    fastestGameTitle: acc.fastestGameTitle,
    slowestDays: Math.max(...acc.days),
  }));
}

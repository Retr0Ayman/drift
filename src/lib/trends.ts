import type { Game } from "../types/game";
import { allReleases } from "./groups";
import { crackTimingDays, releaseTs, gStatus, slugify } from "./format";

export interface PublisherSpeedRow {
  key: string;
  name: string;
  count: number;
  avgDays: number;
}

/* Same "real Steam release date + real crack timestamp, no repacks/anonymous
   uploads" rule buildLeaderboard already applies to groups -- just aggregated
   by publisher instead. minReleases guards against a publisher with one
   lucky/unlucky data point reading as a real trend. */
export function buildPublisherSpeed(games: Game[], minReleases = 2): PublisherSpeedRow[] {
  const map: Record<string, { name: string; days: number[] }> = {};
  allReleases(games).forEach(({ g, r }) => {
    if (r.isRepack || r.isAnonymous || !g.publisher) return;
    const days = crackTimingDays(g, r);
    if (days == null) return;
    const key = slugify(g.publisher);
    (map[key] ||= { name: g.publisher!, days: [] }).days.push(days);
  });
  return Object.entries(map)
    .filter(([, v]) => v.days.length >= minReleases)
    .map(([key, v]) => ({
      key,
      name: v.name,
      count: v.days.length,
      avgDays: v.days.reduce((s, d) => s + d, 0) / v.days.length,
    }));
}

export interface ActivityMonth {
  key: string;
  label: string;
  count: number;
}

/* Buckets every tracked release (not just games, every release row) by
   calendar month -- the deep archive crawl is what makes this chart worth
   having at all, it's the only backfill pass that adds real depth beyond
   the last ~year. Only full months are shown (a partial current month would
   read as a misleading dip at the right edge). */
export function buildActivityTimeline(games: Game[], months = 24): ActivityMonth[] {
  const counts = new Map<string, number>();
  allReleases(games).forEach(({ r }) => {
    const ts = releaseTs(r);
    if (!ts) return;
    const d = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const sortedKeys = [...counts.keys()].filter((k) => k !== currentKey).sort();
  const recentKeys = sortedKeys.slice(-months);
  return recentKeys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return { key, label, count: counts.get(key) || 0 };
  });
}

export interface UncrackedRow {
  game: Game;
  daysSince: number;
}

/* "Released, real currentBuild, zero tracked crack releases yet" -- exactly
   gStatus's own "uncracked" bucket, just sorted by how long that's been true
   instead of left in catalog order. */
export function buildUncrackedSpotlight(games: Game[], limit = 12): UncrackedRow[] {
  const now = Date.now();
  return games
    .filter((g) => gStatus(g) === "uncracked" && g.released)
    .map((g) => {
      const released = Date.parse(g.released);
      return { game: g, daysSince: isNaN(released) ? 0 : Math.floor((now - released) / 86400000) };
    })
    .filter((r) => r.daysSince > 0)
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, limit);
}

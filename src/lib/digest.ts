import type { Game } from "../types/game";
import { allReleases } from "./groups";
import { crackTimingDays, gStatus, releaseTs } from "./format";

export interface DigestFacts {
  totalGames: number;
  totalReleases: number;
  activeGroup30d: string | null;
  activeGroup30dCount: number;
  fastestCrack30d: { group: string; game: string; days: number } | null;
  longestUncracked: { title: string; days: number } | null;
  recentTitles: string[];
}

/* Every fact here is a real, directly-computed number or name from already-
   loaded catalog data -- nothing here is invented, and nothing in the AI
   narration built from it is allowed to be either (see worker/routes/
   digest.ts's system prompt, same grounding discipline AiSummary already
   uses for group/publisher blurbs). This is the input, not the output. */
export function buildDigestFacts(games: Game[]): DigestFacts {
  const now = Date.now();
  const THIRTY_D = 30 * 86400000;

  const releases = allReleases(games);
  const totalReleases = releases.length;

  const groupCounts30d = new Map<string, number>();
  let fastest: { group: string; game: string; days: number } | null = null;

  releases.forEach(({ g, r }) => {
    if (r.isRepack || r.isAnonymous) return;
    const ts = releaseTs(r);
    if (ts && now - ts <= THIRTY_D) {
      const name = r.group || "unknown";
      groupCounts30d.set(name, (groupCounts30d.get(name) || 0) + 1);

      const days = crackTimingDays(g, r);
      if (days != null && (!fastest || days < fastest.days)) {
        fastest = { group: name, game: g.title, days };
      }
    }
  });

  let activeGroup30d: string | null = null;
  let activeGroup30dCount = 0;
  groupCounts30d.forEach((count, name) => {
    if (count > activeGroup30dCount) {
      activeGroup30d = name;
      activeGroup30dCount = count;
    }
  });

  const uncracked = games
    .filter((g) => gStatus(g) === "uncracked" && g.released)
    .map((g) => {
      const released = Date.parse(g.released);
      return { title: g.title, daysSince: isNaN(released) ? 0 : Math.floor((now - released) / 86400000) };
    })
    .filter((r) => r.daysSince > 0)
    .sort((a, b) => b.daysSince - a.daysSince)[0];

  const recentTitles = [...games]
    .filter((g) => g.releases.length)
    .sort((a, b) => Math.max(...b.releases.map((r) => releaseTs(r) || 0)) - Math.max(...a.releases.map((r) => releaseTs(r) || 0)))
    .slice(0, 6)
    .map((g) => g.title);

  return {
    totalGames: games.length,
    totalReleases,
    activeGroup30d,
    activeGroup30dCount,
    fastestCrack30d: fastest,
    longestUncracked: uncracked ? { title: uncracked.title, days: uncracked.daysSince } : null,
    recentTitles,
  };
}

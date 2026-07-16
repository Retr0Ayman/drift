import { useEffect, useState } from "react";
import { STARRED_GROUPS, methodForGroup } from "../lib/constants";
import { fetchGroupHistory } from "../lib/xrel";
import { slugify } from "../lib/format";
import { allReleases, type GroupEntry } from "../lib/groups";
import type { Game } from "../types/game";

// Matches the shortened cache TTL on worker/routes/xrel/group.ts -- see
// usePlatformP2PIndex.ts for the same constant and the reasoning.
const REVALIDATE_MS = 5 * 60 * 1000;

/* Eager fetch for starred groups specifically -- DenuvOwO/voices38 never
   appear in the main Windows browse feed (P2P groups aren't in it at all,
   see worker/routes/xrel/group.ts), so once the live catalog replaces the
   seed data, groupsIndex(games) alone could still be missing releases the
   backfill hasn't reached yet. Uses the same full-history fetch as the
   group profile page (real pagination via v2/p2p/releases.json?group_id=,
   not the capped search endpoint).

   FIX (confirmed live): this used to report `count: rows.length` -- the
   raw live-fetch row count (232 for DenuvOwO) -- which doesn't match what
   GroupProfile.tsx actually shows (168), because GroupProfile counts one
   entry per already-known seed title (from `games`) plus one entry per
   *raw* live row for titles not yet seeded, not the raw row count alone.
   Recomputes that exact same formula here (needs `games` for that, which
   this hook didn't previously take) instead of a different, looser count
   -- the whole point is one real number, not a second approximation of it. */
export function useStarredGroupSummaries(games: Game[]): { summaries: GroupEntry[]; loading: boolean } {
  const [summaries, setSummaries] = useState<GroupEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await Promise.all(
        STARRED_GROUPS.map(async (key): Promise<GroupEntry | null> => {
          const { rows } = await fetchGroupHistory(key);
          if (!rows.length) return null;
          const name = rows[0].group_name || key;

          // Same seedMatches/seedTitles GroupProfile.tsx computes for this
          // exact group -- releases already in the loaded catalog count
          // once each (they're already deduped there); a raw live row only
          // adds to the count if its title isn't already covered that way.
          const seedMatches = allReleases(games).filter(({ r }) => slugify(r.group || "unknown") === key);
          const seedTitles = new Set(seedMatches.map(({ g }) => g.title.toLowerCase()));
          const liveExtra = rows.filter((row) => !seedTitles.has((row.ext_info?.title || "").toLowerCase()));

          let hv = 0;
          let trad = 0;
          let lastTs = 0;
          seedMatches.forEach(({ r }) => {
            if (r.method === "hv") hv++;
            else trad++;
          });
          liveExtra.forEach((row) => {
            if (methodForGroup(row.group_name || key) === "hv") hv++;
            else trad++;
          });
          for (const row of rows) {
            const ts = (row.time || 0) * 1000;
            if (ts > lastTs) lastTs = ts;
          }

          // Outdated count needs each title's Steam currentBuild, which this
          // lightweight summary doesn't fetch -- 0 here just means "not
          // shown," never a false "confirmed zero outdated" claim.
          return {
            key: slugify(name),
            name,
            count: seedMatches.length + liveExtra.length,
            hv,
            trad,
            out: 0,
            lastTs,
            starred: true,
          };
        }),
      );
      if (!cancelled) {
        setSummaries(results.filter((r): r is GroupEntry => r != null));
        setLoading(false);
      }
    }

    load();
    const intervalId = setInterval(load, REVALIDATE_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games]);

  return { summaries, loading };
}

import { useEffect, useState } from "react";
import { STARRED_GROUPS, methodForGroup } from "../lib/constants";
import { fetchGroupHistory } from "../lib/xrel";
import { slugify } from "../lib/format";
import type { GroupEntry } from "../lib/groups";

// Matches the shortened cache TTL on worker/routes/xrel/group.ts -- see
// usePlatformP2PIndex.ts for the same constant and the reasoning.
const REVALIDATE_MS = 5 * 60 * 1000;

/* Eager fetch for starred groups specifically -- DenuvOwO/voices38 never
   appear in the main Windows browse feed (P2P groups aren't in it at all,
   see worker/routes/xrel/group.ts), so once the live catalog replaces the
   seed data, groupsIndex(games) has zero releases to derive a card from for
   either of them. This is a lightweight count-only summary (no per-title
   Steam enrichment -- that's what GroupProfile does on demand when someone
   actually opens the group), just enough for the directory to always show
   a real, clickable card for both starred groups. Uses the same full-
   history fetch as the group profile page (real pagination via
   v2/p2p/releases.json?group_id=, not the capped search endpoint), so the
   directory's counts and "last active" dates are the real numbers too.

   Re-fetches on an interval, not just once on mount -- same fix as
   usePlatformP2PIndex.ts, for the same confirmed-live staleness bug: a
   tab left open doesn't otherwise ever learn about a release that dropped
   after it loaded. */
export function useStarredGroupSummaries(): { summaries: GroupEntry[]; loading: boolean } {
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
          let hv = 0;
          let trad = 0;
          let lastTs = 0;
          for (const row of rows) {
            if (methodForGroup(row.group_name || key) === "hv") hv++;
            else trad++;
            const ts = (row.time || 0) * 1000;
            if (ts > lastTs) lastTs = ts;
          }
          // Outdated count needs each title's Steam currentBuild, which this
          // lightweight summary doesn't fetch -- 0 here just means "not
          // shown," never a false "confirmed zero outdated" claim.
          return { key: slugify(name), name, count: rows.length, hv, trad, out: 0, lastTs, starred: true };
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
  }, []);

  return { summaries, loading };
}

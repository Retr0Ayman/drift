import { useEffect, useState } from "react";
import { STARRED_GROUPS } from "../lib/constants";
import { fetchGroupHistory, type XrelReleaseRow } from "../lib/xrel";
import { normalizeTitle } from "../lib/companies";

export type P2PIndex = Map<string, XrelReleaseRow[]>;

/* Same starred-groups fetch useStarredGroupSummaries already does, but
   keeps the raw rows instead of collapsing them into aggregate counts.
   GameDetail (and GroupProfile) need to answer "does any starred P2P group
   have a release for THIS game," which the browse-feed-only catalog can
   never answer on its own -- P2P groups never appear in that feed at all
   (see worker/routes/xrel/browse.ts). Keyed by normalizeTitle so a lookup
   on a game's own title matches the same way franchise/publisher lookups
   already do elsewhere in this app. */
export function usePlatformP2PIndex(): { index: P2PIndex; loading: boolean } {
  const [index, setIndex] = useState<P2PIndex>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(STARRED_GROUPS.map((key) => fetchGroupHistory(key)));
      if (cancelled) return;
      const map: P2PIndex = new Map();
      for (const { rows } of results) {
        for (const row of rows) {
          const title = row.ext_info?.title;
          if (!title) continue;
          const key = normalizeTitle(title);
          const existing = map.get(key);
          if (existing) existing.push(row);
          else map.set(key, [row]);
        }
      }
      setIndex(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { index, loading };
}

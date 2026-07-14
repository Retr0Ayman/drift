export interface XrelReleaseRow {
  id: string;
  dirname: string;
  link_href?: string;
  time?: number;
  group_name?: string;
  group_id?: string;
  ext_info?: { type?: string; title?: string };
}

interface GroupLookupResponse {
  list?: XrelReleaseRow[];
}

interface P2PGroupResponse {
  list?: XrelReleaseRow[];
  totalCount?: number;
}

/* Hits worker/routes/xrel/group.ts -- search/releases.json under the hood,
   which works for both scene and P2P groups but has broken/fake pagination
   (confirmed dead: repeated page requests return byte-identical results),
   so this alone caps out around the same ~30 results regardless of a
   group's real output. Still the right first call: it's reliable for any
   group name (scene or P2P) and every row carries the group's internal
   hash ID for free, which is what unlocks the deeper fetch below. */
export async function fetchGroupReleases(name: string): Promise<XrelReleaseRow[]> {
  try {
    const r = await fetch(`/api/xrel/group?name=${encodeURIComponent(name)}`);
    if (!r.ok) return [];
    const data = (await r.json()) as GroupLookupResponse;
    return (data.list || []).filter((row) => !row.ext_info?.type || row.ext_info.type === "master_game");
  } catch {
    return [];
  }
}

/* Hits worker/routes/xrel/p2pGroup.ts -- v2/p2p/releases.json?group_id=,
   which has genuine working pagination keyed by a group's internal hash
   ID (confirmed live: DenuvOwO's real total is 232, not the ~30 the
   search-based route above tops out at). P2P-specific: a scene-only group
   id here just returns an empty list, which the caller (below) treats as
   "no deeper data available," not an error. */
async function fetchFullP2PHistory(groupId: string): Promise<XrelReleaseRow[]> {
  try {
    const r = await fetch(`/api/xrel/p2p-group?group_id=${encodeURIComponent(groupId)}`);
    if (!r.ok) return [];
    const data = (await r.json()) as P2PGroupResponse;
    return (data.list || []).filter((row) => !row.ext_info?.type || row.ext_info.type === "master_game");
  } catch {
    return [];
  }
}

export interface GroupHistoryResult {
  rows: XrelReleaseRow[];
  /* True when the deeper, genuinely-paginated P2P source returned more
     than the capped search baseline -- lets the UI drop the "may not
     reflect complete output" caveat once it's no longer true. */
  complete: boolean;
}

/* The real fix: always get the capped-but-reliable baseline first (works
   for any group name, scene or P2P), then try to go deeper using whichever
   hash group ID shows up in that baseline's own rows -- fully generic, no
   hardcoded group list, works for any group that has ever produced at
   least one row through the search route. Only swaps to the deeper result
   set if it's actually bigger; a scene group (or a P2P group the deeper
   route genuinely has nothing extra for) just keeps the baseline. */
export async function fetchGroupHistory(name: string): Promise<GroupHistoryResult> {
  const baseline = await fetchGroupReleases(name);
  const groupId = baseline.find((r) => r.group_id)?.group_id;
  if (!groupId) return { rows: baseline, complete: false };

  const deep = await fetchFullP2PHistory(groupId);
  if (deep.length > baseline.length) return { rows: deep, complete: true };
  return { rows: baseline, complete: false };
}

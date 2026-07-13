export interface XrelReleaseRow {
  id: string;
  dirname: string;
  link_href?: string;
  time?: number;
  group_name?: string;
  ext_info?: { type?: string; title?: string };
}

interface GroupLookupResponse {
  list?: XrelReleaseRow[];
}

/* Hits worker/routes/xrel/group.ts -- the only way to get a P2P group's
   (e.g. DenuvOwO, voices38) releases at all, since xREL has no browse-by-
   group or browse-by-category endpoint that includes P2P results (confirmed
   live, see that route's comments). Filters to master_game defensively,
   matching the same rule applied everywhere else in the catalog. */
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

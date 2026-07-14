/* Raw xREL release row shape differs between the scene endpoints
   (release/latest.json, release/browse_category.json -- flat `group_name` +
   `time`) and the P2P `p2p_results` array on search/releases.json (nested
   `group.name` + `pub_time`). Confirmed live against api.xrel.to. Normalizing
   P2P rows to the scene shape here means every downstream consumer (frontend's
   parseReleaseRows) only ever has to handle one shape. */
export interface RawXrelRelease {
  id: string;
  dirname: string;
  time?: number;
  pub_time?: number;
  group_name?: string;
  group_id?: string;
  group?: { id?: string; name?: string };
  ext_info?: { type?: string; id?: string; title?: string };
  [key: string]: unknown;
}

export function normalizeP2P(rel: RawXrelRelease): RawXrelRelease {
  return {
    ...rel,
    time: rel.time ?? rel.pub_time,
    group_name: rel.group_name ?? rel.group?.name,
    // Internal hash-style group ID (e.g. "d84f8fe31868" for DenuvOwO) --
    // NOT the numeric URL-style ID xrel.to's own site uses in links like
    // group-6248-denuvowo. This hash is what release/p2p.json's own
    // group_id filter actually expects (confirmed live), and it's already
    // present on every P2P release row for free, so no separate name->ID
    // resolution service is needed for groups we've already seen a release
    // from.
    group_id: rel.group_id ?? rel.group?.id,
  };
}

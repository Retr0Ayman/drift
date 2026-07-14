import type { Handler } from "../../shared/types";
import { json } from "../../shared/http";
import { normalizeP2P, type RawXrelRelease } from "../../shared/xrel";

interface P2PReleasesResponse {
  total_count?: number;
  pagination?: { current_page?: number; per_page?: number; total_pages?: number };
  list?: RawXrelRelease[];
}

const PER_PAGE = 100;
// Real safety cap, not a trust issue -- unlike search/releases.json's fake
// pagination (confirmed dead in earlier testing), this endpoint's
// total_pages is genuine and gets honored fully. 30 pages * 100/page is
// generous headroom above any group's real output seen so far (DenuvOwO's
// 232 releases is ~3 pages at this per_page).
const MAX_PAGES = 30;

/* Real fix for "DenuvOwO/P2P groups capped at ~30 stale results": that
   conclusion was wrong -- it was only true of search/releases.json, which
   has broken/fake pagination (confirmed dead: page 2 byte-identical to
   page 1). xrel.to's own site shows a group's full history at
   /p2p/group-<numeric-id>-<name>/releases.html with genuinely different
   pages, which led to checking for a matching JSON API route instead of
   scraping HTML: v2/p2p/releases.json?group_id=<hash> is that route --
   confirmed live, not documented anywhere obvious, found by testing
   plausible paths off the URL structure. It takes the release's own
   internal hash group ID (the "id" in a release's `group: {id, name}`
   object, e.g. "d84f8fe31868" for DenuvOwO) -- NOT the numeric URL-style ID
   xrel.to's own pages use (6248) -- and returns REAL pagination
   (total_pages actually computed, page 2 genuinely different content from
   page 1, confirmed live for both DenuvOwO and voices38).

   Fully generic, no hardcoded group list: any release row already carries
   its group's hash ID for free (see normalizeP2P), so any group ever seen
   anywhere in the catalog can have its complete history pulled through
   this one route -- nothing about this is DenuvOwO-specific. */
export const handleXrelP2PGroup: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id");
  if (!groupId) return json({ error: "pass ?group_id=<hash>" }, 60, 400);

  const list: RawXrelRelease[] = [];
  let totalPages = 1;
  let upstreamFailed = false;

  for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
    const api =
      "https://api.xrel.to/v2/p2p/releases.json?group_id=" +
      encodeURIComponent(groupId) +
      "&per_page=" +
      PER_PAGE +
      "&page=" +
      page;
    const r = await fetch(api, { cf: { cacheTtl: 900, cacheEverything: true } } as RequestInit);
    if (!r.ok) {
      upstreamFailed = page === 1;
      break;
    }
    const data = (await r.json()) as P2PReleasesResponse;
    for (const rel of data.list || []) list.push(normalizeP2P(rel));
    const reportedPages = data.pagination?.total_pages;
    if (reportedPages && reportedPages > 0) totalPages = reportedPages;
    else break; // -1/absent total_pages means this endpoint isn't scoped by group_id here -- don't loop blindly
  }

  // Same lesson as worker/routes/xrel/group.ts: never cache a transient
  // upstream failure as long as a real result.
  const maxage = upstreamFailed ? 20 : 900;
  return json({ list, totalCount: list.length }, maxage);
};

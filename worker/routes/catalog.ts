import type { Handler } from "../shared/types";
import { json } from "../shared/http";

interface JoinedRow {
  id: string;
  xrel_key: string | null;
  title: string;
  appid: number | null;
  year: number | null;
  released: string | null;
  developer: string | null;
  publisher: string | null;
  genres: string | null;
  tags: string | null;
  current_build: number | null;
  desc: string | null;
  fact: string | null;
  metacritic: number | null;
  source_name: string | null;
  source_url: string | null;
  updated_at: number;
  rel_method: string | null;
  rel_group_name: string | null;
  rel_build: number | null;
  rel_version: string | null;
  rel_date: string | null;
  rel_ts: number | null;
  rel_note: string | null;
  rel_xrel_id: string | null;
  rel_link_href: string | null;
  rel_is_repack: number | null;
  rel_is_anonymous: number | null;
  rel_update_count: number | null;
}

const DEFAULT_PER_PAGE = 200;
const MAX_PER_PAGE = 500;

/* Straight read from D1 -- replaces the client-side multi-page xREL crawl
   useLiveCatalog.ts used to do (see orlaz-phase3-database.md section 4).
   Deliberately short cache TTL, not the 900s every xREL route in this
   codebase defaults to: D1 reads are cheap and fast, and this data is
   already only as fresh as the last cron sync (every 15 minutes for
   steady-state, or the backfill's own 2-minute tick while it's still
   running) -- stacking another long cache on top would double the real
   staleness, the exact bug already fixed once on the P2P group route (see
   that file's own history). 30s here just absorbs bursts of repeat
   requests (e.g. a page's own multiple loadMore calls in quick
   succession), not a meaningful staleness window on its own. */
const MAXAGE = 30;

/* FIX (confirmed live): the first version of this route paginated games
   with LIMIT/OFFSET, then fetched their releases with a second query using
   a dynamically-built `WHERE game_id IN (?,?,?,...)` -- one bound
   parameter per game on the page. That silently broke for any per_page
   over ~100 (confirmed live: per_page=100 worked, 101 didn't) -- D1 caps
   bound parameters per statement well under SQLite's own classic 999
   limit, and the query throwing got swallowed by this handler's own
   try/catch, returning an honest-looking-but-wrong empty page instead of
   an error. A single query joining games to releases (LIMIT/OFFSET on a
   subquery, so pagination still only binds 2 parameters no matter how
   many releases a page's games have between them) sidesteps the limit
   entirely instead of needing a lower page-size cap that could break
   again the next time a game accumulates enough releases. */
const QUERY = `
  SELECT g.*, r.method as rel_method, r.group_name as rel_group_name, r.build as rel_build,
    r.version as rel_version, r.date as rel_date, r.ts as rel_ts, r.note as rel_note,
    r.xrel_id as rel_xrel_id, r.link_href as rel_link_href, r.is_repack as rel_is_repack,
    r.is_anonymous as rel_is_anonymous, r.update_count as rel_update_count
  FROM (SELECT * FROM games ORDER BY updated_at DESC LIMIT ? OFFSET ?) g
  LEFT JOIN releases r ON r.game_id = g.id
  ORDER BY g.updated_at DESC, r.ts DESC
`;

export const handleCatalog: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(url.searchParams.get("per_page") || DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  try {
    const [totalRow, rows] = await Promise.all([
      env.orlaz_catalog.prepare("SELECT COUNT(*) as n FROM games").first<{ n: number }>(),
      env.orlaz_catalog.prepare(QUERY).bind(perPage, offset).all<JoinedRow>(),
    ]);

    const total = totalRow?.n ?? 0;
    const byGame = new Map<string, { row: JoinedRow; releases: JoinedRow[] }>();
    const order: string[] = [];
    for (const row of rows.results || []) {
      let entry = byGame.get(row.id);
      if (!entry) {
        entry = { row, releases: [] };
        byGame.set(row.id, entry);
        order.push(row.id);
      }
      if (row.rel_group_name) entry.releases.push(row);
    }

    const games = order.map((id) => {
      const { row: g, releases } = byGame.get(id)!;
      return {
        id: g.id,
        xrelKey: g.xrel_key || undefined,
        title: g.title,
        appid: g.appid,
        year: g.year,
        released: g.released || "",
        developer: g.developer || "",
        publisher: g.publisher || "",
        genres: g.genres ? JSON.parse(g.genres) : [],
        tags: g.tags ? JSON.parse(g.tags) : [],
        currentBuild: g.current_build ?? 0,
        survivalHrs: null,
        desc: g.desc || "",
        fact: g.fact || "",
        dlc: [],
        metacritic: g.metacritic ?? undefined,
        source: { name: g.source_name || "xREL", url: g.source_url || "https://www.xrel.to/" },
        releases: releases.map((r) => ({
          method: r.rel_method as "hv" | "trad",
          label: r.rel_method === "hv" ? "Hypervisor" : "Traditional",
          group: r.rel_group_name as string,
          build: r.rel_build,
          version: r.rel_version || "",
          date: r.rel_date || "",
          ts: r.rel_ts || 0,
          note: r.rel_note || "",
          xrelId: r.rel_xrel_id || undefined,
          link_href: r.rel_link_href || undefined,
          isRepack: !!r.rel_is_repack,
          isAnonymous: !!r.rel_is_anonymous,
          updateCount: r.rel_update_count || 1,
        })),
      };
    });

    return json({ games, total, hasMore: offset + games.length < total }, MAXAGE);
  } catch {
    // Migrations not applied yet, or D1 genuinely unreachable -- an honest
    // "nothing here yet" empty page, not a 500. useLiveCatalog.ts falls
    // back to the bundled seed catalog when this comes back empty, same as
    // it already does for any other catalog-fetch failure.
    return json({ games: [], total: 0, hasMore: false }, 5);
  }
};

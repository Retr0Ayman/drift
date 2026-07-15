import type { Handler } from "../shared/types";
import { json } from "../shared/http";

interface GameRow {
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
}

interface ReleaseRow {
  game_id: string;
  method: string;
  group_name: string;
  build: number | null;
  version: string | null;
  date: string | null;
  ts: number | null;
  note: string | null;
  xrel_id: string | null;
  link_href: string | null;
  is_repack: number;
  is_anonymous: number;
  update_count: number;
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

export const handleCatalog: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(url.searchParams.get("per_page") || DEFAULT_PER_PAGE) || DEFAULT_PER_PAGE));
  const offset = (page - 1) * perPage;

  try {
    const [totalRow, gameRows] = await Promise.all([
      env.orlaz_catalog.prepare("SELECT COUNT(*) as n FROM games").first<{ n: number }>(),
      env.orlaz_catalog
        .prepare("SELECT * FROM games ORDER BY updated_at DESC LIMIT ? OFFSET ?")
        .bind(perPage, offset)
        .all<GameRow>(),
    ]);

    const total = totalRow?.n ?? 0;
    const games = gameRows.results || [];
    if (!games.length) {
      return json({ games: [], total, hasMore: false }, MAXAGE);
    }

    const ids = games.map((g) => g.id);
    const placeholders = ids.map(() => "?").join(",");
    const releaseRows = await env.orlaz_catalog
      .prepare(`SELECT * FROM releases WHERE game_id IN (${placeholders}) ORDER BY ts DESC`)
      .bind(...ids)
      .all<ReleaseRow>();

    const releasesByGame = new Map<string, ReleaseRow[]>();
    for (const r of releaseRows.results || []) {
      const list = releasesByGame.get(r.game_id) || [];
      list.push(r);
      releasesByGame.set(r.game_id, list);
    }

    const out = games.map((g) => ({
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
      releases: (releasesByGame.get(g.id) || []).map((r) => ({
        method: r.method as "hv" | "trad",
        label: r.method === "hv" ? "Hypervisor" : "Traditional",
        group: r.group_name,
        build: r.build,
        version: r.version || "",
        date: r.date || "",
        ts: r.ts || 0,
        note: r.note || "",
        xrelId: r.xrel_id || undefined,
        link_href: r.link_href || undefined,
        isRepack: !!r.is_repack,
        isAnonymous: !!r.is_anonymous,
        updateCount: r.update_count,
      })),
    }));

    return json({ games: out, total, hasMore: offset + games.length < total }, MAXAGE);
  } catch {
    // Migrations not applied yet, or D1 genuinely unreachable -- an honest
    // "nothing here yet" empty page, not a 500. useLiveCatalog.ts falls
    // back to the bundled seed catalog when this comes back empty, same as
    // it already does for any other catalog-fetch failure.
    return json({ games: [], total: 0, hasMore: false }, 5);
  }
};

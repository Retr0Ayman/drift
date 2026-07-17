import type { Handler } from "../shared/types";
import { enc } from "../shared/http";
import { buildId } from "../shared/steam";

interface StoreSearchItem {
  type: string;
  name: string;
  id: number;
}
interface StoreSearchResponse {
  items?: StoreSearchItem[];
}

// Same normalization as resolve.ts -- kept as its own small copy rather
// than a cross-file import, matching this project's existing worker/
// frontend/route-file separation convention.
function norm(s?: string | null): string {
  return (s || "")
    .replace(/[™®©]/g, "")
    .replace(/_/g, " ")
    .replace(/^ea sports\s+/i, "")
    .replace(
      /\b(game of the year|goty|definitive|deluxe|ultimate|enhanced|complete|remastered|remake|director'?s cut|gold|standard|digital)\s*(edition)?\b/gi,
      "",
    )
    .replace(/[:\-–—'".!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function resolveAppid(title: string): Promise<number | null> {
  // FIX (confirmed live, QA sweep): every badge query was showing UNCRACKED
  // regardless of title, including well-known heavily-cracked games (Elden
  // Ring, Crimson Desert). Root cause: cf.cacheEverything here let a single
  // transient/empty Steam storesearch response get cached at the edge for
  // the full cacheTtl (an hour), after which every request replayed that
  // same stuck empty result -- resolve.ts's handleResolve hits the exact
  // same endpoint but deliberately omits any caching for this precise
  // reason (see that file's own comment). cacheTtlByStatus restores the
  // caching benefit for a real 2xx response while never caching an error
  // status, so a bad response retries next request instead of getting
  // stuck for the old full-hour TTL.
  const r = await fetch("https://store.steampowered.com/api/storesearch/?term=" + enc(title) + "&l=english&cc=us", {
    cf: { cacheTtlByStatus: { "200-299": 3600, "300-599": 0 } },
  } as RequestInit);
  if (!r.ok) return null;
  const data = (await r.json()) as StoreSearchResponse;
  const target = norm(title);
  const app = (data.items || []).find((x) => x.type === "app" && norm(x.name) === target);
  return app ? app.id : null;
}

interface RawRelease {
  dirname: string;
  ext_info?: { type?: string; title?: string };
}
interface SearchReleasesResponse {
  results?: RawRelease[];
  p2p_results?: RawRelease[];
}

function parseBuildFromDirname(dn?: string): number | null {
  if (!dn) return null;
  const m = dn.match(/\bbuild[.\s]?(\d{5,9})\b/i);
  return m ? Number(m[1]) : null;
}

type BadgeStatus = "CRACKED" | "OUTDATED" | "UNCRACKED";

const COLORS: Record<BadgeStatus, string> = {
  CRACKED: "#2f7a4f",
  OUTDATED: "#b5602a",
  UNCRACKED: "#a13f34",
};

function badgeSvg(status: BadgeStatus): string {
  const leftText = "orlaz";
  const rightText = status;
  const leftW = 44;
  const rightW = rightText.length * 7 + 18;
  const width = leftW + rightW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${leftText}: ${rightText}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftW}" height="20" fill="#555"/>
    <rect x="${leftW}" width="${rightW}" height="20" fill="${COLORS[status]}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftW / 2}" y="14">${leftText}</text>
    <text x="${leftW + rightW / 2}" y="14">${rightText}</text>
  </g>
</svg>`;
}

function svgResponse(status: BadgeStatus, maxage: number): Response {
  return new Response(badgeSvg(status), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": `public, max-age=${maxage}` },
  });
}

/* Embeddable status badge for READMEs/forum signatures -- ?title=<game>,
   resolved server-side the same way resolve.ts does, cross-referenced
   against a live xREL search for that title. Cached at the edge since this
   is meant to be embedded and viewed by many different people, not
   re-hit constantly by the same viewer. */
export const handleBadge: Handler = async ({ request }) => {
  const url = new URL(request.url);
  const title = url.searchParams.get("title");
  if (!title) {
    return new Response("pass ?title=<game title>", { status: 400, headers: { "Content-Type": "text/plain" } });
  }

  const appid = await resolveAppid(title);
  // Short TTL, not the 1800s a genuine "no rows matched" result below gets --
  // this branch can't tell a real Steam miss apart from a transient failure,
  // so it shouldn't get cached with the same confidence either.
  if (appid == null) return svgResponse("UNCRACKED", 60);

  const currentBuild = await buildId(String(appid));

  // Same fix as resolveAppid above -- cacheTtlByStatus, so a bad/error
  // xREL response can't get stuck served to every viewer for 15 minutes,
  // while a real 2xx still caches normally.
  const searchRes = await fetch("https://api.xrel.to/v2/search/releases.json?q=" + enc(title) + "&scene=1&p2p=1&per_page=100", {
    cf: { cacheTtlByStatus: { "200-299": 900, "300-599": 0 } },
  } as RequestInit);
  if (!searchRes.ok) return svgResponse("UNCRACKED", 60);

  const data = (await searchRes.json()) as SearchReleasesResponse;
  const target = norm(title);
  const rows = [...(data.results || []), ...(data.p2p_results || [])].filter(
    (r) => r.ext_info?.type === "master_game" && norm(r.ext_info?.title) === target,
  );

  if (!rows.length) return svgResponse("UNCRACKED", 1800);

  const builds = rows.map((r) => parseBuildFromDirname(r.dirname)).filter((b): b is number => b != null);
  const status: BadgeStatus =
    builds.length && currentBuild != null ? (builds.some((b) => b >= currentBuild) ? "CRACKED" : "OUTDATED") : "CRACKED";

  return svgResponse(status, 1800);
};

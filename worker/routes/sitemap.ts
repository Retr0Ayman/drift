import type { Handler } from "../shared/types";
import { handleXrelBrowse } from "./xrel/browse";
import type { RawXrelRelease } from "../shared/xrel";

const BASE_URL = "https://drift.orlaz.workers.dev";
const STATIC_ROUTES = ["/", "/groups", "/digest", "/publishers", "/watchlist"];

const slugify = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

const escapeXml = (s: string): string => s.replace(/&/g, "&amp;");

/* Best-effort, not exhaustive: enumerates game/group URLs from page 1 of
   the live Windows browse feed (the same source useLiveCatalog starts
   from) -- full coverage of the catalog needs the Phase 3 database.
   Publishers aren't included: their names only come from Steam appdetails,
   which would mean one Steam call per game just to build a sitemap. Uses
   path-based BrowserRouter URLs (/game/..., /group/...). Best-effort only:
   full coverage needs the Phase 3 database. */
export const handleSitemap: Handler = async ({ env }) => {
  const urls = new Set<string>(STATIC_ROUTES);

  const browseRes = await handleXrelBrowse({
    request: new Request("https://internal.invalid/api/xrel/browse?page=1&per_page=100"),
    env,
  });
  if (browseRes.ok) {
    const data = (await browseRes.json()) as { list?: RawXrelRelease[] };
    for (const rel of data.list || []) {
      const title = rel.ext_info?.title;
      if (title) urls.add(`/game/${slugify(title)}`);
      if (rel.group_name) urls.add(`/group/${slugify(rel.group_name)}`);
    }
  }

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...urls].map((u) => `  <url><loc>${escapeXml(BASE_URL + u)}</loc></url>`).join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

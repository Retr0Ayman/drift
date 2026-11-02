import type { Handler } from "../shared/types";
import { json } from "../shared/http";

const MAXAGE = 60;

// Companion to /api/catalog's trimmed bulk payload (see that file's own
// comment) -- fetches the one field the bulk sync deliberately leaves out
// (desc) for exactly the one game GameDetail is currently showing, instead
// of paying for every game's description text on every page load. A single
// indexed point lookup, not a join -- cheap regardless of how large the
// catalog grows.
export const handleCatalogGame: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "pass ?id=<game id>" }, 0, 400);

  try {
    const row = await env.orlaz_catalog.prepare("SELECT desc FROM games WHERE id = ?").bind(id).first<{ desc: string | null }>();
    if (!row) return json({ error: "not found" }, 5, 404);
    return json({ desc: row.desc || "" }, MAXAGE);
  } catch {
    return json({ desc: "" }, 5);
  }
};

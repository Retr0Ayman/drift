import type { Handler } from "../shared/types";
import { json } from "../shared/http";

// Ambiguous chars (0/O, 1/I/L) dropped so a code read aloud or copied by
// hand doesn't get miskeyed on the other device.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;
const MAX_GAMES = 500;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/* No accounts -- same unauthenticated-but-unguessable model as
   ShareWatchlistButton's share link (src/components/watchlist/
   ShareWatchlistButton.tsx), just persisted server-side instead of encoded
   in a URL, so a second device can pull it down later instead of needing
   the first device to send a link at that exact moment. GET fetches the
   list for an existing code; POST creates a code (first push from a
   device) or overwrites an existing one's list (every later push,
   last-write-wins -- see migrations/0012's own comment). */
export const handleWatchlistSync: Handler = async ({ request, env }) => {
  const url = new URL(request.url);

  if (request.method === "GET") {
    const code = (url.searchParams.get("code") || "").toUpperCase();
    if (!code) return json({ error: "pass ?code=<sync code>" }, 0, 400);
    try {
      const row = await env.orlaz_catalog
        .prepare("SELECT game_ids FROM watchlist_sync WHERE code = ?")
        .bind(code)
        .first<{ game_ids: string }>();
      if (!row) return json({ error: "No watchlist found for that code" }, 0, 404);
      let gameIds: string[] = [];
      try {
        const parsed = JSON.parse(row.game_ids);
        if (Array.isArray(parsed)) gameIds = parsed.filter((id): id is string => typeof id === "string");
      } catch {
        gameIds = [];
      }
      return json({ gameIds }, 0);
    } catch {
      return json({ error: "Sync isn't set up yet" }, 0, 503);
    }
  }

  if (request.method === "POST") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 0, 400);
    }
    const { code: rawCode, gameIds } = (body as { code?: unknown; gameIds?: unknown }) || {};
    if (!Array.isArray(gameIds) || !gameIds.every((id) => typeof id === "string") || gameIds.length > MAX_GAMES) {
      return json({ error: `gameIds must be an array of strings (max ${MAX_GAMES})` }, 0, 400);
    }
    const code = typeof rawCode === "string" && rawCode.trim() ? rawCode.trim().toUpperCase() : generateCode();

    try {
      await env.orlaz_catalog
        .prepare("INSERT INTO watchlist_sync (code, game_ids, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET game_ids = excluded.game_ids, updated_at = excluded.updated_at")
        .bind(code, JSON.stringify(gameIds), Date.now())
        .run();
      return json({ code }, 0);
    } catch {
      return json({ error: "Sync isn't set up yet" }, 0, 503);
    }
  }

  return json({ error: "GET or POST only" }, 0, 405);
};

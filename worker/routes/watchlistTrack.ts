import type { Handler } from "../shared/types";
import { json } from "../shared/http";

// Fire-and-forget target for useWatchlist.ts's toggle-on -- records that one
// anonymous client watched one game today. INSERT OR IGNORE on the
// (game_id, client_id, day) primary key means a repeat toggle-on the same
// day (accidental double-click, a remount re-firing) is a no-op, not a
// second count -- see migrations/0012's own comment for why that dedup
// matters for /api/trending's honesty.
const MAX_ID_LEN = 128;

export const handleWatchlistTrack: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 0, 405);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid JSON body" }, 0, 400);
  }
  const { gameId, clientId } = (body as { gameId?: unknown; clientId?: unknown }) || {};
  if (
    typeof gameId !== "string" ||
    typeof clientId !== "string" ||
    !gameId ||
    !clientId ||
    gameId.length > MAX_ID_LEN ||
    clientId.length > MAX_ID_LEN
  ) {
    return json({ error: "gameId and clientId (strings) are required" }, 0, 400);
  }

  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.orlaz_catalog
      .prepare("INSERT OR IGNORE INTO watch_events (game_id, client_id, day) VALUES (?, ?, ?)")
      .bind(gameId, clientId, day)
      .run();
    return json({ tracked: true }, 0);
  } catch {
    // Migration not applied yet, or D1 genuinely unreachable -- this is a
    // best-effort popularity signal, not a critical write, so fail quiet
    // rather than surface a 500 for something the user didn't directly ask
    // for (the watch-toggle itself already succeeded client-side).
    return json({ tracked: false }, 0);
  }
};

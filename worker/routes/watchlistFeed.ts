import type { Handler } from "../shared/types";

const BASE_URL = "https://drift.orlaz.workers.dev";
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TEXT: Record<string, string> = { cracked: "has been cracked", denuvo_removed: "no longer uses Denuvo" };

/* /api/watchlist/<SYNC CODE>/feed.xml -- zero-permission fallback to push:
   an Atom feed of "cracked" / "lost Denuvo" events for the games on that
   watchlist sync code. Same unguessable-code model as watchlist sync. Only
   events that happened after the feed existed (watch_events is baselined,
   so history never floods it). */
export const handleWatchlistFeed: Handler = async ({ request, env }) => {
  const code = new URL(request.url).pathname.split("/")[3] || "";
  const db = env.orlaz_catalog;
  const row = await db.prepare("SELECT game_ids FROM watchlist_sync WHERE code = ?").bind(code.toUpperCase()).first<{ game_ids: string }>();
  if (!row) return new Response("No watchlist for that code", { status: 404 });
  let ids: string[] = [];
  try {
    const p = JSON.parse(row.game_ids);
    if (Array.isArray(p)) ids = p.filter((x): x is string => typeof x === "string").slice(0, 500);
  } catch {
    ids = [];
  }
  let events: Array<{ id: number; kind: string; game_id: string; title: string; created_at: number }> = [];
  if (ids.length) {
    // D1 caps bound parameters per statement; the 500-id watchlist cap is
    // chunked into <=50-id queries like the rest of this codebase.
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const r = await db
        .prepare(`SELECT e.id, e.kind, e.game_id, g.title, e.created_at FROM watch_events e JOIN games g ON g.id = e.game_id WHERE e.game_id IN (${chunk.map(() => "?").join(",")}) AND e.fanned_out = 1 AND e.created_at > (SELECT CAST(value AS INTEGER) FROM backfill_state WHERE key = 'watch_events_baseline') ORDER BY e.created_at DESC LIMIT 50`)
        .bind(...chunk)
        .all<{ id: number; kind: string; game_id: string; title: string; created_at: number }>();
      events.push(...(r.results || []));
    }
    events.sort((a, b) => b.created_at - a.created_at);
    events = events.slice(0, 50);
  }
  const updated = events[0]?.created_at ?? Date.now();
  const entries = events.map(
    (e) =>
      `  <entry>\n    <title>${esc(`${e.title} ${TEXT[e.kind] || "has an update"}`)}</title>\n` +
      `    <id>tag:drift.orlaz.workers.dev,2026:event-${e.id}</id>\n` +
      `    <link href="${BASE_URL}/game/${esc(e.game_id)}"/>\n` +
      `    <updated>${new Date(e.created_at).toISOString()}</updated>\n  </entry>`,
  );
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <title>orlaz — your watchlist</title>\n  <id>tag:drift.orlaz.workers.dev,2026:watchlist-${esc(code.toUpperCase())}</id>\n` +
    `  <link rel="self" href="${BASE_URL}/api/watchlist/${esc(code.toUpperCase())}/feed.xml"/>\n` +
    `  <updated>${new Date(updated).toISOString()}</updated>\n${entries.join("\n")}\n</feed>\n`;
  return new Response(body, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};

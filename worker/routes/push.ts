import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { isAllowedPushEndpoint } from "../shared/webpush";
import { isAdminAuthorized } from "../shared/adminAuth";
import { armTestEvent, runWatchEventsTick } from "../backfill/watchEvents";

const MAX_GAMES = 500;
const KIND_TEXT: Record<string, string> = { cracked: "has been cracked", denuvo_removed: "no longer uses Denuvo" };

async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await request.json();
    return b && typeof b === "object" ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* GET /api/push/key -> the public VAPID key the browser subscribes with. */
export const handlePushKey: Handler = async ({ env }) => {
  if (!env.VAPID_PUBLIC_KEY) return json({ error: "push not configured" }, 0, 503);
  return json({ key: env.VAPID_PUBLIC_KEY }, 3600);
};

/* POST /api/push/subscribe { endpoint, gameIds } -- replaces the endpoint's
   watched set. Stores the endpoint and game ids, nothing else. */
export const handlePushSubscribe: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 0, 405);
  const b = await body(request);
  const endpoint = typeof b?.endpoint === "string" ? b.endpoint : "";
  const gameIds = b?.gameIds;
  if (!isAllowedPushEndpoint(endpoint)) return json({ error: "unsupported push endpoint" }, 0, 400);
  if (!Array.isArray(gameIds) || gameIds.length > MAX_GAMES || !gameIds.every((g) => typeof g === "string" && g.length < 100)) {
    return json({ error: `gameIds must be an array of up to ${MAX_GAMES} strings` }, 0, 400);
  }
  const db = env.orlaz_catalog;
  const now = Date.now();
  const unique = [...new Set(gameIds as string[])];
  await db.batch([
    db.prepare("INSERT INTO push_subscriptions (endpoint, created_at, updated_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET updated_at = excluded.updated_at").bind(endpoint, now, now),
    db.prepare("DELETE FROM push_watch WHERE endpoint = ?").bind(endpoint),
    ...unique.map((g) => db.prepare("INSERT OR IGNORE INTO push_watch (endpoint, game_id) VALUES (?, ?)").bind(endpoint, g)),
  ]);
  return json({ ok: true, watching: unique.length }, 0);
};

/* POST /api/push/unsubscribe { endpoint } -- deletes everything stored for it. */
export const handlePushUnsubscribe: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 0, 405);
  const b = await body(request);
  const endpoint = typeof b?.endpoint === "string" ? b.endpoint : "";
  if (!endpoint) return json({ error: "endpoint required" }, 0, 400);
  const db = env.orlaz_catalog;
  await db.batch([
    db.prepare("DELETE FROM push_outbox WHERE endpoint = ?").bind(endpoint),
    db.prepare("DELETE FROM push_watch WHERE endpoint = ?").bind(endpoint),
    db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint),
  ]);
  return json({ ok: true }, 0);
};

/* POST /api/push/inbox { endpoint } -- called by the service worker after an
   empty push; returns (and marks delivered) what happened. */
export const handlePushInbox: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 0, 405);
  const b = await body(request);
  const endpoint = typeof b?.endpoint === "string" ? b.endpoint : "";
  if (!endpoint) return json({ error: "endpoint required" }, 0, 400);
  const db = env.orlaz_catalog;
  const rows = await db
    .prepare(
      `SELECT e.id, e.kind, e.game_id, g.title FROM push_outbox o
       JOIN alert_events e ON e.id = o.event_id JOIN games g ON g.id = e.game_id
       WHERE o.endpoint = ? AND o.sent_at IS NOT NULL AND o.delivered_at IS NULL ORDER BY e.id LIMIT 20`,
    )
    .bind(endpoint)
    .all<{ id: number; kind: string; game_id: string; title: string }>();
  const events = (rows.results || []).map((r) => ({ id: r.id, gameId: r.game_id, title: r.title, kind: r.kind, text: `${r.title} ${KIND_TEXT[r.kind] || "has an update"}` }));
  if (events.length) {
    await db.batch(events.map((e) => db.prepare("UPDATE push_outbox SET delivered_at = ? WHERE endpoint = ? AND event_id = ?").bind(Date.now(), endpoint, e.id)));
  }
  return json({ events }, 0);
};

/* Admin-gated: re-arm the notification for one game's event and run a tick
   now, so the whole path (fan-out -> push -> service worker -> inbox) can be
   exercised end to end. POST { gameId, kind }. */
export const handleAdminPushTest: Handler = async ({ request, env }) => {
  if (!isAdminAuthorized(request, env) || !env.ADMIN_TOKEN) return json({ error: "unauthorized" }, 0, 401);
  if (request.method !== "POST") return json({ error: "POST only" }, 0, 405);
  const b = await body(request);
  const gameId = typeof b?.gameId === "string" ? b.gameId : "";
  const kind = b?.kind === "denuvo_removed" ? "denuvo_removed" : "cracked";
  const exists = gameId ? await env.orlaz_catalog.prepare("SELECT 1 FROM games WHERE id = ?").bind(gameId).first() : null;
  if (!exists) return json({ error: "no such game" }, 0, 404);
  await armTestEvent(env.orlaz_catalog, gameId, kind);
  const result = await runWatchEventsTick(env);
  return json({ ok: true, result }, 0);
};

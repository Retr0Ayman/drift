import type { Env } from "../shared/env";
import { getBackfillState, setBackfillState } from "./db";
import { remainingSubrequests } from "../shared/subrequestBudget";
import { sendTickle } from "../shared/webpush";

/* Watchlist alerts, piggybacking on data the pipeline already writes -- no new
   external polling. One tick: (1) detect new events from D1, (2) fan each out
   to the endpoints watching that game, (3) send a bounded number of pushes.
   The first run records a BASELINE (every game already cracked / already
   Denuvo-free) as fanned-out, so nobody is notified about history. */

const RECENT_WINDOW_MS = 3 * 86400_000;
const MAX_FAN_EVENTS = 20;
const MAX_SENDS = 10;

async function baseline(db: D1Database): Promise<void> {
  if (await getBackfillState(db, "watch_events_baseline")) return;
  const now = Date.now();
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO watch_events (game_id, kind, event_ts, created_at, fanned_out)
       SELECT game_id, 'cracked', MIN(ts) * 1000, ?, 1 FROM releases WHERE is_repack = 0 AND is_anonymous = 0 GROUP BY game_id`,
    ).bind(now),
    db.prepare(
      `INSERT OR IGNORE INTO watch_events (game_id, kind, event_ts, created_at, fanned_out)
       SELECT id, 'denuvo_removed', denuvo_removed_at, ?, 1 FROM games WHERE denuvo_removed_at IS NOT NULL`,
    ).bind(now),
  ]);
  await setBackfillState(db, "watch_events_baseline", String(now));
}

export async function detectWatchEvents(db: D1Database): Promise<number> {
  const now = Date.now();
  // Only games whose releases moved recently (last_release_ts is indexed).
  const cracked = await db
    .prepare(
      `INSERT OR IGNORE INTO watch_events (game_id, kind, event_ts, created_at)
       SELECT g.id, 'cracked', MIN(r.ts) * 1000, ?
       FROM games g JOIN releases r ON r.game_id = g.id AND r.is_repack = 0 AND r.is_anonymous = 0
       WHERE g.last_release_ts > ? GROUP BY g.id`,
    )
    .bind(now, Math.floor((now - RECENT_WINDOW_MS) / 1000))
    .run();
  const denuvo = await db
    .prepare(
      `INSERT OR IGNORE INTO watch_events (game_id, kind, event_ts, created_at)
       SELECT id, 'denuvo_removed', denuvo_removed_at, ? FROM games WHERE denuvo_removed_at IS NOT NULL`,
    )
    .bind(now)
    .run();
  return (cracked.meta.changes || 0) + (denuvo.meta.changes || 0);
}

async function fanOut(db: D1Database): Promise<void> {
  const pending = await db.prepare("SELECT id, game_id FROM watch_events WHERE fanned_out = 0 ORDER BY id LIMIT ?").bind(MAX_FAN_EVENTS).all<{ id: number; game_id: string }>();
  const rows = pending.results || [];
  if (!rows.length) return;
  await db.batch(
    rows.flatMap((e) => [
      db.prepare("INSERT OR IGNORE INTO push_outbox (event_id, endpoint) SELECT ?, endpoint FROM push_watch WHERE game_id = ?").bind(e.id, e.game_id),
      db.prepare("UPDATE watch_events SET fanned_out = 1 WHERE id = ?").bind(e.id),
    ]),
  );
}

async function sendPending(env: Env): Promise<{ sent: number; gone: number }> {
  const out = { sent: 0, gone: 0 };
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return out;
  const db = env.orlaz_catalog;
  const eps = await db.prepare("SELECT DISTINCT endpoint FROM push_outbox WHERE sent_at IS NULL LIMIT ?").bind(MAX_SENDS).all<{ endpoint: string }>();
  for (const { endpoint } of eps.results || []) {
    const left = remainingSubrequests();
    if (left !== null && left < 3) break;
    const res = await sendTickle(endpoint, env.VAPID_PRIVATE_JWK, env.VAPID_PUBLIC_KEY);
    if (res === "sent") {
      await db.prepare("UPDATE push_outbox SET sent_at = ? WHERE endpoint = ? AND sent_at IS NULL").bind(Date.now(), endpoint).run();
      out.sent++;
    } else if (res === "gone") {
      await db.batch([
        db.prepare("DELETE FROM push_outbox WHERE endpoint = ?").bind(endpoint),
        db.prepare("DELETE FROM push_watch WHERE endpoint = ?").bind(endpoint),
        db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint),
      ]);
      out.gone++;
    }
  }
  return out;
}

export async function runWatchEventsTick(env: Env): Promise<{ detected: number; sent: number; gone: number }> {
  const db = env.orlaz_catalog;
  await baseline(db);
  const detected = await detectWatchEvents(db);
  await fanOut(db);
  const { sent, gone } = await sendPending(env);
  if (detected || sent || gone) console.log(`watchEvents detected=${detected} sent=${sent} gone=${gone}`);
  return { detected, sent, gone };
}

/* Admin test hook: record a synthetic-free test of the pipeline for a game by
   re-arming an existing event (or creating one) so the next tick fans it out
   to that game's watchers. Never invents a crack -- it only re-fires the
   notification for a real event row, or for a game the admin names. */
export async function armTestEvent(db: D1Database, gameId: string, kind: "cracked" | "denuvo_removed"): Promise<void> {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO watch_events (game_id, kind, event_ts, created_at, fanned_out) VALUES (?, ?, ?, ?, 1)").bind(gameId, kind, Date.now(), Date.now()),
    db.prepare("DELETE FROM push_outbox WHERE event_id = (SELECT id FROM watch_events WHERE game_id = ? AND kind = ?)").bind(gameId, kind),
    db.prepare("UPDATE watch_events SET fanned_out = 0, created_at = ? WHERE game_id = ? AND kind = ?").bind(Date.now(), gameId, kind),
  ]);
}

import type { Env } from "../shared/env";
import { getBackfillState, setBackfillState } from "./db";
import { lookupDrmForAppids } from "./pcgamingwiki";

/* One-time reconciliation pass for the false-Denuvo backlog (see db.ts's
   own fix comment): every game already written to D1 before that fix got
   tags = ["Denuvo"] baked in at INSERT time, and normal sync ticks won't
   revisit most of them on their own -- steady-state sync only re-touches
   whatever's currently near the top of the browse feed, and the deep/
   archive backfills only ever visit a title once, so an already-fully-
   processed historical game would otherwise carry the false tag
   indefinitely. This walks every row in `games` exactly once, ordered by
   id, tracking a resumable cursor in backfill_state the same way
   run.ts's browse-page backfill does -- a real per-appid lookup, not
   another guess, replaces tags for every row it can find a match for; a
   row with no resolved appid or no PCGamingWiki match is left as the
   empty array the code fix already gives it.

   Deliberately its own cron cadence, not folded into the existing browse/
   archive backfills -- this touches every row regardless of xREL recency,
   which is a different traversal than either of those already do. */
const PAGE_SIZE = 100;

interface GameRow {
  id: string;
  appid: number | null;
}

export async function runDrmBackfillTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  if ((await getBackfillState(db, "drm_backfill_phase")) === "done") {
    await runDrmRecheckTick(env);
    return;
  }

  const cursor = (await getBackfillState(db, "drm_backfill_cursor")) || "";
  const { results } = await db
    .prepare("SELECT id, appid FROM games WHERE id > ? ORDER BY id LIMIT ?")
    .bind(cursor, PAGE_SIZE)
    .all<GameRow>();
  const rows = results || [];

  if (!rows.length) {
    await setBackfillState(db, "drm_backfill_phase", "done");
    return;
  }

  const withAppid = rows.filter((r): r is GameRow & { appid: number } => r.appid != null);
  const drm = await lookupDrmForAppids(withAppid.map((r) => r.appid));

  const statements = withAppid
    .filter((r) => drm.has(r.appid)) // no match found -- leave the row's existing (already-blanked) tags alone
    .map((r) => {
      const result = drm.get(r.appid)!;
      return db
        .prepare("UPDATE games SET tags = ?, former_tags = ? WHERE id = ?")
        .bind(JSON.stringify(result.tags), JSON.stringify(result.formerTags), r.id);
    });
  if (statements.length) await db.batch(statements);

  await setBackfillState(db, "drm_backfill_cursor", rows[rows.length - 1].id);
}

// Small and cheap, shares the DRM_BACKFILL_CRON slot (runs every 5
// minutes, see worker/index.ts) alongside the one-time backlog pass above.
const RECHECK_BATCH_SIZE = 40;

/* FIX (confirmed gap, 2026-07-24): the one-time pass above walks every row
   exactly once, then permanently stops (drm_backfill_phase = "done") --
   nothing ever re-queries an already-visited row after that, so a real,
   later DRM change on PCGamingWiki's side (e.g. 007: First Light having
   its Denuvo removed post-launch) had no path to ever reach this site's
   tags column; it would show the stale "Denuvo" tag forever. This is the
   ongoing side: oldest-checked-first (drm_checked_at, migrations/0009 --
   NULL/never-checked rows sort first in SQLite's default ASC order), small
   batch, cycles the whole games table forever -- same "deliberately never
   reaches a terminal done state" discipline runEnrichmentRepairTick already
   uses, so a real DRM removal (or addition) eventually gets picked up
   automatically instead of needing another manual one-off backfill. */
export async function runDrmRecheckTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const { results } = await db
    .prepare("SELECT id, appid FROM games WHERE appid IS NOT NULL ORDER BY drm_checked_at ASC LIMIT ?")
    .bind(RECHECK_BATCH_SIZE)
    .all<{ id: string; appid: number }>();
  const rows = results || [];
  if (!rows.length) return;

  const drm = await lookupDrmForAppids(rows.map((r) => r.appid));
  const now = Date.now();
  const statements = rows.map((r) => {
    const result = drm.get(r.appid);
    return result
      ? db
          .prepare("UPDATE games SET tags = ?, former_tags = ?, drm_checked_at = ? WHERE id = ?")
          .bind(JSON.stringify(result.tags), JSON.stringify(result.formerTags), now, r.id)
      : // no PCGamingWiki match this time either -- still stamp drm_checked_at so this row
        // cycles to the back of the queue instead of being retried every single tick forever
        db.prepare("UPDATE games SET drm_checked_at = ? WHERE id = ?").bind(now, r.id);
  });
  await db.batch(statements);
}

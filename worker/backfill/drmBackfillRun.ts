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
  if ((await getBackfillState(db, "drm_backfill_phase")) === "done") return;

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
    .map((r) => db.prepare("UPDATE games SET tags = ? WHERE id = ?").bind(JSON.stringify(drm.get(r.appid)), r.id));
  if (statements.length) await db.batch(statements);

  await setBackfillState(db, "drm_backfill_cursor", rows[rows.length - 1].id);
}

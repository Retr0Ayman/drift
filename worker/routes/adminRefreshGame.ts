import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { enrichFromSteam } from "../backfill/resolve";
import { refreshStaleGame } from "../backfill/db";

interface GameRow {
  id: string;
  appid: number | null;
  title: string;
}

/* One-off manual re-enrichment for a single already-known game, by id --
   same enrichFromSteam/refreshStaleGame path worker/backfill/refreshStale.ts
   already runs on its own oldest-updated-first cron cycle, just callable
   on demand for one specific title instead of waiting for that cycle to
   reach it naturally. Confirmed live need: verifying the accent-color
   legibility fix (colorExtract.ts's dampenForLegibility) against the
   actual reported case (Watch Dogs 2's #c79340 clash) needed a way to
   force that one game's stored accent to recompute right now, not
   whenever refreshStale's batch happens to cycle back to it. Same "no
   auth, read+recompute only, safe to leave in place" reasoning as
   /api/group-reliability/recompute -- this can't insert/delete anything,
   only re-runs the exact same enrichment a game would eventually get
   anyway. */
export const handleAdminRefreshGame: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "pass ?id=<game-id>" }, 5, 400);

  const row = await env.orlaz_catalog.prepare("SELECT id, appid, title FROM games WHERE id = ?").bind(id).first<GameRow>();
  if (!row) return json({ error: "no game with that id" }, 5, 404);
  if (!row.appid) return json({ error: "game has no resolved appid" }, 5, 400);

  try {
    const enrichment = await enrichFromSteam(env, row.appid);
    if (!enrichment) return json({ error: "Steam enrichment failed" }, 5, 502);
    await refreshStaleGame(env.orlaz_catalog, row.id, row.title, enrichment);
    return json(
      { refreshed: true, id: row.id, accentColorPrimary: enrichment.accentColorPrimary, accentColorSecondary: enrichment.accentColorSecondary },
      5,
    );
  } catch (e) {
    return json({ refreshed: false, error: e instanceof Error ? e.message : String(e) }, 5, 500);
  }
};

import type { Env } from "../shared/env";
import { planRowUpdate, type StoredRow } from "./denuvoDecision";
import { resolvePcgwBatch, type PcgwOutcome } from "./pcgamingwiki";
import { recordSourceResult } from "./sourceHealth";
import { fetchSteamNotice, type SteamNotice } from "./steamDrm";

/* Ongoing DRM recheck (shares the 5-minute cron slot, see worker/index.ts).

   Rebuilt 2026-11-05 after PCGamingWiki's Cargo API was switched off: the
   old tick got `permissiondenied`, skipped it, and stamped drm_checked_at
   anyway -- 0 removals ever detected. Now:
     - titles that have ever carried Denuvo ("denuvo_watch") are checked
       against BOTH sources every cycle (PCGamingWiki page wikitext + the
       Steam store's drm_notice), oldest-checked first;
     - everything else only gets the cheap Steam notice sweep, which can
       flag a newly Denuvo'd title;
     - a lookup that FAILED never stamps drm_checked_at, never changes
       tags, and is recorded in per-source health (surfaced on the tracker
       page and in `wrangler tail`).
   This is the only writer of tags / former_tags / denuvo_removed_* (the
   Steam enrichment path no longer overwrites them). Decision logic lives in
   denuvoDecision.ts. denuvo_removed_at is set only from a real removal
   evidence -- a dated PCGamingWiki ref, or our own observed Steam
   transition -- never guessed. */

/* Sized for the Workers Free 50-subrequest cap (see worker/index.ts's slot
   table): this tick runs ALONE in its own cron slot under a 38-attempt
   budget. Normal cost: 12 Steam fetches + 1 PCGamingWiki wikitext batch
   (+ at most 2 per title needing a search fallback, only on the first
   cycle for a title, since the matched page is cached). Anything the budget
   cuts off is deferred, never stamped or counted as a failure. */
const WATCH_BATCH = 6;
const SWEEP_BATCH = 6;
const STEAM_GAP_MS = 300;

interface Row extends StoredRow {
  id: string;
  appid: number;
  title: string;
}

const COLS = "id, appid, title, tags, former_tags, steam_drm_notice, pcgw_page, denuvo_watch, denuvo_removed_at, denuvo_removed_kind";

export async function runDrmRecheckTick(env: Env): Promise<void> {
  const db = env.orlaz_catalog;
  const { results: watch } = await db
    .prepare(`SELECT ${COLS} FROM games WHERE appid IS NOT NULL AND denuvo_watch = 1 ORDER BY drm_checked_at ASC LIMIT ?`)
    .bind(WATCH_BATCH)
    .all<Row>();
  const { results: sweep } = await db
    .prepare(`SELECT ${COLS} FROM games WHERE appid IS NOT NULL AND denuvo_watch = 0 ORDER BY steam_drm_checked_at ASC LIMIT ?`)
    .bind(SWEEP_BATCH)
    .all<Row>();
  const watchRows = watch || [];
  const sweepRows = sweep || [];
  if (!watchRows.length && !sweepRows.length) return;

  // Steam notices for every row this tick (sequential, small gap).
  const steam = new Map<string, SteamNotice>();
  let steamFailure: { status: number | null; reason: string } | null = null;
  let steamAttempted = 0; // real answers or failures (deferrals don't count)
  for (const r of [...watchRows, ...sweepRows]) {
    if (steamFailure) break; // first failure aborts the rest: no hammering
    if (steamAttempted) await new Promise((res) => setTimeout(res, STEAM_GAP_MS));
    const n = await fetchSteamNotice(r.appid);
    if (n.status === "deferred") break; // budget spent: leave the rest for the next tick
    steamAttempted++;
    steam.set(r.id, n);
    if (n.status === "failed") steamFailure = { status: n.httpStatus, reason: n.reason };
  }
  if (steamAttempted) {
    if (steamFailure) await recordSourceResult(db, "steam", false, { status: steamFailure.status, error: steamFailure.reason });
    else await recordSourceResult(db, "steam", true);
  }

  // PCGamingWiki pages for the watch rows only.
  let pcgw = new Map<string, PcgwOutcome>();
  if (watchRows.length) {
    const res = await resolvePcgwBatch(watchRows.map((r) => ({ id: r.id, appid: r.appid, title: r.title, knownPage: r.pcgw_page })));
    pcgw = res.outcomes;
    const answered = [...res.outcomes.values()].some((o) => o.status !== "deferred");
    if (res.failure) await recordSourceResult(db, "pcgamingwiki", false, { status: res.failure.status, error: res.failure.reason });
    else if (answered) await recordSourceResult(db, "pcgamingwiki", true);
  }

  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const r of [...watchRows, ...sweepRows]) {
    const plan = planRowUpdate(r, pcgw.get(r.id), steam.get(r.id), now);
    if (!plan) continue; // failed lookup(s): write nothing, stamp nothing
    if (plan.decision.conflict) console.warn(`[drm] conflict on "${r.title}" (${r.appid}): ${plan.decision.note}`);
    if (plan.decision.state === "removed" && plan.decision.removal && r.denuvo_removed_at == null)
      console.log(`[drm] denuvo removal recorded for "${r.title}" (${r.appid}): ${plan.decision.removal.kind} via ${plan.decision.removal.source}`);
    const keys = Object.keys(plan.sets);
    statements.push(
      db
        .prepare(`UPDATE games SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .bind(...keys.map((k) => plan.sets[k]), r.id),
    );
  }
  if (statements.length) await db.batch(statements);
}

/* Kept as the cron entry point's name; the old one-time Cargo backfill pass
   is gone (its data source no longer exists). */
export async function runDrmBackfillTick(env: Env): Promise<void> {
  await runDrmRecheckTick(env);
}

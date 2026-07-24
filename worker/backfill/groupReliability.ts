import type { Env } from "../shared/env";
import { getBackfillState, setBackfillState } from "./db";
import { slugify } from "./parse";

/* orlaz group reliability star rating -- see migrations/0008's own comment
   and orlaz-group-reliability-star-rating.md for the full investigation.
   Recap of what's real and what got dropped:

   - Nuke status: checked live against both xREL endpoints this project
     already pulls (release/browse_category.json's scene rows carry a real
     `flags` object; v2/p2p/releases.json's P2P rows carry none at all) --
     every sample checked came back an empty {} on the scene side and
     absent entirely on the P2P side. Not usable. Dropped, not guessed at.
   - PROPER/CRACKFIX/NFOFIX/DIRFIX follow-up releases: confirmed live and
     real -- scanning sampled production release notes found these tokens
     in ~3.7% of releases (12/324), spanning multiple real groups (CPY,
     3DM, RUNE, REVOLT, Voksi, voices38, RVTFiX). This is the one directly
     usable defect signal, and it's already buildable from columns this
     table already has (group_name, note, first_seen_ts, is_repack,
     is_anonymous) -- no new xREL calls needed.
   - Time-to-fix: usable as a secondary, informational-only stat
     (avg_fix_days) for cross-group corrections specifically -- see below
     for why same-group self-corrections can't recover a real duration.
   - Release volume: real but explicitly NOT fed into the star math --
     see MIN_SAMPLE's own comment. */

// A scene-standard "this replaces a defective predecessor" tag -- NOT
// "fix"/"repack"/"update" alone, which are too ambiguous (a bare "fix" is
// often just a routine follow-up for a new game patch, not an admission
// the original crack was broken; "repack" is already its own separate
// is_repack classification and isn't inherently a quality signal). PROPER
// and CRACKFIX/NFOFIX/DIRFIX are real, well-established scene release-type
// tags specifically for "the previous release was wrong."
const CORRECTION_TAG_RE = /\b(proper|crackfix|nfofix|dirfix)\b/i;

// Below this many genuine (non-repack, non-anonymous) releases, a group's
// correction rate is too small a sample to mean anything -- a group with 1
// release and 0 corrections would otherwise show a confident 5 stars off a
// single data point, exactly the kind of fabricated-looking precision this
// whole feature exists to avoid. Below this, stars is left NULL ("not
// enough data yet"), same discipline as firstSeenVerified/crackTimingDays
// elsewhere in this codebase.
const MIN_SAMPLE = 5;

// Recomputed at most this often -- a full-table pass is cheap in absolute
// terms (a handful of thousand rows, one query) but there's no reason to
// redo it every 15-minute steady-state tick when the underlying data only
// shifts by a handful of rows per tick. Checked (cheap, one backfill_state
// read) on every steady-state tick; the actual full pass only runs when
// this window has elapsed.
const RECOMPUTE_INTERVAL_MS = 60 * 60 * 1000;

interface ReleaseRow {
  game_id: string;
  group_name: string;
  note: string | null;
  first_seen_ts: number | null;
  update_count: number;
}

interface GroupAgg {
  name: string;
  genuine: number;
  corrected: Set<string>; // game_ids already credited as "needed a fix" for this group -- one credit per game, never double-counted
  fixDaysSamples: number[];
}

function starsFromRate(rate: number): number {
  if (rate >= 0.97) return 5;
  if (rate >= 0.93) return 4.5;
  if (rate >= 0.85) return 4;
  if (rate >= 0.75) return 3.5;
  if (rate >= 0.6) return 3;
  if (rate >= 0.4) return 2;
  return 1;
}

export function computeGroupReliability(rows: ReleaseRow[]): Map<string, GroupAgg & { stars: number | null; avgFixDays: number | null }> {
  const agg = new Map<string, GroupAgg>();
  function get(name: string): GroupAgg {
    const key = name.toLowerCase();
    let a = agg.get(key);
    if (!a) {
      a = { name, genuine: 0, corrected: new Set(), fixDaysSamples: [] };
      agg.set(key, a);
    }
    return a;
  }

  for (const r of rows) get(r.group_name).genuine++;

  // Self-correction: a group's own latest known row for a game is itself a
  // correction release (update_count > 1 means there was an earlier state
  // this overwrote, and that earlier state is exactly what needed fixing).
  // No recoverable duration here -- the original raw timestamp this
  // replaced is gone (UNIQUE(game_id, group_name) collapse), so this only
  // ever contributes to correction_count, never avg_fix_days.
  for (const r of rows) {
    if (r.update_count > 1 && CORRECTION_TAG_RE.test(r.note || "")) {
      get(r.group_name).corrected.add(r.game_id);
    }
  }

  // Cross-group correction: for each game, walk its genuine releases in
  // chronological (first_seen_ts) order; whenever a release's note carries
  // a correction tag, credit the nearest STRICTLY EARLIER release from a
  // DIFFERENT group for that same game -- the crack that was actually
  // current right before the fix landed, not necessarily the game's
  // globally-first release (a fix corrects whatever it's replacing, not
  // ancient history).
  const byGame = new Map<string, ReleaseRow[]>();
  for (const r of rows) {
    if (r.first_seen_ts == null) continue;
    const list = byGame.get(r.game_id);
    if (list) list.push(r);
    else byGame.set(r.game_id, [r]);
  }
  for (const gameRows of byGame.values()) {
    gameRows.sort((a, b) => (a.first_seen_ts as number) - (b.first_seen_ts as number));
    for (let i = 1; i < gameRows.length; i++) {
      const corrector = gameRows[i];
      if (!CORRECTION_TAG_RE.test(corrector.note || "")) continue;
      for (let j = i - 1; j >= 0; j--) {
        const original = gameRows[j];
        if (original.group_name.toLowerCase() === corrector.group_name.toLowerCase()) continue;
        const a = get(original.group_name);
        a.corrected.add(original.game_id);
        a.fixDaysSamples.push(((corrector.first_seen_ts as number) - (original.first_seen_ts as number)) / 86400);
        break;
      }
    }
  }

  const out = new Map<string, GroupAgg & { stars: number | null; avgFixDays: number | null }>();
  for (const [key, a] of agg) {
    const avgFixDays = a.fixDaysSamples.length
      ? Math.round((a.fixDaysSamples.reduce((s, d) => s + d, 0) / a.fixDaysSamples.length) * 10) / 10
      : null;
    const stars = a.genuine >= MIN_SAMPLE ? starsFromRate(1 - a.corrected.size / a.genuine) : null;
    out.set(key, { ...a, stars, avgFixDays });
  }
  return out;
}

export async function runGroupReliabilityTick(env: Env, force = false): Promise<{ ran: boolean; groups?: number }> {
  const db = env.orlaz_catalog;
  const lastRun = Number((await getBackfillState(db, "group_reliability_computed_at")) || "0");
  if (!force && Date.now() - lastRun < RECOMPUTE_INTERVAL_MS) return { ran: false };

  const { results } = await db
    .prepare("SELECT game_id, group_name, note, first_seen_ts, update_count FROM releases WHERE is_repack = 0 AND is_anonymous = 0")
    .all<ReleaseRow>();
  const rows = results || [];
  if (!rows.length) return { ran: false };

  const computed = computeGroupReliability(rows);
  const now = Date.now();
  const statements = [...computed.values()].map((a) =>
    db
      .prepare(
        `INSERT INTO group_reliability (group_key, group_name, genuine_count, correction_count, avg_fix_days, stars, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(group_key) DO UPDATE SET
           group_name = excluded.group_name, genuine_count = excluded.genuine_count,
           correction_count = excluded.correction_count, avg_fix_days = excluded.avg_fix_days,
           stars = excluded.stars, computed_at = excluded.computed_at`,
      )
      .bind(slugify(a.name), a.name, a.genuine, a.corrected.size, a.avgFixDays, a.stars, now),
  );
  await db.batch(statements);
  await setBackfillState(db, "group_reliability_computed_at", String(now));
  return { ran: true, groups: statements.length };
}

import type { Game } from "../types/game";
import { slugify } from "./format";
import type { DenuvoRemovalStat } from "../hooks/useDenuvoRemovalStats";

export const DENUVO_TAG = "Denuvo Anti-Tamper";

export function hasDenuvoNow(game: Game): boolean {
  return (game.tags || []).includes(DENUVO_TAG);
}

/* Real days since the game's own Steam release date -- null (never a
   fabricated 0) when `released` can't be parsed. */
export function daysSinceRelease(game: Game): number | null {
  if (!game.released) return null;
  const t = Date.parse(game.released);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export interface RemovalPatternMatch {
  stat: DenuvoRemovalStat;
  dayOfWindow: number;
  /* Distance (in days) from this game's current day-count to its
     publisher's real median removal day -- used purely to sort the
     tracker page ("closest to their publisher's typical removal window"
     first), never displayed as a countdown or promise. */
  proximity: number;
}

/* Only returns a match when the publisher has a CONFIDENT median
   (worker/backfill/denuvoRemoval.ts's MIN_SAMPLE gate) -- a thin-sample
   publisher is surfaced separately on the dedicated tracker page as "not
   enough data," not silently folded into this per-game note. */
export function removalPatternFor(game: Game, stats: Record<string, DenuvoRemovalStat>): RemovalPatternMatch | null {
  if (!game.publisher) return null;
  const stat = stats[slugify(game.publisher)];
  if (!stat || stat.median_days == null) return null;
  const day = daysSinceRelease(game);
  if (day == null) return null;
  return { stat, dayOfWindow: day, proximity: Math.abs(day - stat.median_days) };
}

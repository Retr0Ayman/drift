import type { Game } from "../../types/game";
import { useDenuvoRemovalStats } from "../../hooks/useDenuvoRemovalStats";
import { hasDenuvoNow, removalPatternFor } from "../../lib/denuvoRemoval";
import "./DenuvoRemovalNote.css";

/* Real, honest historical-pattern note for currently-Denuvo'd games whose
   publisher has a confident computed removal median (see
   worker/backfill/denuvoRemoval.ts) -- never a promise or guarantee this
   specific game's Denuvo will be removed, just what this publisher's own
   real track record looks like. Renders nothing at all (not an "unrated"
   placeholder) when the game isn't Denuvo'd, has no publisher, or the
   publisher doesn't yet have enough confirmed removals for a real median
   -- that thin-data case is handled on the dedicated tracker page instead,
   where "not enough data yet" is worth stating explicitly; here it would
   just be noise on every other game's page. */
export default function DenuvoRemovalNote({ game }: { game: Game }) {
  const { data } = useDenuvoRemovalStats();
  if (!hasDenuvoNow(game)) return null;
  const match = removalPatternFor(game, data);
  if (!match) return null;

  const { stat, dayOfWindow } = match;
  return (
    <p className="denuvo-removal-note">
      {stat.publisher_name} has historically removed Denuvo at a median of {stat.median_days} day
      {stat.median_days === 1 ? "" : "s"} post-launch (range {stat.min_days}–{stat.max_days}, {stat.sample_count} confirmed
      removal{stat.sample_count === 1 ? "" : "s"}) — this game is at day {dayOfWindow} since release.
    </p>
  );
}

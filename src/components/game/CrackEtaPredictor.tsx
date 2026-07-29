import type { Game } from "../../types/game";
import { useCrackEta } from "../../hooks/useCrackEta";
import { buildCrackEtaBreakdown, isEtaEligible } from "../../lib/crackEta";
import GlassPanel from "../ui/GlassPanel";
import "./CrackEtaPredictor.css";

/* orlaz's Crack ETA Predictor -- the flagship differentiator. Deliberately
   NOT another AI-generated blurb (contrast with CrackOutlook right above
   it in the tab): every number here comes straight from worker/backfill/
   crackEta.ts's pure D1 aggregate over this catalog's own real release
   history (releases.first_seen_ts / first_seen_verified, restricted to
   genuine traditional cracks of Denuvo-protected titles), never an LLM
   guessing from general knowledge. Same "show your work" transparency as
   StarRating's tooltip, just as a full inline breakdown instead of a
   hover, since this is meant to read as a computed statistic a visitor can
   re-check, not an opaque prediction.

   Only rendered for a game that's currently Denuvo'd with no traditional
   crack yet (isEtaEligible) -- for anything else, an ETA to a traditional
   crack is either already moot (one exists) or not about Denuvo at all. */
export default function CrackEtaPredictor({ game }: { game: Game }) {
  const { data, loading } = useCrackEta();
  if (!isEtaEligible(game) || loading) return null;

  const breakdown = buildCrackEtaBreakdown(game, data.publishers, data.groups);
  if (!breakdown) return null;

  const { publisherStat, candidateGroups } = breakdown;
  const confident = !!publisherStat && publisherStat.median_days != null;

  return (
    <GlassPanel className="crack-eta" frost>
      <div className="crack-eta-h">Crack ETA — historical pattern</div>

      {confident ? (
        <p className="crack-eta-lead">
          Historically, traditional cracks for {publisherStat!.name}'s Denuvo titles have landed{" "}
          {publisherStat!.min_days}–{publisherStat!.max_days} days after release (median {publisherStat!.median_days}d,{" "}
          {publisherStat!.sample_count} sample{publisherStat!.sample_count === 1 ? "" : "s"}).
        </p>
      ) : (
        <p className="crack-eta-status">
          {publisherStat
            ? `Only ${publisherStat.sample_count} tracked Denuvo title${publisherStat.sample_count === 1 ? "" : "s"} for ${game.publisher} so far — not enough data for a confident estimate yet.`
            : `No tracked traditional-crack history yet for ${game.publisher || "this publisher"}'s Denuvo titles.`}
        </p>
      )}

      {candidateGroups.length ? (
        <div className="crack-eta-groups">
          <div className="crack-eta-groups-h">Groups with a track record on Denuvo AAA titles</div>
          <ul>
            {candidateGroups.map((g) => (
              <li key={g.name}>
                <span className="crack-eta-group-name">{g.name}</span>
                <span className="crack-eta-group-stat">
                  {g.median_days != null ? `median ${g.median_days}d (${g.sample_count} samples)` : `${g.sample_count} tracked, not enough for a median`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="crack-eta-disclaimer">Based purely on this catalog's own tracked release history — a historical pattern, not a guarantee.</p>
    </GlassPanel>
  );
}

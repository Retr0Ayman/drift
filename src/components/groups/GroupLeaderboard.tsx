import { Link } from "react-router-dom";
import { colorForName } from "../../lib/format";
import { RATING_TIERS } from "../../lib/groups";
import GlassPanel from "../ui/GlassPanel";
import type { GroupReliability } from "../../hooks/useGroupReliability";
import "./GroupLeaderboard.css";

export interface RankedGroup {
  key: string;
  name: string;
  starred: boolean;
  reliability: GroupReliability;
  rate: number; // 0..1, the exact correction-free rate stars is banded from -- see the sort below
}

/* A star count alone bands dozens of real correction rates into 7 buckets
   (starsFromRate in worker/backfill/groupReliability.ts) -- two groups
   sitting at 0.97 and 1.0 clean-release rate both read as "5 stars" with no
   way to tell them apart. Never invents a number -- every input is already
   sitting in the group_reliability row this group's card StarRating
   tooltip reads from.

   Sectioned by tier (same RATING_TIERS the main card grid uses) rather
   than one flat rank list -- within a tier, starred groups (the small,
   real, curated set this app already directly polls -- DenuvOwO, voices38)
   sort first for quick recognition, then by the real rate/sample-size same
   as before. A compact sidebar widget, not a full leaderboard page -- lives
   next to the tier grid, not above it. */
export default function GroupLeaderboard({ groups }: { groups: RankedGroup[] }) {
  if (!groups.length) return null;
  const tiers = RATING_TIERS.map((stars) => ({
    stars,
    groups: groups
      .filter((g) => g.reliability.stars === stars)
      .sort((a, b) => Number(b.starred) - Number(a.starred) || b.rate - a.rate || b.reliability.genuine_count - a.reliability.genuine_count),
  })).filter((t) => t.groups.length);

  return (
    <GlassPanel strong className="leaderboard-panel">
      <div className="leaderboard-head">
        <span className="leaderboard-title">Leaderboard</span>
        <span className="leaderboard-sub">By star tier, real clean-release rate</span>
      </div>
      {tiers.map((t) => (
        <div className="leaderboard-tier" key={t.stars}>
          <div className="leaderboard-tier-label">{t.stars}★</div>
          <div className="leaderboard-rows">
            {t.groups.map((g) => {
              const pct = Math.round(g.rate * 100);
              return (
                <Link key={g.key} to={`/group/${g.key}`} className="leaderboard-row" title={`${pct}% clean · ${g.reliability.genuine_count} tracked`}>
                  <span className="leaderboard-badge" style={{ background: colorForName(g.name) }}>
                    {g.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="leaderboard-name">
                    {g.name}
                    {g.starred ? <span className="group-star" title="Starred group">★</span> : null}
                  </span>
                  <span className="leaderboard-bar-track">
                    <span className="leaderboard-bar-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="leaderboard-pct">{pct}%</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </GlassPanel>
  );
}

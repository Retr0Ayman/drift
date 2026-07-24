import { useState } from "react";
import { Link } from "react-router-dom";
import { colorForName } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import StarRating from "../ui/StarRating";
import type { GroupReliability } from "../../hooks/useGroupReliability";
import "./GroupLeaderboard.css";

export interface RankedGroup {
  key: string;
  name: string;
  starred: boolean;
  reliability: GroupReliability;
  rate: number; // 0..1, the exact correction-free rate stars is banded from -- see rankGroups below
}

const COLLAPSED_SIZE = 8;

/* A star count alone bands dozens of real correction rates into 7 buckets
   (starsFromRate in worker/backfill/groupReliability.ts) -- two groups
   sitting at 0.97 and 1.0 clean-release rate both read as "5 stars" with no
   way to tell them apart. The leaderboard exists specifically to surface
   that finer real signal: ranked by the exact stored rate (genuine_count -
   correction_count) / genuine_count, tiebroken by genuine_count (more
   tracked releases behind the same rate is a more proven track record, not
   a better one -- same "real but weak" caveat the star formula's own
   comment already gives this signal, just used here for ORDER, never
   folded back into the score itself). Never invents a number -- every
   input is already sitting in the group_reliability row this group's
   StarRating tooltip reads from. */
export default function GroupLeaderboard({ groups }: { groups: RankedGroup[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!groups.length) return null;
  const shown = expanded ? groups : groups.slice(0, COLLAPSED_SIZE);

  return (
    <GlassPanel strong className="leaderboard-panel">
      <div className="leaderboard-head">
        <span className="leaderboard-title">Reliability leaderboard</span>
        <span className="leaderboard-sub">
          Ranked by real clean-release rate -- not just the rounded star count, so equally-starred groups still sort by
          the actual data behind them.
        </span>
      </div>
      <div className="leaderboard-rows">
        {shown.map((g, i) => {
          const pct = Math.round(g.rate * 100);
          return (
            <Link key={g.key} to={`/group/${g.key}`} className="leaderboard-row">
              <span className="leaderboard-rank">#{i + 1}</span>
              <span className="leaderboard-badge" style={{ background: colorForName(g.name) }}>
                {g.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="leaderboard-name">
                {g.name}
                {g.starred ? <span className="group-star" title="Starred group">★</span> : null}
              </span>
              <StarRating
                className="leaderboard-stars"
                stars={g.reliability.stars}
                genuineCount={g.reliability.genuine_count}
                correctionCount={g.reliability.correction_count}
                avgFixDays={g.reliability.avg_fix_days}
              />
              <span className="leaderboard-bar-track" title={`${pct}% of tracked releases needed no correction`}>
                <span className="leaderboard-bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="leaderboard-pct">{pct}%</span>
              <span className="leaderboard-sample">{g.reliability.genuine_count} tracked</span>
            </Link>
          );
        })}
      </div>
      {groups.length > COLLAPSED_SIZE ? (
        <button type="button" className="leaderboard-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${groups.length} ranked groups`}
        </button>
      ) : null}
    </GlassPanel>
  );
}

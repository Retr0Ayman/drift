import { useState } from "react";
import { Link } from "react-router-dom";
import type { LeaderboardRow } from "../../lib/leaderboard";
import Select from "../ui/Select";
import GlassPanel from "../ui/GlassPanel";
import "./CompareGroups.css";

const fmtAvg = (days: number): string => (days >= 0 ? "D+" : "D") + days.toFixed(1);
const fmtDays = (days: number): string => (days >= 0 ? "D+" : "D") + Math.round(days);

function StatColumn({ row }: { row: LeaderboardRow }) {
  return (
    <div className="compare-groups-col">
      <Link to={`/group/${row.key}`} className="compare-groups-name">
        {row.name}
      </Link>
      <div className="compare-groups-stat-v">{fmtAvg(row.avgDays)}</div>
      <div className="compare-groups-stat-v">
        <Link to={`/game/${row.fastestGameId}`}>{fmtDays(row.fastestDays)}</Link>
      </div>
      <div className="compare-groups-stat-v">{row.count}</div>
    </div>
  );
}

export default function CompareGroups({ rows }: { rows: LeaderboardRow[] }) {
  // aOverride/bOverride only track an explicit user pick -- the actual
  // selected keys are derived fresh from the current `rows` on every
  // render, falling back to the first two groups (a stale one-time
  // useState initializer here would capture whatever `rows` looked like
  // before the catalog finished loading, same bug class as
  // useGroupReleases' loading-default issue elsewhere in this app).
  const [aOverride, setAOverride] = useState<string | null>(null);
  const [bOverride, setBOverride] = useState<string | null>(null);

  if (rows.length < 2) return null;

  const options = rows.map((r) => ({ value: r.key, label: r.name }));
  const a = aOverride && rows.some((r) => r.key === aOverride) ? aOverride : rows[0].key;
  const secondDefault = rows.find((r) => r.key !== a) ?? rows[1];
  const b = bOverride && bOverride !== a && rows.some((r) => r.key === bOverride) ? bOverride : secondDefault.key;

  const rowA = rows.find((r) => r.key === a);
  const rowB = rows.find((r) => r.key === b);

  return (
    <GlassPanel strong className="compare-groups">
      <div className="compare-groups-head">Compare two groups</div>
      <div className="compare-groups-pickers">
        <Select value={a} onChange={setAOverride} options={options} ariaLabel="First group" />
        <span className="compare-groups-vs">vs</span>
        <Select value={b} onChange={setBOverride} options={options} ariaLabel="Second group" />
      </div>
      {rowA && rowB ? (
        <div className="compare-groups-table">
          <div className="compare-groups-col compare-groups-col--label">
            <div className="compare-groups-name">&nbsp;</div>
            <div className="compare-groups-stat-l">Avg D+N</div>
            <div className="compare-groups-stat-l">Fastest crack</div>
            <div className="compare-groups-stat-l">Releases counted</div>
          </div>
          <StatColumn row={rowA} />
          <StatColumn row={rowB} />
        </div>
      ) : null}
    </GlassPanel>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { buildLeaderboard } from "../../lib/leaderboard";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Leaderboard.css";

type SortKey = "name" | "avg" | "fastest" | "count";

const fmtDays = (days: number): string => (days >= 0 ? "D+" : "D") + Math.round(days);
const fmtAvg = (days: number): string => (days >= 0 ? "D+" : "D") + days.toFixed(1);

export default function Leaderboard() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const rows = useMemo(() => buildLeaderboard(games), [games]);
  usePageMeta({
    title: "Speed leaderboard — who cracks fastest",
    description: "Cracking groups ranked by average days between a title's Steam release and their own crack.",
  });

  // Fastest avg first by default -- ascending on avgDays, since a lower (or
  // more negative, an early leak) average is what "fastest" means here.
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff =
        sortKey === "avg"
          ? a.avgDays - b.avgDays
          : sortKey === "fastest"
            ? a.fastestDays - b.fastestDays
            : sortKey === "count"
              ? a.count - b.count
              : a.name.localeCompare(b.name);
      return sortAsc ? diff : -diff;
    });
    return copy;
  }, [rows, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((asc) => !asc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortAsc ? " ▲" : " ▼") : "");

  return (
    <div className="wrap leaderboard-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="leaderboard-hero">
          <span className="leaderboard-eyebrow">Speed leaderboard</span>
          <h1>Who cracks fastest</h1>
          <p className="leaderboard-lede">
            Groups ranked by average days between a title's official Steam release and their own crack — avg
            (negative = early leaks). Repacks and anonymous P2P uploads aren't counted here since they didn't
            perform the bypass; only releases with a real Steam release date and a real crack timestamp count.
          </p>
        </div>
      </Reveal>

      {sorted.length ? (
        <GlassPanel strong className="leaderboard-panel">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th className="leaderboard-sortable" onClick={() => handleSort("name")}>
                  Group{arrow("name")}
                </th>
                <th className="leaderboard-sortable" onClick={() => handleSort("avg")}>
                  Avg D+N{arrow("avg")}
                </th>
                <th className="leaderboard-sortable" onClick={() => handleSort("fastest")}>
                  Fastest crack{arrow("fastest")}
                </th>
                <th className="leaderboard-sortable" onClick={() => handleSort("count")}>
                  Releases counted{arrow("count")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.key}>
                  <td>
                    <Link to={`/group/${row.key}`} className="leaderboard-group-link">
                      {row.name}
                    </Link>
                  </td>
                  <td className={row.avgDays < 0 ? "leaderboard-negative" : undefined}>{fmtAvg(row.avgDays)}</td>
                  <td>
                    <Link to={`/game/${row.fastestGameId}`} className="leaderboard-fastest-link">
                      {row.fastestGameTitle} ({fmtDays(row.fastestDays)})
                    </Link>
                  </td>
                  <td>{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      ) : (
        <div className="leaderboard-empty">No releases with a comparable Steam release date yet.</div>
      )}
    </div>
  );
}

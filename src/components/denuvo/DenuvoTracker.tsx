import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useDenuvoRemovalStats, type DenuvoRemovalStat } from "../../hooks/useDenuvoRemovalStats";
import { hasDenuvoNow, daysSinceRelease } from "../../lib/denuvoRemoval";
import { slugify, coverImg } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import { usePageMeta } from "../../hooks/usePageMeta";
import type { Game } from "../../types/game";
import "./DenuvoTracker.css";

interface TrackerRow {
  game: Game;
  stat: DenuvoRemovalStat | undefined;
  day: number | null;
  confident: boolean;
  proximity: number;
}

/* Dedicated Denuvo-removal tracker: every currently-Denuvo'd game, sorted
   by proximity to its publisher's own real, computed removal window --
   genuinely differentiated content, since it's built entirely from this
   catalog's own confirmed removal history (worker/backfill/
   denuvoRemoval.ts), not a guess. Games from a publisher with no confident
   median yet sort to the bottom, honestly labeled "not enough data" rather
   than omitted or given a fabricated placeholder number. */
export default function DenuvoTracker() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { data: stats, loading } = useDenuvoRemovalStats();

  usePageMeta({
    title: "Denuvo Removal Tracker",
    description: "Real, computed publisher Denuvo-removal patterns, and which currently-protected titles are closest to their publisher's typical removal window.",
  });

  const rows: TrackerRow[] = useMemo(() => {
    return games
      .filter(hasDenuvoNow)
      .map((game) => {
        const stat = game.publisher ? stats[slugify(game.publisher)] : undefined;
        const day = daysSinceRelease(game);
        const confident = !!stat && stat.median_days != null;
        const proximity = confident && day != null ? Math.abs(day - stat!.median_days!) : Infinity;
        return { game, stat, day, confident, proximity };
      })
      .sort((a, b) => {
        if (a.confident !== b.confident) return a.confident ? -1 : 1;
        if (a.confident) return a.proximity - b.proximity;
        return (b.day ?? 0) - (a.day ?? 0);
      });
  }, [games, stats]);

  const publisherStats = useMemo(
    () => Object.values(stats).sort((a, b) => (b.median_days != null ? 1 : 0) - (a.median_days != null ? 1 : 0) || b.sample_count - a.sample_count),
    [stats],
  );

  const confidentCount = rows.filter((r) => r.confident).length;

  return (
    <div className="wrap denuvo-tracker">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="denuvo-tracker-hero">
          <span className="denuvo-tracker-eyebrow">Denuvo removal tracker</span>
          <h1>Which Denuvo'd titles are closest to their publisher's own removal window</h1>
          <p className="denuvo-tracker-lede">
            Publishers routinely remove Denuvo months after launch once the early-sales window has passed. This is
            computed entirely from this catalog's own confirmed removal history — real dates this site's own DRM
            recheck cycle has directly observed, never a guess. A publisher needs at least 2 confirmed removals
            before a median is shown; below that, it's marked as not enough data instead of a fabricated number.
          </p>
        </div>
      </Reveal>

      <GlassPanel className="denuvo-tracker-methodology" frost>
        <div className="denuvo-tracker-methodology-h">Publisher removal patterns ({publisherStats.length || 0})</div>
        {loading ? (
          <p className="denuvo-tracker-status">Loading…</p>
        ) : publisherStats.length ? (
          <div className="denuvo-tracker-table-wrap">
            <table className="denuvo-tracker-table">
              <thead>
                <tr>
                  <th>Publisher</th>
                  <th>Median days</th>
                  <th>Range</th>
                  <th>Samples</th>
                </tr>
              </thead>
              <tbody>
                {publisherStats.map((s) => (
                  <tr key={s.publisher_name}>
                    <td>{s.publisher_name}</td>
                    <td>{s.median_days ?? "—"}</td>
                    <td>{s.median_days != null ? `${s.min_days}–${s.max_days}` : "—"}</td>
                    <td>
                      {s.sample_count}
                      {s.median_days == null ? " (not enough data)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="denuvo-tracker-status">
            No confirmed Denuvo removals detected yet — this table builds up automatically as this site's own DRM
            recheck cycle catches real removals going forward (see the methodology note above).
          </p>
        )}
      </GlassPanel>

      <div className="denuvo-tracker-list-head">
        <span>Currently Denuvo-protected titles ({rows.length})</span>
        <span className="denuvo-tracker-list-sub">{confidentCount} sorted by a real publisher pattern</span>
      </div>

      <div className="denuvo-tracker-list">
        {rows.map(({ game, stat, day, confident }, i) => (
          <Reveal key={game.id} delay={Math.min(i, 10) * 0.03}>
            <Link to={`/game/${game.id}`} className="denuvo-tracker-row">
              {coverImg(game) ? <img className="denuvo-tracker-row-img" src={coverImg(game)!} alt="" loading="lazy" /> : <div className="denuvo-tracker-row-img denuvo-tracker-row-img--empty" />}
              <div className="denuvo-tracker-row-main">
                <div className="denuvo-tracker-row-title">{game.title}</div>
                <div className="denuvo-tracker-row-sub">
                  {game.publisher || "Unknown publisher"} · day {day ?? "—"} since release
                </div>
              </div>
              <div className={`denuvo-tracker-row-stat${confident ? " denuvo-tracker-row-stat--confident" : ""}`}>
                {confident
                  ? `Publisher median: ${stat!.median_days}d (${stat!.sample_count} samples)`
                  : stat
                    ? `Only ${stat.sample_count} sample tracked — not enough data`
                    : "No historical pattern for this publisher yet"}
              </div>
            </Link>
          </Reveal>
        ))}
        {!rows.length ? <GlassPanel className="denuvo-tracker-empty">No currently Denuvo-protected titles tracked.</GlassPanel> : null}
      </div>
    </div>
  );
}

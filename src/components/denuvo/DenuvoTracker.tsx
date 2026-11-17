import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useDenuvoRemovalStats, type DenuvoRemovalStat } from "../../hooks/useDenuvoRemovalStats";
import { useDenuvoStatus } from "../../hooks/useDenuvoStatus";
import { describeSources } from "../../lib/denuvoStatus";
import { hasDenuvoNow, daysSinceRelease, countDenuvoRemovals, DENUVO_TAG } from "../../lib/denuvoRemoval";
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
const TIMELINE_LIMIT = 15;
const fmtDate = (ts: number): string => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtDay = (ts: number): string => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthLabel = (ts: number): string => new Date(ts).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export default function DenuvoTracker() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { data: stats, loading } = useDenuvoRemovalStats();
  const statusLine = describeSources(useDenuvoStatus());

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
  const [showAll, setShowAll] = useState(false);
  const patternPublishers = publisherStats.filter((s) => s.sample_count >= 2 && s.median_days != null);
  const singlePublishers = publisherStats.filter((s) => !(s.sample_count >= 2 && s.median_days != null));
  const maxDays = Math.max(1, ...patternPublishers.map((s) => s.max_days ?? 0));

  // Removals with a real date (sourced from PCGamingWiki's dated ref, or the
  // moment this site detected it), newest first.
  const removed = useMemo(
    () => games.filter((g) => g.denuvoRemovedAt).sort((a, b) => (b.denuvoRemovedAt ?? 0) - (a.denuvoRemovedAt ?? 0)),
    [games],
  );
  // Known to have had Denuvo removed, but no source gives a date: never guessed.
  const removedUndated = useMemo(
    () => games.filter((g) => !g.denuvoRemovedAt && (g.formerTags || []).includes(DENUVO_TAG) && !hasDenuvoNow(g)),
    [games],
  );

  const totalRemovals = countDenuvoRemovals(games);
  const latestRemoval = removed[0]?.denuvoRemovedAt ?? null;
  const timeline = useMemo(() => {
    const shown = showAll ? removed : removed.slice(0, TIMELINE_LIMIT);
    const groups: Array<{ label: string; items: Game[] }> = [];
    for (const g of shown) {
      const label = monthLabel(g.denuvoRemovedAt!);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(g);
      else groups.push({ label, items: [g] });
    }
    return groups;
  }, [removed, showAll]);

  return (
    <div className="wrap denuvo-tracker">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="denuvo-tracker-hero">
          <span className="denuvo-tracker-eyebrow">Denuvo tracker</span>
          <h1>
            <span className="denuvo-tracker-hero-num">{rows.length}</span> games still on Denuvo
            <span className="denuvo-tracker-hero-dot"> · </span>
            <span className="denuvo-tracker-hero-num">{totalRemovals}</span> removals tracked
          </h1>
          <p className="denuvo-tracker-lede">
            Every figure here is counted from this catalogue. Removals are dated by a cited source (PCGamingWiki's
            patch-note reference) or, when there isn't one, by when this site's own recheck first caught it, and
            labelled that way. Nothing is estimated.
          </p>
          <dl className="denuvo-tracker-stats">
            <div>
              <dt>Still protected</dt>
              <dd>{rows.length}</dd>
            </div>
            <div>
              <dt>Removals tracked</dt>
              <dd>{totalRemovals}</dd>
            </div>
            <div>
              <dt>Latest dated removal</dt>
              <dd>{latestRemoval ? fmtDate(latestRemoval) : "—"}</dd>
            </div>
            <div>
              <dt>Publishers with a pattern</dt>
              <dd>{patternPublishers.length}</dd>
            </div>
          </dl>
          {statusLine ? (
            <p className={`denuvo-tracker-source-status${statusLine.allFailing ? " denuvo-tracker-source-status--bad" : ""}`} role="status">
              {statusLine.text}
            </p>
          ) : null}
        </div>
      </Reveal>

      <GlassPanel className="denuvo-tracker-methodology" frost>
        <div className="denuvo-tracker-methodology-h">Per-publisher removal patterns</div>
        <p className="denuvo-tracker-status denuvo-tracker-pattern-note">
          Days from release to removal. A publisher needs at least 2 confirmed removals before a median is shown.
        </p>
        {loading ? (
          <p className="denuvo-tracker-status">Loading…</p>
        ) : patternPublishers.length ? (
          <ul className="denuvo-tracker-bars">
            {patternPublishers.map((s) => (
              <li key={s.publisher_name} className="denuvo-tracker-bar-row">
                <span className="denuvo-tracker-bar-name">{s.publisher_name}</span>
                <span className="denuvo-tracker-bar-track" aria-hidden="true">
                  <span className="denuvo-tracker-bar-range" style={{ left: `${(s.min_days! / maxDays) * 100}%`, width: `${Math.max(((s.max_days! - s.min_days!) / maxDays) * 100, 0.8)}%` }} />
                  <span className="denuvo-tracker-bar-median" style={{ left: `${(s.median_days! / maxDays) * 100}%` }} />
                </span>
                <span className="denuvo-tracker-bar-val">
                  {s.median_days}d <small>median · {s.min_days}–{s.max_days} · {s.sample_count} removals</small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="denuvo-tracker-status">No publisher has two confirmed removals yet.</p>
        )}
        {singlePublishers.length ? (
          <details className="denuvo-tracker-single">
            <summary>{singlePublishers.length} publishers with one removal (not enough for a pattern)</summary>
            <p className="denuvo-tracker-status">{singlePublishers.map((s) => s.publisher_name).join(" · ")}</p>
          </details>
        ) : null}
      </GlassPanel>

      <div className="denuvo-tracker-list-head">
        <span>Currently Denuvo-protected titles ({rows.length})</span>
        <span className="denuvo-tracker-list-sub">{confidentCount} sorted by a real publisher pattern</span>
      </div>

      <div className="denuvo-tracker-list">
        {rows.map(({ game, stat, day, confident }, i) => (
          <Reveal key={game.id} delay={Math.min(i, 10) * 0.04}>
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

      <div className="denuvo-tracker-list-head">
        <span>Removal timeline ({removed.length})</span>
        <span className="denuvo-tracker-list-sub">newest first · sourced = cited by PCGamingWiki, detected = caught by this site</span>
      </div>
      <ol className="denuvo-timeline">
        {timeline.map((grp) => (
          <li key={grp.label} className="denuvo-timeline-group">
            <div className="denuvo-timeline-month">{grp.label}</div>
            <ul>
              {grp.items.map((g) => (
                <li key={g.id}>
                  <Link to={`/game/${g.id}`} className="denuvo-timeline-item">
                    <span className="denuvo-timeline-date">{fmtDay(g.denuvoRemovedAt!)}</span>
                    <span className="denuvo-timeline-title">{g.title}</span>
                    <span className="denuvo-timeline-meta">
                      {g.publisher || "Unknown publisher"} · {g.denuvoRemovedKind === "sourced" ? "sourced" : "detected"}
                      {g.denuvoConflict ? " · Steam page still lists Denuvo" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {!removed.length ? <GlassPanel className="denuvo-tracker-empty">No dated removals yet.</GlassPanel> : null}
      {removed.length > TIMELINE_LIMIT ? (
        <button type="button" className="denuvo-tracker-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${removed.length} removals`}
        </button>
      ) : null}

      {removedUndated.length ? (
        <details className="denuvo-tracker-undated">
          <summary>Denuvo removed, date not observed ({removedUndated.length})</summary>
          <p className="denuvo-tracker-status">
            These titles are recorded as having had Denuvo removed, but no source gives a date, so none is shown and
            they don't count toward the publisher medians.
          </p>
          <ul>
            {removedUndated.map((g) => (
              <li key={g.id}>
                <Link to={`/game/${g.id}`}>{g.title}</Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { buildPublisherSpeed, buildActivityTimeline, buildUncrackedSpotlight } from "../../lib/trends";
import { coverImg } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Trends.css";

const fmtAvg = (days: number): string => (days >= 0 ? "D+" : "D") + days.toFixed(1);

function PublisherSpeedChart({ rows }: { rows: ReturnType<typeof buildPublisherSpeed> }) {
  const top = useMemo(() => [...rows].sort((a, b) => a.avgDays - b.avgDays).slice(0, 10), [rows]);
  const maxAbs = Math.max(1, ...top.map((r) => Math.abs(r.avgDays)));

  if (!top.length) return <div className="trends-empty">Not enough dated releases yet to rank publishers.</div>;

  return (
    <div className="trends-bars" role="img" aria-label="Publishers ranked by average days to crack, fastest first">
      {top.map((row) => {
        const pct = Math.max(3, (Math.abs(row.avgDays) / maxAbs) * 100);
        return (
          <div className="trends-bar-row" key={row.key}>
            <Link to={`/publisher/${row.key}`} className="trends-bar-label">
              {row.name}
            </Link>
            <div className="trends-bar-track">
              <div
                className={`trends-bar-fill${row.avgDays < 0 ? " trends-bar-fill--early" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="trends-bar-value">{fmtAvg(row.avgDays)}</span>
            <span className="trends-bar-count">{row.count} tracked</span>
          </div>
        );
      })}
    </div>
  );
}

function ActivityTimeline({ months }: { months: ReturnType<typeof buildActivityTimeline> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = 220;
  const PAD_L = 8;
  const PAD_B = 28;
  const PAD_T = 16;

  if (!months.length) return <div className="trends-empty">Not enough dated releases yet to chart activity.</div>;

  const max = Math.max(1, ...months.map((m) => m.count));
  const step = (W - PAD_L * 2) / Math.max(1, months.length - 1);
  const yFor = (count: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - count / max);
  const points = months.map((m, i) => [PAD_L + i * step, yFor(m.count)] as const);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;

  // Every month labeled would collide -- show roughly 6 evenly-spaced ticks,
  // always including the first and last month so the range is legible.
  const labelEvery = Math.max(1, Math.ceil(months.length / 6));

  return (
    <div className="trends-timeline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="trends-timeline-svg"
        role="img"
        aria-label={`Tracked release activity by month, from ${months[0].label} to ${months[months.length - 1].label}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendsAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendsAreaFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {hover != null ? (
          <line x1={points[hover][0]} x2={points[hover][0]} y1={PAD_T} y2={H - PAD_B} className="trends-timeline-crosshair" />
        ) : null}
        {points.map(([x, y], i) => (
          <g key={months[i].key}>
            <circle
              cx={x}
              cy={y}
              r={hover === i ? 4 : 8}
              fill={hover === i ? "var(--accent)" : "transparent"}
              stroke="none"
              onMouseEnter={() => setHover(i)}
              style={{ cursor: "pointer" }}
            />
            {i === 0 || i === months.length - 1 || i % labelEvery === 0 ? (
              <text x={x} y={H - 8} className="trends-timeline-tick" textAnchor="middle">
                {months[i].label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {hover != null ? (
        <div
          className="trends-timeline-tooltip"
          style={{ left: `${(points[hover][0] / W) * 100}%`, top: `${(points[hover][1] / H) * 100}%` }}
        >
          <strong>{months[hover].count}</strong> tracked release{months[hover].count === 1 ? "" : "s"}
          <span>{months[hover].label}</span>
        </div>
      ) : null}
      {/* Screen-reader-only data table -- the same figures the chart plots,
          for anything that isn't reading the SVG. */}
      <table className="trends-visually-hidden">
        <caption>Tracked release activity by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Releases</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td>{m.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Trends() {
  const navigate = useNavigate();
  const { games } = useCatalog();

  const publisherSpeed = useMemo(() => buildPublisherSpeed(games), [games]);
  const activity = useMemo(() => buildActivityTimeline(games), [games]);
  const uncracked = useMemo(() => buildUncrackedSpotlight(games), [games]);

  usePageMeta({
    title: "Trends — crack speed and activity",
    description: "Publisher crack-speed rankings, tracked release activity over time, and titles still waiting on a crack.",
  });

  return (
    <div className="wrap trends-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="trends-hero">
          <span className="trends-eyebrow">Trends</span>
          <h1>Crack speed & activity</h1>
          <p className="trends-lede">
            The same real Steam-release-date-to-crack-timestamp math the group leaderboard uses, rolled up by
            publisher instead of by group, plus how tracked release volume has moved over time and what's still
            waiting on a crack.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="trends-section">
          <h2>Fastest publishers to get cracked</h2>
          <p className="trends-section-lede">
            Average days between a title's Steam release and its first crack — negative means the crack leaked
            before release. Publishers need at least 2 dated releases to rank.
          </p>
          <GlassPanel strong className="trends-panel">
            <PublisherSpeedChart rows={publisherSpeed} />
          </GlassPanel>
        </section>
      </Reveal>

      <Reveal delay={0.1}>
        <section className="trends-section">
          <h2>Tracked release activity</h2>
          <p className="trends-section-lede">Every dated crack release this catalogue has, by calendar month.</p>
          <GlassPanel strong className="trends-panel">
            <ActivityTimeline months={activity} />
          </GlassPanel>
        </section>
      </Reveal>

      <Reveal delay={0.15}>
        <section className="trends-section">
          <h2>Still waiting</h2>
          <p className="trends-section-lede">Released titles with zero tracked crack yet, longest-outstanding first.</p>
          {uncracked.length ? (
            <div className="trends-uncracked-grid">
              {uncracked.map(({ game, daysSince }) => {
                const img = coverImg(game);
                return (
                  <Link to={`/game/${game.id}`} className="trends-uncracked-card" key={game.id}>
                    <div className="trends-uncracked-cover">
                      {img ? <img src={img} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} /> : null}
                      <span className="trends-uncracked-days">{daysSince}d</span>
                    </div>
                    <div className="trends-uncracked-title">{game.title}</div>
                    <div className="trends-uncracked-pub">{game.publisher || "—"}</div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="trends-empty">Nothing currently uncracked in the tracked catalogue.</div>
          )}
        </section>
      </Reveal>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { buildDigestFacts } from "../../lib/digest";
import { fetchDigest } from "../../lib/fetchDigest";
import { slugify } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import AiTag from "../ui/AiTag";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Digest.css";

const fmtDays = (days: number): string => (days >= 0 ? "D+" : "D") + Math.round(days);

export default function Digest() {
  const navigate = useNavigate();
  const { games, status } = useCatalog();
  const ready = status !== "syncing";

  const facts = useMemo(() => buildDigestFacts(games), [games]);

  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    fetchDigest(facts).then((res) => {
      if (cancelled) return;
      setText(res.digest);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, facts.totalGames, facts.totalReleases]);

  usePageMeta({
    title: "Digest — what's notable right now",
    description: "An AI-narrated rundown of current crack activity, grounded in the real tracked catalogue.",
  });

  return (
    <div className="wrap digest-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="digest-hero">
          <span className="digest-eyebrow">Digest</span>
          <h1>What's notable right now</h1>
          <p className="digest-lede">
            A short AI-written rundown of current activity, generated strictly from the real numbers below --
            never from anything the model wasn't handed directly.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <GlassPanel strong className="digest-panel">
          {loading ? (
            <div className="digest-status">
              <span className="digest-thinking-dot" />
              <span className="digest-thinking-dot" />
              <span className="digest-thinking-dot" />
              Reading the catalogue…
            </div>
          ) : text ? (
            <p className="digest-text">
              <AiTag>AI digest</AiTag>
              {text}
            </p>
          ) : (
            <div className="digest-status">{error || "Digest unavailable right now."}</div>
          )}
        </GlassPanel>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="digest-stats">
          <GlassPanel className="digest-stat">
            <div className="digest-stat-n">{facts.totalGames}</div>
            <div className="digest-stat-l">Titles tracked</div>
          </GlassPanel>
          <GlassPanel className="digest-stat">
            <div className="digest-stat-n">{facts.totalReleases}</div>
            <div className="digest-stat-l">Releases tracked</div>
          </GlassPanel>
          <GlassPanel className="digest-stat">
            <div className="digest-stat-n digest-stat-n--sm">
              {facts.activeGroup30d ? (
                <Link to={`/group/${slugify(facts.activeGroup30d)}`}>{facts.activeGroup30d}</Link>
              ) : (
                "—"
              )}
            </div>
            <div className="digest-stat-l">
              Most active group {facts.activeGroup30dCount ? `(${facts.activeGroup30dCount} in 30d)` : ""}
            </div>
          </GlassPanel>
          <GlassPanel className="digest-stat">
            <div className="digest-stat-n digest-stat-n--sm">
              {facts.fastestCrack30d ? fmtDays(facts.fastestCrack30d.days) : "—"}
            </div>
            <div className="digest-stat-l">
              {facts.fastestCrack30d ? `Fastest: ${facts.fastestCrack30d.game}` : "Fastest crack, 30d"}
            </div>
          </GlassPanel>
        </div>
      </Reveal>

      {facts.longestUncracked ? (
        <Reveal delay={0.15}>
          <div className="digest-waiting">
            <span className="digest-waiting-label">Longest waiting on a crack</span>
            <span className="digest-waiting-title">{facts.longestUncracked.title}</span>
            <span className="digest-waiting-days">{facts.longestUncracked.days} days</span>
          </div>
        </Reveal>
      ) : null}

      {facts.recentTitles.length ? (
        <Reveal delay={0.2}>
          <div className="digest-recent">
            <span className="digest-recent-label">Recently active</span>
            <div className="digest-recent-list">
              {facts.recentTitles.map((title) => (
                <Link key={title} to={`/game/${slugify(title)}`} className="digest-recent-item">
                  {title}
                </Link>
              ))}
            </div>
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}

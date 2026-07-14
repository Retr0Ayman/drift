import { Link } from "react-router-dom";
import type { Game, Release } from "../../types/game";
import { relStatus, fmtBuild, slugify, crackTimingLabel } from "../../lib/format";
import Pill, { type PillTone } from "../ui/Pill";
import GlassPanel from "../ui/GlassPanel";
import WatchToggle from "../ui/WatchToggle";
import "./ReleaseCard.css";

const FLAG_LABEL: Record<string, string> = { out: "Outdated", unv: "Unverified", cur: "Current" };
const FLAG_TONE: Record<string, PillTone> = { out: "out", unv: "unv", cur: "dead" };
const BUILD_COLOR: Record<string, string> = { out: "var(--out)", unv: "var(--unv)", cur: "var(--accent)" };

export default function ReleaseCard({ game, release }: { game: Game; release: Release }) {
  const st = relStatus(game, release);
  const delta = st === "out" && release.build && game.currentBuild ? game.currentBuild - release.build : 0;
  const timing = crackTimingLabel(game, release);
  const groupKey = slugify(release.group || "unknown");
  const cardVariant = release.isRepack || release.isAnonymous ? "neutral" : release.method;

  return (
    <GlassPanel className={`release-card release-card--${cardVariant}`}>
      <div className="release-top">
        <span className="release-method">{release.isRepack ? "Repack" : release.isAnonymous ? "Anonymous" : release.label}</span>
        <Pill tone={FLAG_TONE[st]}>{FLAG_LABEL[st]}</Pill>
        {release.updateCount && release.updateCount > 1 ? (
          <span className="release-updated">Updated {release.updateCount}×</span>
        ) : null}
        {timing ? <span className="release-timing">{timing}</span> : null}
        <WatchToggle gameId={game.id} className="release-watch" />
      </div>

      {/* Inspired by the clean per-release info-card layout on sites like
          AllHypervisor.com -- explicitly NOT their download-linking feature,
          this project never links to or hosts release files. A repack group
          rebundled someone else's DRM bypass, it didn't perform it, and
          xREL's own "P2P" group_name is a placeholder for an unattributed
          upload, not a real group -- both are worded so neither reads as
          crack credit. */}
      <div className="release-credit">
        {release.isAnonymous ? (
          "Anonymous P2P upload"
        ) : (
          <>
            {release.isRepack ? "Repack by " : `${release.label} release by `}
            <Link to={`/group/${groupKey}`} className="release-credit-link">
              {release.group}
            </Link>
          </>
        )}
      </div>

      <div className="release-infogrid">
        <div className="release-info">
          <span className="k">Date Release</span>
          <span className="v">{game.released || "—"}</span>
        </div>
        <div className="release-info">
          <span className="k">Protection</span>
          <div className="release-tag-row">
            {(game.tags || []).length
              ? (game.tags || []).map((t) => (
                  <span className="release-tag-chip" key={t}>
                    {t}
                  </span>
                ))
              : <span className="v">—</span>}
          </div>
        </div>
        <div className="release-info">
          <span className="k">Crack Date</span>
          <span className="v">{release.date || "—"}</span>
        </div>
      </div>

      <div className="release-data">
        <div className="release-datum">
          <span className="k">Crack build</span>
          <span className="v" style={{ color: BUILD_COLOR[st] }}>
            {fmtBuild(release.build)}
          </span>
        </div>
        <div className="release-datum">
          <span className="k">Version</span>
          <span className="v">{release.version || "—"}</span>
        </div>
        {st === "out" ? (
          <div className="release-datum">
            <span className="k">Build gap</span>
            <span className="v" style={{ color: "var(--out)" }}>
              −{delta.toLocaleString("en-US")}
            </span>
          </div>
        ) : null}
      </div>

      {release.note ? <p className="release-note">{release.note}</p> : null}

      {release.link_href ? (
        <a className="nfo-toggle" href={release.link_href} target="_blank" rel="noopener noreferrer">
          View .NFO on xREL ↗
        </a>
      ) : null}
    </GlassPanel>
  );
}

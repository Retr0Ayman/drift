import { Link } from "react-router-dom";
import type { Game, Release } from "../../types/game";
import { relStatus, fmtBuild, slugify, crackTimingLabel, type RecencyStatus } from "../../lib/format";
import Pill, { type PillTone } from "../ui/Pill";
import GlassPanel from "../ui/GlassPanel";
import WatchToggle from "../ui/WatchToggle";
import "./ReleaseCard.css";

const FLAG_LABEL: Record<string, string> = {
  out: "Outdated",
  unv: "Unverified",
  cur: "Current",
  "likely-current": "Likely current",
  "likely-outdated": "Likely outdated",
};
const FLAG_TONE: Record<string, PillTone> = {
  out: "out",
  unv: "unv",
  cur: "dead",
  "likely-current": "dead",
  "likely-outdated": "unc",
};
const BUILD_COLOR: Record<string, string> = {
  out: "var(--out)",
  unv: "var(--unv)",
  cur: "var(--accent)",
  "likely-current": "var(--dead)",
  "likely-outdated": "var(--unc)",
};

interface ReleaseCardProps {
  game: Game;
  release: Release;
  /* Only meaningful when relStatus is "unv" (no real build ID to compare --
     see recencyStatusFor's own doc comment). Swaps the plain grey
     "Unverified" pill for a distinctly-worded, distinctly-colored "Likely
     current"/"Likely outdated" one -- a real, defensible recency signal,
     never conflated with an exact build match. */
  recencyStatus?: RecencyStatus;
}

export default function ReleaseCard({ game, release, recencyStatus }: ReleaseCardProps) {
  const st = relStatus(game, release);
  const displayStatus = st === "unv" && recencyStatus ? recencyStatus : st;
  const delta = st === "out" && release.build && game.currentBuild ? game.currentBuild - release.build : 0;
  const timing = crackTimingLabel(game, release);
  const groupKey = slugify(release.group || "unknown");
  const cardVariant = release.isRepack || release.isAnonymous ? "neutral" : release.method;

  return (
    <GlassPanel className={`release-card release-card--${cardVariant}`}>
      <div className="release-top">
        <span className="release-method">{release.isRepack ? "Repack" : release.isAnonymous ? "Anonymous" : release.label}</span>
        <Pill tone={FLAG_TONE[displayStatus]}>{FLAG_LABEL[displayStatus]}</Pill>
        {release.updateCount && release.updateCount > 1 ? (
          <span className="release-updated">Updated {release.updateCount}×</span>
        ) : null}
        {timing ? <span className="release-timing">{timing}</span> : null}
        <span style={{ display: "contents" }} onClick={(e) => e.stopPropagation()}>
          <WatchToggle gameId={game.id} className="release-watch" />
        </span>
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
            <Link to={`/group/${groupKey}`} className="release-credit-link" onClick={(e) => e.stopPropagation()}>
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
          <span className="v" style={{ color: BUILD_COLOR[displayStatus] }}>
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
        <a
          className="nfo-toggle"
          href={release.link_href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          View .NFO on xREL ↗
        </a>
      ) : null}
    </GlassPanel>
  );
}

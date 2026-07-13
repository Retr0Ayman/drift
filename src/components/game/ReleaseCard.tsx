import { useState } from "react";
import { Link } from "react-router-dom";
import type { Game, Release } from "../../types/game";
import { relStatus, fmtBuild, slugify, crackTimingLabel } from "../../lib/format";
import { nfoText } from "../../lib/nfo";
import Pill, { type PillTone } from "../ui/Pill";
import GlassPanel from "../ui/GlassPanel";
import "./ReleaseCard.css";

const FLAG_LABEL: Record<string, string> = { out: "Outdated", unv: "Unverified", cur: "Current" };
const FLAG_TONE: Record<string, PillTone> = { out: "out", unv: "unv", cur: "dead" };
const BUILD_COLOR: Record<string, string> = { out: "var(--out)", unv: "var(--unv)", cur: "var(--accent)" };

export default function ReleaseCard({ game, release }: { game: Game; release: Release }) {
  const [nfoOpen, setNfoOpen] = useState(false);
  const st = relStatus(game, release);
  const delta = st === "out" && release.build && game.currentBuild ? game.currentBuild - release.build : 0;
  const timing = crackTimingLabel(game, release);
  const groupKey = slugify(release.group || "unknown");

  return (
    <GlassPanel className={`release-card release-card--${release.method}`}>
      <div className="release-top">
        <span className="release-method">{release.label}</span>
        <Pill tone={FLAG_TONE[st]}>{FLAG_LABEL[st]}</Pill>
        {timing ? <span className="release-timing">{timing}</span> : null}
      </div>

      <div className="release-infogrid">
        <div className="release-info">
          <span className="k">Date Release</span>
          <span className="v">{game.released || "—"}</span>
        </div>
        <div className="release-info">
          <span className="k">Protection</span>
          <span className="v">{(game.tags || []).join(", ") || "—"}</span>
        </div>
        <div className="release-info">
          <span className="k">Group</span>
          <Link to={`/group/${groupKey}`} className="v release-group-link">
            {release.group}
          </Link>
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
            <span className="k">Drift</span>
            <span className="v" style={{ color: "var(--out)" }}>
              −{delta.toLocaleString("en-US")}
            </span>
          </div>
        ) : null}
      </div>

      {release.note ? <p className="release-note">{release.note}</p> : null}

      <button className="nfo-toggle" onClick={() => setNfoOpen((o) => !o)}>
        {nfoOpen ? "▾ Hide .NFO" : "▸ View .NFO"}
      </button>
      {nfoOpen ? <pre className="nfo-ascii">{nfoText(game, release)}</pre> : null}
    </GlassPanel>
  );
}

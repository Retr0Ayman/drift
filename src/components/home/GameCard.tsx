import { Link } from "react-router-dom";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import type { Game } from "../../types/game";
import { coverImg, fmtBuild, gStatus, relStatus, sortReleasesByPriority, statusMeta, versionLabel } from "../../lib/format";
import "./GameCard.css";

export default function GameCard({ game }: { game: Game }) {
  const sm = statusMeta(game);
  const img = coverImg(game);
  const code = game.title.split(/[:\s]/)[0].slice(0, 10).toUpperCase();
  const status = gStatus(game);
  const releases = sortReleasesByPriority(game.releases);
  const topRelease = releases[0];

  return (
    <Link to={`/game/${game.id}`} className="game-card-link">
      <GlassPanel className="game-card">
        <div className="game-card-cover">
          {img ? (
            <img className="game-card-thumb" src={img} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />
          ) : (
            <div className="game-card-code">{code}</div>
          )}
          <span className={`game-card-badge pill pill--${sm.cls === "unr" ? "unv" : sm.cls}`}>{sm.label}</span>
          {game.year ? <span className="game-card-year">{game.year}</span> : null}
        </div>
        <div className="game-card-body">
          <h3 className="game-card-title">{game.title}</h3>
          <div className="game-card-methods">
            {releases.length ? (
              releases.map((r, i) => {
                const st = relStatus(game, r);
                const markerTitle =
                  st === "out"
                    ? "Outdated — this crack build trails the latest Steam build"
                    : st === "unv"
                      ? "Unverified — no confirmed crack build number for this release yet"
                      : "Current — matches or beats the latest Steam build";
                return (
                  <Pill key={i} tone={r.method} title={markerTitle}>
                    {r.method === "hv" ? "HV" : "TRAD"} · {r.group}
                    {st !== "cur" ? <i className={`method-status-dot method-status-dot--${st}`} /> : null}
                  </Pill>
                );
              })
            ) : (
              <Pill tone="neutral">{status === "unreleased" ? "Unreleased" : "Uncracked"}</Pill>
            )}
          </div>
          {topRelease ? (
            <div className="game-card-crack">
              <span>{versionLabel(topRelease.version)}</span>
              <span>{fmtBuild(topRelease.build)}</span>
            </div>
          ) : null}
          <div className="game-card-foot">
            <span>{game.developer || ""}</span>
            <span>
              latest <b>{fmtBuild(game.currentBuild)}</b>
            </span>
          </div>
        </div>
      </GlassPanel>
    </Link>
  );
}

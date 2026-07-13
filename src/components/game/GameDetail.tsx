import { useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import Carousel from "./Carousel";
import ReleaseCard from "./ReleaseCard";
import DlcRow from "./DlcRow";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import Reveal from "../ui/Reveal";
import { bestBuild, driftDelta, fmtBuild, gStatus, sortReleasesByPriority, statusMeta, steamImg, steamLink, steamdbLink } from "../../lib/format";
import "./GameDetail.css";

const STATUS_RING: Record<string, { bg: string; label: string }> = {
  hv: { bg: "var(--hv)", label: "HVB" },
  dead: { bg: "var(--dead)", label: "CRK" },
  unc: { bg: "var(--unc)", label: "UNC" },
  unr: { bg: "var(--unv)", label: "N/A" },
};

export default function GameDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { games } = useCatalog();
  const game = games.find((g) => g.id === id);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [id]);

  if (!game) {
    return (
      <div className="wrap detail-notfound">
        <p>Title not found.</p>
        <Link to="/">‹ Back home</Link>
      </div>
    );
  }

  const sm = statusMeta(game);
  const ring = STATUS_RING[sm.cls];
  const bd = bestBuild(game);
  const drift = driftDelta(game);

  // Images only -- no trailer slide (the YouTube-search trailer link was
  // flaky enough in practice not to be worth keeping).
  const slides = game.appid
    ? ["library_hero.jpg", "header.jpg", "capsule_616x353.jpg"].map((f) => (
        <img key={f} src={steamImg(game.appid as number, f)} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      ))
    : [0, 1, 2].map((i) => (
        <div className="carousel-placeholder" key={i}>
          Screenshot {i + 1}
          <br />
          <span>streams from Steam when live</span>
        </div>
      ));

  const releases = sortReleasesByPriority(game.releases);

  return (
    <div className="wrap detail">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>
      <div className="detail-grid">
        <div className="detail-main">
          <Carousel slides={slides} />

          <Reveal>
            <div className="detail-head">
              <div className="detail-code">{(game.genres || []).join(" · ")}</div>
              <h1>{game.title}</h1>
              <div className="detail-metarow">
                <div className="detail-meta">
                  <span className="k">Developer</span>
                  <span className="v">{game.developer || "—"}</span>
                </div>
                <div className="detail-meta">
                  <span className="k">Publisher</span>
                  <span className="v">{game.publisher || "—"}</span>
                </div>
                <div className="detail-meta">
                  <span className="k">Released</span>
                  <span className="v">{game.released || "—"}</span>
                </div>
              </div>
              <div className="detail-genres">
                {(game.tags || []).map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
                {(game.genres || []).map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
              {game.metacritic || game.reviewPct ? (
                <div className="detail-stats">
                  {game.metacritic ? (
                    <div className="detail-stat">
                      <div
                        className="detail-stat-badge"
                        style={{ background: game.metacritic >= 75 ? "var(--dead)" : game.metacritic >= 50 ? "var(--out)" : "var(--unc)" }}
                      >
                        {game.metacritic}
                      </div>
                      <div>
                        <div className="detail-stat-l">Metascore</div>
                        <div className="detail-stat-v">Critics</div>
                      </div>
                    </div>
                  ) : null}
                  {game.reviewPct ? (
                    <div className="detail-stat">
                      <div>
                        <div className="detail-stat-l">Steam reviews</div>
                        <div className="detail-stat-v" style={{ color: game.reviewPct >= 70 ? "var(--dead)" : "var(--out)" }}>
                          {game.reviewPct}% positive
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <div className="detail-about">
              <h4>About this game</h4>
              <p>{game.desc}</p>
            </div>
          </Reveal>

          {game.fact ? (
            <Reveal delay={0.1}>
              <GlassPanel className="detail-factbox">
                <div className="detail-factbox-h">Did you know</div>
                <p>{game.fact}</p>
              </GlassPanel>
            </Reveal>
          ) : null}

          <Reveal delay={0.15}>
            <div className="detail-releases">
              <h4>Crack options — hypervisor vs traditional</h4>
              <div className="detail-release-list">
                {releases.length ? (
                  releases.map((r, i) => <ReleaseCard key={i} game={game} release={r} />)
                ) : (
                  <GlassPanel className="detail-release-empty">
                    {gStatus(game) === "unreleased" ? "Unreleased — no crack tracked yet." : "No crack tracked yet."}
                  </GlassPanel>
                )}
              </div>
              {releases.length ? (
                <div className="detail-legend">
                  <span>
                    <i className="legend-dot legend-dot--cur" />
                    Current — crack build matches or beats the latest Steam build
                  </span>
                  <span>
                    <i className="legend-dot legend-dot--out" />
                    Outdated — crack build trails the latest Steam build
                  </span>
                  <span>
                    <i className="legend-dot legend-dot--unv" />
                    Unverified — live-tracked release with no confirmed build number yet
                  </span>
                </div>
              ) : null}
            </div>
          </Reveal>

          {game.dlc && game.dlc.length ? (
            <Reveal delay={0.2}>
              <div className="detail-dlc">
                <h4>Editions &amp; DLC</h4>
                <GlassPanel className="detail-dlc-list">
                  {game.dlc.map((d, i) =>
                    d.appid ? (
                      <DlcRow key={i} appid={d.appid} fallbackName={d.n} />
                    ) : (
                      <div className="detail-dlc-row" key={i}>
                        <span>{d.n}</span>
                        <span className="detail-dlc-price">{d.p}</span>
                      </div>
                    ),
                  )}
                </GlassPanel>
              </div>
            </Reveal>
          ) : null}
        </div>

        <aside className="detail-side">
          <GlassPanel className="side-panel">
            <div className="status-big">
              <div className="status-ring" style={{ background: ring.bg }}>
                {ring.label}
              </div>
              <div>
                <div className="status-label">{sm.label}</div>
                <div className="status-sub">
                  {game.releases.length} crack option{game.releases.length === 1 ? "" : "s"} tracked
                </div>
              </div>
            </div>
            <div className="build-box">
              <div className="build-row">
                <span className="k">Latest Steam build</span>
                <span className="v">{fmtBuild(game.currentBuild)}</span>
              </div>
              <div className="build-row">
                <span className="k">Best crack build</span>
                <span className="v" style={{ color: drift > 0 ? "var(--out)" : "var(--accent)" }}>
                  {fmtBuild(bd)}
                </span>
              </div>
              <div className="build-row">
                <span className="k">Survival</span>
                <span className="v">{game.survivalHrs == null ? "—" : (game.survivalHrs < 0 ? "−" : "+") + Math.abs(game.survivalHrs) + "h"}</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="side-panel side-actions">
            <a className="btn btn--accent" href={steamLink(game)} target="_blank" rel="noopener noreferrer">
              View on Steam
            </a>
            <a className="btn btn--glass" href={steamdbLink(game)} target="_blank" rel="noopener noreferrer">
              Build history · SteamDB
            </a>
            <a className="btn btn--outline" href={game.source.url} target="_blank" rel="noopener noreferrer">
              News source · {game.source.name}
            </a>
          </GlassPanel>
        </aside>
      </div>
    </div>
  );
}

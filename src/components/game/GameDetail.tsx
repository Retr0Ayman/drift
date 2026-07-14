import { useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import type { Game } from "../../types/game";
import { useCatalog } from "../../hooks/useCatalog";
import Carousel from "./Carousel";
import ReleaseCard from "./ReleaseCard";
import DlcRow from "./DlcRow";
import FaqSection from "./FaqSection";
import GameFact from "./GameFact";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import Reveal from "../ui/Reveal";
import WatchToggle from "../ui/WatchToggle";
import Tabs, { type TabDef } from "../ui/Tabs";
import { usePageMeta } from "../../hooks/usePageMeta";
import { usePlatformP2PIndex } from "../../hooks/usePlatformP2PIndex";
import { mergeP2PReleases } from "../../lib/catalog";
import {
  bestBuild,
  driftDelta,
  fmtBuild,
  gStatus,
  recencyStatusFor,
  sortReleasesByPriority,
  statusMeta,
  steamImg,
  steamLink,
  steamdbLink,
} from "../../lib/format";
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
  const { index: p2pIndex } = usePlatformP2PIndex();

  // P2P groups (voices38/DenuvOwO) never appear in the browse feed
  // game.releases is built from -- merge in whatever they have for this
  // exact title before anything downstream reads game.releases, so a
  // P2P-only crack isn't silently invisible on its own game page. Memoized
  // so this only produces a new object when the inputs actually change --
  // mergeP2PReleases returns a fresh array whenever it has something to
  // merge, and an unmemoized `{...game, releases: merged}` on every render
  // would make FaqSection's `[game]`-dependent effect re-fire constantly.
  const mergedGame: Game | undefined = useMemo(() => {
    if (!game) return undefined;
    const merged = mergeP2PReleases(game.releases, game.title, p2pIndex);
    return merged === game.releases ? game : { ...game, releases: merged };
  }, [game, p2pIndex]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [id]);

  usePageMeta({
    title: game?.title || "Title not found",
    description: game?.desc || undefined,
    image: game?.appid ? steamImg(game.appid, "header.jpg") : undefined,
  });

  if (!mergedGame) {
    return (
      <div className="wrap detail-notfound">
        <p>Title not found.</p>
        <Link to="/">‹ Back home</Link>
      </div>
    );
  }

  const sm = statusMeta(mergedGame);
  const ring = STATUS_RING[sm.cls];
  const bd = bestBuild(mergedGame);
  const drift = driftDelta(mergedGame);

  // Images only -- no trailer slide (the YouTube-search trailer link was
  // flaky enough in practice not to be worth keeping).
  const slides = mergedGame.appid
    ? ["library_hero.jpg", "header.jpg", "capsule_616x353.jpg"].map((f) => (
        <img key={f} src={steamImg(mergedGame.appid as number, f)} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      ))
    : [0, 1, 2].map((i) => (
        <div className="carousel-placeholder" key={i}>
          Screenshot {i + 1}
          <br />
          <span>streams from Steam when live</span>
        </div>
      ));

  const releases = sortReleasesByPriority(mergedGame.releases);

  const tabs: TabDef[] = [
    {
      value: "cracks",
      label: `Crack options${releases.length ? ` (${releases.length})` : ""}`,
      content: (
        <div className="detail-releases">
          <div className="detail-release-list">
            {releases.length ? (
              releases.map((r, i) => (
                <ReleaseCard key={i} game={mergedGame} release={r} recencyStatus={recencyStatusFor(r, releases)} />
              ))
            ) : (
              <GlassPanel className="detail-release-empty">
                {gStatus(mergedGame) === "unreleased" ? "Unreleased — no crack tracked yet." : "No crack tracked yet."}
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
      ),
    },
    {
      value: "overview",
      label: "Overview",
      content: (
        <div className="detail-overview">
          <div className="detail-about">
            <p>{mergedGame.desc}</p>
          </div>
          <GameFact game={mergedGame} />
        </div>
      ),
    },
    ...(mergedGame.dlc && mergedGame.dlc.length
      ? [
          {
            value: "dlc",
            label: `Editions & DLC (${mergedGame.dlc.length})`,
            content: (
              <GlassPanel className="detail-dlc-list">
                {mergedGame.dlc.map((d, i) =>
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
            ),
          },
        ]
      : []),
    {
      value: "faq",
      label: "FAQ",
      content: <FaqSection game={mergedGame} />,
    },
  ];

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
              <div className="detail-code">{(mergedGame.genres || []).join(" · ")}</div>
              <div className="detail-title-row">
                <h1>{mergedGame.title}</h1>
                <WatchToggle gameId={mergedGame.id} size="lg" />
              </div>
              <div className="detail-metarow">
                <div className="detail-meta">
                  <span className="k">Developer</span>
                  <span className="v">{mergedGame.developer || "—"}</span>
                </div>
                <div className="detail-meta">
                  <span className="k">Publisher</span>
                  <span className="v">{mergedGame.publisher || "—"}</span>
                </div>
                <div className="detail-meta">
                  <span className="k">Released</span>
                  <span className="v">{mergedGame.released || "—"}</span>
                </div>
              </div>
              <div className="detail-genres">
                {(mergedGame.tags || []).map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
                {(mergedGame.genres || []).map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
              </div>
              {mergedGame.metacritic || mergedGame.reviewPct ? (
                <div className="detail-stats">
                  {mergedGame.metacritic ? (
                    <div className="detail-stat">
                      <div
                        className="detail-stat-badge"
                        style={{ background: mergedGame.metacritic >= 75 ? "var(--dead)" : mergedGame.metacritic >= 50 ? "var(--out)" : "var(--unc)" }}
                      >
                        {mergedGame.metacritic}
                      </div>
                      <div>
                        <div className="detail-stat-l">Metascore</div>
                        <div className="detail-stat-v">Critics</div>
                      </div>
                    </div>
                  ) : null}
                  {mergedGame.reviewPct ? (
                    <div className="detail-stat">
                      <div>
                        <div className="detail-stat-l">Steam reviews</div>
                        <div className="detail-stat-v" style={{ color: mergedGame.reviewPct >= 70 ? "var(--dead)" : "var(--out)" }}>
                          {mergedGame.reviewPct}% positive
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <Tabs tabs={tabs} defaultValue="cracks" ariaLabel={`${mergedGame.title} detail sections`} />
          </Reveal>
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
                  {mergedGame.releases.length} crack option{mergedGame.releases.length === 1 ? "" : "s"} tracked
                </div>
              </div>
            </div>
            <div className="build-box">
              <div className="build-row">
                <span className="k">Latest Steam build</span>
                <span className="v">{fmtBuild(mergedGame.currentBuild)}</span>
              </div>
              <div className="build-row">
                <span className="k">Best crack build</span>
                {bd != null ? (
                  <span className="v" style={{ color: drift > 0 ? "var(--out)" : "var(--accent)" }}>
                    {fmtBuild(bd)}
                  </span>
                ) : releases.length ? (
                  // A bare "—" here read as a rendering failure, not a real
                  // state -- releases.length > 0 means we do have tracked
                  // cracks, they just don't carry a confirmed Steam build id
                  // (the common case for traditional scene dirnames). Same
                  // language ReleaseCard already uses for this exact state.
                  <span className="v" style={{ color: "var(--unv)" }}>
                    Unverified
                  </span>
                ) : (
                  <span className="v">—</span>
                )}
              </div>
              <div className="build-row">
                <span className="k">Survival</span>
                <span className="v">{mergedGame.survivalHrs == null ? "—" : (mergedGame.survivalHrs < 0 ? "−" : "+") + Math.abs(mergedGame.survivalHrs) + "h"}</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="side-panel side-actions">
            <a className="btn btn--accent" href={steamLink(mergedGame)} target="_blank" rel="noopener noreferrer">
              View on Steam
            </a>
            <a className="btn btn--glass" href={steamdbLink(mergedGame)} target="_blank" rel="noopener noreferrer">
              Build history · SteamDB
            </a>
            <a className="btn btn--outline" href={mergedGame.source.url} target="_blank" rel="noopener noreferrer">
              News source · {mergedGame.source.name}
            </a>
          </GlassPanel>
        </aside>
      </div>
    </div>
  );
}

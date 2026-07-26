import { Link } from "react-router-dom";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import type { Game } from "../../types/game";
import { coverImg, fmtBuild, gStatus, hvOutdatedReason, relStatus, sortReleasesByPriority, statusMeta, versionLabel } from "../../lib/format";
import "./GameCard.css";

interface GameCardProps {
  game: Game;
  /* PERF FIX (confirmed live via Lighthouse against production): every
     GameCard hardcoded loading="lazy" unconditionally, including the one
     in the first visible grid row -- lcp-discovery-insight flagged exactly
     that: the real LCP candidate on the homepage is a GameCard cover
     image, and lazy-loading an above-the-fold image only delays it for no
     benefit (lazy-loading exists to skip fetching off-screen images, not
     ones already in the initial viewport). Deliberately only the SINGLE
     first card, not a whole row -- an earlier version of this fix eagerly
     fetchPriority="high"'d the first 8 at once, and a follow-up Lighthouse
     run under the same throttled-mobile profile showed LCP getting WORSE,
     not better (though the specific number was too inconsistent run-to-run
     to fully pin the cause on that alone -- see git history). Prioritizing
     only the one card most likely to actually BE the LCP element avoids
     that bandwidth-contention risk on a throttled connection while still
     fixing the real, confirmed lazy-loading problem. */
  priority?: boolean;
}

export default function GameCard({ game, priority }: GameCardProps) {
  const sm = statusMeta(game);
  const img = coverImg(game);
  const code = game.title.split(/[:\s]/)[0].slice(0, 10).toUpperCase();
  const status = gStatus(game);
  const allReleases = sortReleasesByPriority(game.releases);
  // Cracks are the default/primary view everywhere a release list renders
  // (orlaz-crack-priority-repack-toggle.md) -- this compact grid tile has
  // no room for an explicit toggle the way the game detail page's "Crack
  // options" tab now does, so the honest equivalent here is simply never
  // showing a repack/anonymous pill by default at all; the full picture
  // (including the repack toggle) is one click away. Falls back to every
  // release only for the rare case a game has nothing BUT repacks
  // tracked -- an empty card is worse than showing what's actually there.
  const genuineReleases = allReleases.filter((r) => !r.isRepack && !r.isAnonymous);
  const releases = genuineReleases.length ? genuineReleases : allReleases;
  const topRelease = releases[0];

  return (
    <Link to={`/game/${game.id}`} className="game-card-link">
      <GlassPanel className="game-card" frostStrong>
        <div className="game-card-cover">
          {img ? (
            <img
              className="game-card-thumb"
              src={img}
              alt=""
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              onError={(e) => e.currentTarget.remove()}
            />
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
                const hvReason = hvOutdatedReason(game, r, st === "out");
                const markerTitle =
                  st === "out"
                    ? hvReason === "expected"
                      ? "Outdated (expected) — hypervisor cracks are tied to a specific build and routinely need re-patching after any update, this isn't a sign of a neglected release"
                      : "Outdated — this crack build trails the latest Steam build"
                    : st === "unv"
                      ? "Unverified — no confirmed crack build number for this release yet"
                      : "Current — matches or beats the latest Steam build";
                // Same "never let a repack/anonymous upload read as if it
                // cracked the game" rule ReleaseCard/CrackTimeline already
                // apply -- this compact card-grid pill was the one place
                // still rendering "TRAD · RIDDICK" indistinguishably from a
                // genuine crack credit.
                const label = r.isAnonymous
                  ? "P2P · Anonymous"
                  : r.isRepack
                    ? `Repack · ${r.group}`
                    : `${r.method === "hv" ? "HV" : "TRAD"} · ${r.group}`;
                return (
                  <Pill key={i} tone={r.isRepack || r.isAnonymous ? "neutral" : r.method} title={markerTitle}>
                    {label}
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

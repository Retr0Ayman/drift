import { Link } from "react-router-dom";
import type { Game, Release } from "../../types/game";
import { relStatus, fmtBuild, slugify, crackTimingLabel, hvOutdatedReason, outdatedDays, type RecencyStatus } from "../../lib/format";
import Pill, { type PillTone } from "../ui/Pill";
import DrmTag from "../ui/DrmTag";
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
  const outdatedFor = st === "out" ? outdatedDays(game) : null;
  const timing = crackTimingLabel(game, release);
  const groupKey = slugify(release.group || "unknown");
  const cardVariant = release.isRepack || release.isAnonymous ? "neutral" : release.method;

  // Hypervisor bypasses are tied to one specific build by nature of the
  // method -- flagging that the exact same "Outdated" way a stale
  // traditional crack gets flagged reads as a quality problem when it
  // usually isn't one. "expected" swaps the pill to the neutral "unv" tone
  // (FIX: "unc"/likely-outdated's own orange-red is visually just as
  // alarming as "out"'s orange -- confirmed live side by side, barely
  // distinguishable -- "unv"'s muted grey-tan is the tone this design
  // system already uses for "no judgment being made," the actually correct
  // register for "this isn't a quality signal"); "behind-peers" (another hv
  // release for this game already caught up) is a real, group-specific
  // signal, so it keeps the normal alarming treatment, just with a tooltip
  // that says why.
  const hvReason = hvOutdatedReason(game, release, displayStatus === "out" || displayStatus === "likely-outdated");
  const flagLabel = hvReason === "expected" ? "Outdated (expected)" : FLAG_LABEL[displayStatus];
  const flagTone = hvReason === "expected" ? "unv" : FLAG_TONE[displayStatus];
  const flagTitle =
    hvReason === "expected"
      ? "Hypervisor cracks are tied to a specific game build and routinely need re-patching after any update -- this is normal, expected behavior for this crack method, not a sign of a neglected release."
      : hvReason === "behind-peers"
        ? "Another tracked hypervisor release for this game has already caught up to the current build -- this one specifically has fallen behind, not just ordinary hypervisor build-lag."
        : undefined;

  // Two distinct facts, not one blended line: the group's real first-ever
  // crack (firstSeenDate/Build, falling back to date/build for rows from
  // before the backfill) vs. whatever this group's latest update landed
  // (the already-mutable date/build). Only worth showing as a second,
  // distinct fact when there's genuinely something to distinguish --
  // update_count > 1 and the two dates actually differ, otherwise "First
  // cracked" and "Latest update" would just repeat the same date twice.
  const firstCrackDate = release.firstSeenDate || release.date;
  const hasLatestUpdate = !!release.updateCount && release.updateCount > 1 && release.date && release.date !== firstCrackDate;

  return (
    <GlassPanel className={`release-card release-card--${cardVariant}`} frostStrong>
      <div className="release-top">
        <span className="release-method">{release.isRepack ? "Repack" : release.isAnonymous ? "Anonymous" : release.label}</span>
        <Pill tone={flagTone} title={flagTitle}>
          {flagLabel}
        </Pill>
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
              ? (game.tags || []).map((t) => <DrmTag key={t}>{t}</DrmTag>)
              : (game.formerTags || []).length ? null : <span className="v">—</span>}
            {/* BUG FIX (confirmed live, 007 First Light): a hypervisor
                release here next to a bare "Steam DRM" Protection row reads
                as a contradiction -- hypervisor cracking exists specifically
                to bypass Denuvo Anti-Tamper, not plain Steam DRM. formerTags
                is the real PCGamingWiki Removed_DRM fact (game.tags no
                longer includes it because it's genuinely been removed by
                the publisher since) that actually explains it -- same real
                data, same muted "former" treatment as GameDetail.tsx's own
                Protection field. */}
            {(game.formerTags || []).map((t) => (
              <DrmTag key={"former-" + t} className="drm-tag--former" title={`Previously used, since removed -- ${t} no longer protects this game`}>
                {t} (removed)
              </DrmTag>
            ))}
          </div>
        </div>
        <div className="release-info">
          <span className="k">First cracked</span>
          <span className="v release-fact--first">
            {firstCrackDate || "—"}
            {release.firstSeenBuild ?? release.build ? ` · ${fmtBuild(release.firstSeenBuild ?? release.build)}` : ""}
            {/* firstSeenVerified === false means this date is a known-flawed
                placeholder (see migrations/0005's own comment), not a
                genuinely confirmed original crack moment -- flagged as an
                estimate rather than shown with the same confidence as a
                real one. */}
            {release.firstSeenVerified === false ? " (est.)" : ""}
          </span>
        </div>
        {hasLatestUpdate ? (
          <div className="release-info">
            <span className="k">Latest update</span>
            <span className="v release-fact--latest">
              {release.date}
              {release.build != null ? ` · ${fmtBuild(release.build)}` : ""}
            </span>
          </div>
        ) : null}
      </div>

      <div className="release-data">
        <div className="release-datum">
          <span className="k">Crack build</span>
          {/* A bare "—" here read as a rendering failure, not a real state --
              most traditional scene dirnames never embed a Steam build id at
              all (see parseBuildFromDirname's own comment), so build:null is
              honest, common data, not missing data. Pill-styled to match the
              "version label next to a build-number pill" reference look,
              same tone the status pill above already uses for this state. */}
          <Pill tone={flagTone} className="release-build-pill">
            {release.build != null ? fmtBuild(release.build) : "Unverified"}
          </Pill>
        </div>
        <div className="release-datum">
          <span className="k">Version</span>
          <span className="v">{release.version || "—"}</span>
        </div>
        {st === "out" ? (
          <div className="release-datum">
            {/* BUG FIX (confirmed live, 007 First Light: "−388825"): this
                used to be game.currentBuild - release.build, a raw Steam
                BuildID subtraction -- BuildID is one global counter shared
                across Valve's ENTIRE platform, not a per-game update count,
                so that delta mostly reflected elapsed time plus unrelated
                platform-wide activity (see src/lib/format.ts's outdatedDays
                for the full reasoning, and lib/outlook.ts's own history of
                this same bug in the Crack Outlook text). outdatedDays is
                the real, time-based replacement, driven by the game's own
                currentBuildUpdatedAt Steam timestamp. */}
            <span className="k">Outdated for</span>
            <span className="v" style={{ color: "var(--out)" }}>
              {outdatedFor != null ? (outdatedFor === 0 ? "<1d" : `${outdatedFor}d`) : "—"}
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

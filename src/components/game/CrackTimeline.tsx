import { Link } from "react-router-dom";
import type { Game } from "../../types/game";
import { sortReleasesByFirstSeen, earliestGenuineRelease, firstSeenTs, fmtDateMs, slugify } from "../../lib/format";
import GlassPanel from "../ui/GlassPanel";
import Pill from "../ui/Pill";
import "./CrackTimeline.css";

/* Chronological companion to the build-priority release list above it on
   this same tab -- that list answers "which crack should I use right
   now," this answers "what actually happened, and in what order." Ordered
   by real first_seen_ts (sortReleasesByFirstSeen), never the mutable
   ts/date fields an ongoing crack's own updates keep advancing -- see
   lib/format.ts's own comments on firstSeenTs/crackTimingDays for the
   full history of why that distinction exists.

   The "First crack" badge goes on earliestGenuineRelease's result, NOT
   simply row zero of the sorted list -- a repack or anonymous P2P upload
   keeps its own honest label (matching ReleaseCard's wording exactly)
   regardless of where its timestamp places it, so a repacker can never
   visually read as if they were first even if their recorded
   first_seen_ts happens to predate the real crack. Hidden entirely below
   two releases -- a "timeline" of one entry isn't one. */
export default function CrackTimeline({ game }: { game: Game }) {
  const releases = game.releases || [];
  if (releases.length < 2) return null;

  const ordered = sortReleasesByFirstSeen(releases);
  const first = earliestGenuineRelease(releases);

  return (
    <GlassPanel className="crack-timeline" frost>
      <h3 className="crack-timeline-heading">Crack Timeline</h3>
      <ol className="crack-timeline-list">
        {ordered.map((r, i) => {
          const ts = firstSeenTs(r);
          const groupKey = slugify(r.group || "unknown");
          const isFirst = r === first;
          return (
            <li key={i} className={`crack-timeline-row${isFirst ? " crack-timeline-row--first" : ""}`}>
              <span className="crack-timeline-date">
                {ts != null ? fmtDateMs(ts) : r.firstSeenDate || r.date || "—"}
                {r.firstSeenVerified === false ? " (est.)" : ""}
              </span>
              <span className="crack-timeline-who">
                {r.isAnonymous ? (
                  "Anonymous P2P upload"
                ) : r.isRepack ? (
                  <>
                    Repack by{" "}
                    <Link to={`/group/${groupKey}`} className="crack-timeline-link">
                      {r.group}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link to={`/group/${groupKey}`} className="crack-timeline-link">
                      {r.group}
                    </Link>{" "}
                    · {r.label}
                  </>
                )}
              </span>
              {isFirst ? (
                <Pill tone="hv" className="crack-timeline-badge">
                  First crack
                </Pill>
              ) : null}
            </li>
          );
        })}
      </ol>
    </GlassPanel>
  );
}

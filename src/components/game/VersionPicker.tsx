import { useMemo, useState } from "react";
import type { Release } from "../../types/game";
import { fmtBuild } from "../../lib/format";
import Pill from "../ui/Pill";
import "./VersionPicker.css";

interface VersionPickerProps {
  releases: Release[];
}

function releaseKey(r: Release, i: number): string {
  return r.xrelId || `${r.group}-${r.date}-${i}`;
}

// FIX (confirmed live): a bare "—" in the build pill read as a rendering
// failure on games like Watch Dogs 2 (7 tracked releases, none carrying a
// confirmed Steam build id -- the common case for traditional scene
// dirnames, see parseBuildFromDirname's own comment) rather than the
// intentional "we tracked this, we just can't confirm an exact build"
// state ReleaseCard's Unverified pill already communicates elsewhere.
function buildPill(build: number | null): { tone: "neutral" | "unv"; text: string } {
  return build != null ? { tone: "neutral", text: fmtBuild(build) } : { tone: "unv", text: "Unverified" };
}

/* Steam's own "choose a version" list, same idea here: every tracked crack
   version visible at once -- not gated behind a click to expand, a
   collapsed dropdown doesn't match the reference this was built against.
   A checkmark marks whichever row is selected; a "Latest" tag stays pinned
   to the most recently released row regardless of what's selected (the two
   diverge once someone picks an older row to look at, same as Steam's own
   picker). Reuses the exact version/build values ReleaseCard already
   parses per release -- no new parsing here. */
export default function VersionPicker({ releases }: VersionPickerProps) {
  const latestKey = useMemo(() => {
    if (!releases.length) return null;
    let best = releases[0];
    let bestI = 0;
    releases.forEach((r, i) => {
      if ((r.ts || 0) > (best.ts || 0)) {
        best = r;
        bestI = i;
      }
    });
    return releaseKey(best, bestI);
  }, [releases]);

  const [picked, setPicked] = useState<string | null>(null);
  const value = picked && releases.some((r, i) => releaseKey(r, i) === picked) ? picked : latestKey;

  if (!releases.length) return null;

  return (
    <div className="vpicker">
      <div className="vpicker-heading">Choose a version</div>
      <div className="vpicker-list" role="listbox" aria-label="Choose a crack version">
        {releases.map((r, i) => {
          const key = releaseKey(r, i);
          const isLatest = key === latestKey;
          const isSelected = key === value;
          const bp = buildPill(r.build);
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`vpicker-row${isSelected ? " vpicker-row--selected" : ""}`}
              onClick={() => setPicked(key)}
            >
              <span className="vpicker-check">
                {isSelected ? (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5 5 9.5 10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
              <span className="vpicker-label">
                <span className="vpicker-row-label">{r.version || "Unversioned"}</span>
                {isLatest ? <span className="vpicker-latest">Latest</span> : null}
              </span>
              <Pill tone={bp.tone} className="vpicker-build">
                {bp.text}
              </Pill>
            </button>
          );
        })}
      </div>
    </div>
  );
}

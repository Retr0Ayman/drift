import * as RadixSelect from "@radix-ui/react-select";
import { useMemo, useState } from "react";
import type { Release } from "../../types/game";
import { fmtBuild } from "../../lib/format";
import Pill from "../ui/Pill";
import "../ui/Select.css";
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

/* Steam's own "choose a version" dropdown, same idea here: browse every
   tracked crack version for this title, with a checkmark on whichever's
   selected and a distinct "Latest" tag pinned to the most recently
   released one (the two diverge once someone picks an older row to look
   at, same as Steam's picker). Reuses the exact version/build values
   ReleaseCard already parses per release -- no new parsing here. */
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
  const selectedRelease = releases.find((r, i) => releaseKey(r, i) === value) || null;

  if (!releases.length) return null;

  return (
    <div className="vpicker">
      <div className="vpicker-heading">Choose a version</div>
      <RadixSelect.Root value={value ?? undefined} onValueChange={setPicked}>
        <RadixSelect.Trigger className="dselect-trigger vpicker-trigger" aria-label="Choose a crack version">
          <RadixSelect.Value>
            {selectedRelease ? (
              <span className="vpicker-trigger-inner">
                <span className="vpicker-trigger-label">{selectedRelease.version || "Unversioned"}</span>
                <Pill tone={buildPill(selectedRelease.build).tone} className="vpicker-build">
                  {buildPill(selectedRelease.build).text}
                </Pill>
              </span>
            ) : (
              "No tracked version"
            )}
          </RadixSelect.Value>
          <RadixSelect.Icon className="dselect-icon">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </RadixSelect.Icon>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content className="dselect-content vpicker-content" position="popper" sideOffset={8}>
            <RadixSelect.Viewport className="dselect-viewport">
              {releases.map((r, i) => {
                const key = releaseKey(r, i);
                const isLatest = key === latestKey;
                return (
                  <RadixSelect.Item key={key} value={key} className="dselect-item vpicker-item">
                    <RadixSelect.ItemIndicator className="dselect-indicator vpicker-check">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6.5 5 9.5 10 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </RadixSelect.ItemIndicator>
                    <span className="vpicker-label">
                      <RadixSelect.ItemText>{r.version || "Unversioned"}</RadixSelect.ItemText>
                      {isLatest ? <span className="vpicker-latest">Latest</span> : null}
                    </span>
                    <Pill tone={buildPill(r.build).tone} className="vpicker-build">
                      {buildPill(r.build).text}
                    </Pill>
                  </RadixSelect.Item>
                );
              })}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
    </div>
  );
}

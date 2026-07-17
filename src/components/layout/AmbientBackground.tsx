import { useEffect, useState, type CSSProperties } from "react";
import "./AmbientBackground.css";

/* FIX (reported live): the previous version was one bounded goo cluster in
   the top-left corner -- on a game detail page that reads as the game's
   accent color only touching one corner while the rest of the screen
   stays flat, and the drift itself looked choppy (steps(10, jump-end) was
   too coarse -- individual blob motion jumped in visible discrete steps
   rather than reading as smooth liquid drift, something an aggregate
   fps-only check didn't catch since averaged frame rate can look "fine"
   while the actual position deltas driving visible motion are still
   large, infrequent jumps).

   Fix for coverage: several small goo clusters (CLUSTERS below) scattered
   across the full viewport via percentage anchors instead of one big
   cluster in a corner -- same shared #ambient-goo filter def, applied to
   N separate small bounding boxes instead of one larger one. This is the
   "sparser full-coverage grid" lever, not a bigger single blur: each
   cluster's filtered region is small (see .css), so total re-rasterize
   cost scales with cluster count x small-area rather than with one much
   larger area, and per-cluster cost stays cheap to throttle if needed.

   Fix for choppiness: dropped the steps() throttling entirely in favor of
   smooth transform easing, now that each individual filtered region is
   small enough (per-cluster, not full-viewport) that continuous
   re-rasterization measured cheap -- see the .css comment for the actual
   before/after numbers. If a future change needs to claw back budget,
   the right lever is fewer/smaller clusters or a smaller blur radius, not
   reintroducing coarse steps() -- that's what caused the choppiness
   complaint in the first place. */
const CLUSTERS: Array<{ top: string; left: string }> = [
  { top: "-10%", left: "-6%" },
  { top: "-8%", left: "74%" },
  { top: "34%", left: "-8%" },
  { top: "40%", left: "80%" },
  { top: "74%", left: "2%" },
  { top: "78%", left: "68%" },
];

export default function AmbientBackground() {
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      {/* width/height 0 -- this <svg> only hosts the <filter> definition
          every cluster below references via filter: url(#ambient-goo); it
          renders nothing itself. One shared def, reused by every cluster
          (each gets its own independent filter region from its own
          bounding box) rather than duplicating the filter per cluster. */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="ambient-goo" x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="blur" />
            {/* Identity on R/G/B (rows 1-3), alpha-only linear ramp on row 4
                -- the merge mechanism: see AmbientBackground.css's header
                comment for the full explanation, unchanged from before. */}
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -11" />
          </filter>
        </defs>
      </svg>
      {CLUSTERS.map((pos, i) => (
        <div key={i} className="ambient-goo" style={{ top: pos.top, left: pos.left } as CSSProperties}>
          {/* Each blob's own animation-delay is offset per cluster (not
              baked into the shared a/b/c keyframe classes in .css) purely
              so the six clusters don't all breathe in exact lockstep --
              inline style wins over the class's own animation-delay
              because it's a more specific longhand declaration. */}
          <div className="ambient-blob ambient-blob--a" style={{ animationDelay: `${-(i * 3.4)}s` }} />
          <div className="ambient-blob ambient-blob--b" style={{ animationDelay: `${-(i * 3.4 + 5.1)}s` }} />
          <div className="ambient-blob ambient-blob--c" style={{ animationDelay: `${-(i * 3.4 + 8.6)}s` }} />
        </div>
      ))}
    </div>
  );
}

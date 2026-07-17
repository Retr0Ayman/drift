import { useEffect, useState } from "react";
import "./AmbientBackground.css";

/* Fixed, full-viewport layer behind every route -- three soft radial-
   gradient blobs (no blur filter, the falloff itself provides the
   softness) drifting slowly via transform PLUS a border-radius wobble
   (see .css) that keeps their outline organically irregular instead of a
   perfect circle. No canvas, no WebGL, no rAF loop -- but border-radius is
   NOT compositor-only like transform/opacity, it repaints on every change,
   and measured naively (smooth easing) that was a real ~40fps regression
   on this component's own scale of shape. AmbientBackground.css's
   steps(8, jump-end) on the wobble animations is the actual fix -- a
   handful of discrete repaints per cycle instead of one every frame. Don't
   remove that steps() without re-measuring. Subtle by design: a
   tinted-paper wash, not a light source.

   Colors come from --ambient-primary/--ambient-secondary custom
   properties: GameDetail mirrors the current game's real
   accentColorPrimary/Secondary onto :root via useAmbientAccent so this
   layer (mounted once, outside the router, with no prop channel down from
   a page) reads the same per-game colors AmbientWash renders locally;
   AmbientBackground.css's own defaults (matching
   worker/shared/colorExtract.ts's FALLBACK_PRIMARY/SECONDARY) apply
   whenever no game page is active.

   prefers-reduced-motion freezes on a resting frame via the blanket rule
   in globals.css. Pausing on scroll-out-of-view doesn't apply -- this is
   position:fixed covering the full viewport, so it's never actually
   offscreen -- but tab visibility is a real, cheap win: no reason to keep
   animating a background nobody's looking at. */
export default function AmbientBackground() {
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      <div className="ambient-blob ambient-blob--a" />
      <div className="ambient-blob ambient-blob--b" />
      <div className="ambient-blob ambient-blob--c" />
    </div>
  );
}

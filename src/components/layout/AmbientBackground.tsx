import { useEffect, useState } from "react";
import "./AmbientBackground.css";

/* Replaces the old metaball/goo background (SVG feGaussianBlur +
   feColorMatrix filter re-rasterizing 12 discrete blob clusters every
   frame) with a purely CSS effect: a static radial-gradient mesh (five
   soft-edged fields reaching every corner + the center, so there's no
   flat dead zone -- same coverage goal the old 4x3 cluster grid solved,
   just without a filter or any per-frame layout/paint cost since nothing
   here animates position) plus one slowly rotating conic-gradient layer
   blended on top for a sense of gentle, ambient motion, plus a static
   (not per-frame-generated) SVG grain texture. All three layers are
   `background`/`background-image`, never `filter: url(...)` -- no
   forced re-rasterization of a filtered subtree the way the old goo
   clusters had, which is what made this measurably cheaper (see
   AmbientBackground.css's own comment for the actual numbers). Same
   accent-color sourcing as before: --ambient-primary/--ambient-secondary
   set on :root by useAmbientAccent.ts on a game page, falling back to
   the fixed neutral pair colorExtract.ts's own FALLBACK_PRIMARY/SECONDARY
   uses when nothing has set them (homepage, directories, etc.). */
export default function AmbientBackground() {
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      <div className="ambient-mesh" />
      <div className="ambient-conic" />
      <div className="ambient-grain" />
    </div>
  );
}

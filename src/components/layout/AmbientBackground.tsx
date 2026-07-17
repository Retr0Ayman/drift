import { useEffect, useState } from "react";
import "./AmbientBackground.css";

/* REPLACES the previous soft-radial-gradient-wash version entirely -- that
   approach had no way to produce real "merging" between shapes (translucent
   circles just overlap, they don't fuse), which is what was actually
   wanted: a goo/metaball effect, the standard technique behind "blobs that
   melt into each other." The mechanism: blur a group of SOLID shapes
   (feGaussianBlur), then run the blurred alpha channel through a steep
   linear ramp (feColorMatrix's bottom row, alpha-only) that snaps
   near-opaque pixels to fully opaque and near-transparent pixels to fully
   transparent. Where two blurred shapes' soft edges overlap, the combined
   alpha crosses that threshold and the two shapes read as one connected
   blob with a smooth seam -- that snap is doing 100% of the "merge" work,
   which is why the blobs underneath can stay as plain solid circles.

   CSS's own contrast() filter function can NOT substitute for this: per
   the Filter Effects spec it's defined as a feComponentTransfer over R/G/B
   only, alpha is untouched -- so there is no real "CSS-only" version of
   this technique, only the SVG reference-filter version below.

   Deliberately NOT full-viewport like the component this replaces: an SVG
   reference filter (filter: url(#...), as opposed to a plain CSS
   blur()/opacity()) forces the browser to re-rasterize its entire filtered
   subtree whenever anything inside it changes -- including a child's
   transform, which is normally compositor-only and effectively free. Once
   wrapped in a goo filter, blob movement is NOT free anymore, and the cost
   scales with the filtered region's pixel area. A single bounded cluster
   (see .ambient-goo's clamp()'d size in the .css) keeps that area small
   and predictable regardless of viewport/monitor size, rather than paying
   full-viewport blur cost every frame. Still reads as "site-wide" because
   this component mounts once, outside the router, on every route -- the
   cluster itself doesn't need to span the whole screen for that to be
   true. steps() timing on the drift keyframes (see .css) is the same
   repaint-throttling fix as the previous version's border-radius wobble,
   now applied to transform for the same reason: inside a filtered
   ancestor, transform loses its usual free ride.

   Colors: --ambient-primary/--ambient-secondary custom properties,
   unchanged from the previous version -- GameDetail's useAmbientAccent
   mirrors the current game's real accentColorPrimary/Secondary onto :root,
   AmbientBackground.css's own defaults (FALLBACK_PRIMARY/SECONDARY) apply
   on every other page. Blobs are solid, near-full alpha colors (not the
   previous version's translucent gradient wash) -- the goo filter needs
   real alpha to threshold against; a filter over near-invisible shapes
   wouldn't read as anything, which is exactly the mistake the old version
   made in the opposite direction (see AmbientBackground.css's own history
   of that regression).

   prefers-reduced-motion freezes on a resting frame via the blanket rule
   in globals.css, same as before. Pausing on scroll-out-of-view still
   doesn't apply (position:fixed, never actually offscreen); tab-visibility
   pause carries over unchanged. */
export default function AmbientBackground() {
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      {/* width/height 0 -- this <svg> only exists to host the <filter>
          definition other elements reference via filter: url(#ambient-goo);
          it renders nothing itself. */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="ambient-goo" x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
            {/* Identity on R/G/B (rows 1-3), alpha-only linear ramp on row 4
                (slope 22, intercept -10): the actual "merge" mechanism, see
                the component-level comment above. */}
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
          </filter>
        </defs>
      </svg>
      <div className="ambient-goo">
        <div className="ambient-blob ambient-blob--a" />
        <div className="ambient-blob ambient-blob--b" />
        <div className="ambient-blob ambient-blob--c" />
      </div>
    </div>
  );
}

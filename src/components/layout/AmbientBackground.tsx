import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import "./AmbientBackground.css";

// How far (px) the mesh/conic layers drift opposite the pointer. CSS gives
// .ambient-parallax a -32px inset buffer beyond the viewport specifically
// so this can move without ever exposing the page background at an edge.
const PARALLAX_MAX = 18;

// Hardcoded (not randomized at mount) so the layout is stable and
// reproducible across reloads instead of reshuffling every visit. Spread
// across the viewport at varied sizes/delays/durations so the rise-and-
// fade loops (.ambient-mote-rise in AmbientBackground.css) never sync up.
// Trimmed from 6 to 4 in the perf pass -- each mote is its own always-
// animating compositor layer, and 4 staggered ones still read as
// continuous drift, just with less always-on layer overhead than 6.
const MOTES = [
  { left: "10%", top: "72%", size: 5, delay: 0, duration: 15 },
  { left: "47%", top: "82%", size: 6, delay: 8, duration: 16 },
  { left: "64%", top: "30%", size: 4, delay: 2, duration: 20 },
  { left: "81%", top: "64%", size: 5, delay: 11, duration: 17 },
];

type BlobRole = "primary" | "secondary" | "a" | "b" | "c";
interface BlobDef {
  left: number;
  top: number;
  size: number; // vmax, this is now the WIDTH -- height is size * ratio
  ratio: number; // height/width -- 1 would be a perfect circle's own aspect, deliberately never exactly 1
  radius: string; // border-radius value -- an irregular 8-value (4-corner x 2-axis) shape, never plain "50%"
  role: BlobRole;
  opacity: number;
  duration: number; // s
  delay: number; // s, negative starts the animation partway through its cycle
  dx: number; // vmax
  dy: number; // vmax
  ds: number; // drift scale target
}

// 6 hand-picked irregular border-radius shapes -- each is a real,
// asymmetric organic blob outline (4 different corner radii per axis,
// e.g. "42% 58% 55% 45% / 48% 42% 58% 52%" reads as top-left/top-right/
// bottom-right/bottom-left horizontal radii, then the same 4 corners'
// vertical radii after the slash), cycled across BLOBS below by index so
// no two adjacent blobs share the exact same outline. Since these are
// plain divs with a `background` (no SVG, no clip-path) -- CSS's own
// border-radius always clips an element's background to its own
// (possibly irregular) border-box, per spec, with zero extra rendering
// cost beyond what a plain circular border-radius already costs. This is
// what actually breaks the "20 identical circles" look: the earlier pass
// never set border-radius at all, so every blob was a mathematically
// perfect circle (the radial-gradient's own `circle` keyword) regardless
// of size.
const BLOB_RADII = [
  "42% 58% 55% 45% / 48% 42% 58% 52%",
  "61% 39% 44% 56% / 39% 61% 52% 48%",
  "48% 52% 63% 37% / 56% 44% 40% 60%",
  "55% 45% 38% 62% / 44% 56% 61% 39%",
  "38% 62% 50% 50% / 60% 40% 46% 54%",
  "64% 36% 46% 54% / 46% 54% 63% 37%",
];

/* SIXTH pass, size/shape variety + color-reactivity prominence --
   confirmed live (deployed-CSS inspection, see the commit for the exact
   commands) that the FIFTH pass's reactive wiring was never actually
   broken (var(--ambient-primary,...) etc. is genuinely still there for
   every "primary"/"secondary"-role blob, and useAmbientAccent.ts is still
   called from GameDetail.tsx exactly as before) -- what regressed was
   PROMINENCE, not the mechanism: only 6 of 20 blobs were reactive-role,
   blended just 55/45 toward the fixed cosmic hue, and every blob (reactive
   or not) was in the same narrow 9-15vmax band, so even a correctly-
   shifted blob barely read as different at a glance. Two real fixes here,
   not a revert:
   1. Genuine bimodal size range (6-24vmax, not 9-15) -- 5 deliberately
      large "anchor" blobs plus 15 smaller ones scattered around them,
      per-blob `ratio`/`radius` breaking every one out of a perfect circle
      (see BLOB_RADII above).
   2. Reactive-role blobs raised from 6/20 to 8/20 (still under half, the
      fixed-palette anchors still carry the scene's own identity), 4 of
      the 5 large anchor blobs specifically now reactive (not just small
      fill blobs, which had little visual weight even fully saturated),
      and the color-mix blend ratio in AmbientBackground.css raised from
      55/45 to 72/28 toward the real per-game accent -- a shifted blob now
      reads as clearly that game's color, not a faint tint of the default
      palette. */
const BLOBS: BlobDef[] = [
  // -- 5 large anchor blobs (18-24vmax), spread corners + center, 3 of 5 reactive --
  { left: 12, top: 16, size: 22, ratio: 0.92, radius: BLOB_RADII[0], role: "primary", opacity: 0.52, duration: 82, delay: -10, dx: 3, dy: -2.2, ds: 1.12 },
  { left: 87, top: 20, size: 19, ratio: 1.08, radius: BLOB_RADII[2], role: "secondary", opacity: 0.5, duration: 94, delay: -30, dx: -2.6, dy: 2.4, ds: 0.88 },
  { left: 20, top: 84, size: 24, ratio: 0.88, radius: BLOB_RADII[4], role: "c", opacity: 0.5, duration: 76, delay: -46, dx: -3.2, dy: -2, ds: 0.9 },
  { left: 84, top: 82, size: 18, ratio: 1.12, radius: BLOB_RADII[1], role: "primary", opacity: 0.48, duration: 88, delay: -18, dx: 2.8, dy: 2.6, ds: 1.13 },
  { left: 50, top: 50, size: 20, ratio: 0.95, radius: BLOB_RADII[3], role: "secondary", opacity: 0.44, duration: 100, delay: -55, dx: -2.4, dy: 2.8, ds: 0.89 },

  // -- 15 smaller scattered blobs (6-13vmax), mostly fixed-palette with a few more reactive ones woven in --
  { left: 6, top: 8, size: 8, ratio: 1.15, radius: BLOB_RADII[1], role: "a", opacity: 0.4, duration: 58, delay: -4, dx: 2.2, dy: -1.6, ds: 1.16 },
  { left: 48, top: 6, size: 7, ratio: 0.85, radius: BLOB_RADII[3], role: "b", opacity: 0.38, duration: 52, delay: -8, dx: 1.8, dy: 1.5, ds: 1.18 },
  { left: 68, top: 10, size: 10, ratio: 1.05, radius: BLOB_RADII[5], role: "secondary", opacity: 0.44, duration: 68, delay: -22, dx: -2.2, dy: -1.4, ds: 0.9 },
  { left: 5, top: 38, size: 9, ratio: 0.9, radius: BLOB_RADII[2], role: "c", opacity: 0.4, duration: 64, delay: -14, dx: -2, dy: 2.2, ds: 1.15 },
  { left: 30, top: 33, size: 6, ratio: 1.2, radius: BLOB_RADII[0], role: "b", opacity: 0.36, duration: 48, delay: -2, dx: 2.4, dy: -1.8, ds: 1.2 },
  { left: 72, top: 36, size: 8, ratio: 0.95, radius: BLOB_RADII[4], role: "primary", opacity: 0.46, duration: 60, delay: -26, dx: 2, dy: 1.8, ds: 1.17 },
  { left: 93, top: 42, size: 11, ratio: 1.1, radius: BLOB_RADII[1], role: "a", opacity: 0.42, duration: 72, delay: -34, dx: -1.8, dy: -2, ds: 0.89 },
  { left: 11, top: 63, size: 7, ratio: 0.88, radius: BLOB_RADII[5], role: "b", opacity: 0.38, duration: 56, delay: -18, dx: 2, dy: -2, ds: 1.18 },
  { left: 32, top: 66, size: 13, ratio: 1.02, radius: BLOB_RADII[3], role: "secondary", opacity: 0.46, duration: 78, delay: -40, dx: -2.6, dy: 2, ds: 0.88 },
  { left: 52, top: 68, size: 8, ratio: 1.18, radius: BLOB_RADII[2], role: "a", opacity: 0.4, duration: 54, delay: -6, dx: 2.2, dy: 2.4, ds: 1.19 },
  { left: 70, top: 62, size: 6, ratio: 0.82, radius: BLOB_RADII[0], role: "c", opacity: 0.36, duration: 50, delay: -12, dx: -1.6, dy: -1.8, ds: 1.2 },
  { left: 91, top: 66, size: 10, ratio: 1.06, radius: BLOB_RADII[4], role: "b", opacity: 0.42, duration: 66, delay: -28, dx: 2, dy: 2, ds: 1.14 },
  { left: 8, top: 92, size: 8, ratio: 0.93, radius: BLOB_RADII[3], role: "c", opacity: 0.4, duration: 58, delay: -16, dx: 2.4, dy: -1.6, ds: 1.16 },
  { left: 52, top: 90, size: 11, ratio: 1.14, radius: BLOB_RADII[5], role: "primary", opacity: 0.46, duration: 70, delay: -32, dx: -2.2, dy: 1.8, ds: 0.9 },
  { left: 70, top: 92, size: 7, ratio: 0.9, radius: BLOB_RADII[1], role: "a", opacity: 0.38, duration: 52, delay: -9, dx: 1.8, dy: -2.2, ds: 1.17 },
];

/* FIFTH lava-lamp pass -- see AmbientBackground.css's own top comment for
   the fuller history (the wash-layer diagnosis, then the blob-size
   geometry fix, both confirmed live via real screenshots). This pass only
   rebalances how many blobs there are (5 -> 20, see BLOBS above) and how
   they're rendered (one shared .ambient-blob base class + BLOBS-driven
   inline style, not N hand-written blob-N CSS blocks) -- the base near-
   black background, the tight per-blob falloff, and the "no live filter/
   blend-mode" discipline from the geometry-fix pass are all unchanged.
   Same accent-color sourcing as before: --ambient-primary/--ambient-
   secondary set on :root by useAmbientAccent.ts on a game page (shifting
   the "primary"/"secondary"-role blobs toward that game's real cover-art
   colors), falling back to the exact blue/magenta/purple mockup hues
   everywhere else (homepage, directories, etc.). */
export default function AmbientBackground() {
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const reduced = usePrefersReducedMotion();
  const parallaxRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Pointer parallax on the mesh/conic layers -- writes style.transform
  // straight to the DOM every tick instead of going through React state, so
  // this never triggers a re-render on mouse move (same compositor-only-
  // transform discipline the conic spin itself already documents). Off
  // entirely under reduced motion or while the tab is hidden, matching how
  // the conic spin is already gated.
  //
  // FIX (real cost, not just style): this used to reschedule
  // requestAnimationFrame unconditionally forever, meaning it kept doing
  // lerp math and writing style.transform 60 times a second for the
  // entire time a tab was open, even minutes after the last mouse move
  // with current already equal to target -- pure wasted CPU/battery with
  // zero visual output. Now the loop stops rescheduling itself once it's
  // converged within a sub-pixel threshold, and onPointerMove restarts it
  // only if it had actually stopped.
  useEffect(() => {
    if (reduced || paused) return;
    const node = parallaxRef.current;
    if (!node) return;

    let frame = 0;

    function tick() {
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      node!.style.transform = `translate3d(${current.current.x.toFixed(2)}px, ${current.current.y.toFixed(2)}px, 0)`;

      const settled =
        Math.abs(target.current.x - current.current.x) < 0.05 && Math.abs(target.current.y - current.current.y) < 0.05;
      frame = settled ? 0 : requestAnimationFrame(tick);
    }

    const onPointerMove = (e: PointerEvent) => {
      target.current = {
        x: -(e.clientX / window.innerWidth - 0.5) * PARALLAX_MAX,
        y: -(e.clientY / window.innerHeight - 0.5) * PARALLAX_MAX,
      };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [reduced, paused]);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      <div className="ambient-parallax" ref={parallaxRef}>
        {BLOBS.map((b, i) => {
          const h = b.size * b.ratio;
          return (
            <div
              key={i}
              className={`ambient-blob ambient-blob--${b.role}`}
              style={
                {
                  left: `${b.left}%`,
                  top: `${b.top}%`,
                  width: `${b.size}vmax`,
                  height: `${h}vmax`,
                  marginTop: `${-h / 2}vmax`,
                  marginLeft: `${-b.size / 2}vmax`,
                  borderRadius: b.radius,
                  opacity: b.opacity,
                  "--dur": `${b.duration}s`,
                  "--delay": `${b.delay}s`,
                  "--dx": `${b.dx}vmax`,
                  "--dy": `${b.dy}vmax`,
                  "--ds": b.ds,
                } as CSSProperties
              }
            />
          );
        })}
        {MOTES.map((m, i) => (
          <div
            key={i}
            className="ambient-mote"
            style={{
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              animationDelay: `${m.delay}s`,
              animationDuration: `${m.duration}s`,
            }}
          />
        ))}
      </div>
      <div className="ambient-vault" />
      <div className="ambient-grain" />
    </div>
  );
}

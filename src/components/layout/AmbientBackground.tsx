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
  size: number; // vmax
  role: BlobRole;
  opacity: number;
  duration: number; // s
  delay: number; // s, negative starts the animation partway through its cycle
  dx: number; // vmax
  dy: number; // vmax
  ds: number; // drift scale target
}

/* FIFTH pass, count rebalance -- confirmed live that 5 blobs (even at the
   corrected 18-30vmax size from the geometry fix) read as too sparse/
   blocky against the reference mockup, which wants many small glossy
   blobs scattered across the whole viewport. Hardcoded (not randomized at
   mount, same reasoning as MOTES above) 20-entry jittered grid -- 5
   columns x 4 rows, each cell's exact position/size/role/timing hand-
   varied so it doesn't read as a mechanical repeating pattern. Sizes
   (9-15vmax) are roughly half the smallest blob from the previous pass --
   still large enough to read clearly as a glossy sphere, not a speck, but
   small enough that 20 of them still leave real near-black gaps (the
   geometry-fix pass's whole point) rather than recreating that bug at a
   smaller scale. Roles cycle through the three fixed mockup hues (a/b/c)
   plus "primary"/"secondary" (the game-page-reactive pair) at roughly a
   3:1 ratio -- enough fixed-palette anchors that the scene keeps its own
   identity, enough reactive ones (6 of 20) that a game page's real accent
   colors are still clearly visible in the field, not just token
   presence. */
const BLOBS: BlobDef[] = [
  { left: 8, top: 9, size: 11, role: "a", opacity: 0.42, duration: 62, delay: -4, dx: 2.4, dy: -1.8, ds: 1.15 },
  { left: 30, top: 13, size: 13, role: "primary", opacity: 0.5, duration: 74, delay: -18, dx: -2, dy: 2.2, ds: 0.88 },
  { left: 50, top: 7, size: 9, role: "b", opacity: 0.4, duration: 55, delay: -9, dx: 2, dy: 1.6, ds: 1.18 },
  { left: 69, top: 14, size: 14, role: "c", opacity: 0.48, duration: 80, delay: -30, dx: -2.6, dy: -1.4, ds: 0.9 },
  { left: 90, top: 10, size: 10, role: "secondary", opacity: 0.44, duration: 66, delay: -12, dx: 1.8, dy: 2, ds: 1.14 },

  { left: 6, top: 39, size: 12, role: "b", opacity: 0.46, duration: 70, delay: -25, dx: -2.2, dy: 2.4, ds: 0.89 },
  { left: 29, top: 34, size: 9, role: "c", opacity: 0.4, duration: 58, delay: -6, dx: 2.4, dy: -2, ds: 1.16 },
  { left: 51, top: 40, size: 15, role: "primary", opacity: 0.5, duration: 86, delay: -40, dx: -2, dy: -2.4, ds: 0.87 },
  { left: 72, top: 35, size: 10, role: "a", opacity: 0.42, duration: 60, delay: -15, dx: 2.2, dy: 1.8, ds: 1.17 },
  { left: 92, top: 41, size: 13, role: "b", opacity: 0.46, duration: 76, delay: -33, dx: -1.8, dy: -2.2, ds: 0.9 },

  { left: 10, top: 64, size: 10, role: "c", opacity: 0.42, duration: 64, delay: -20, dx: 2, dy: -2.2, ds: 1.15 },
  { left: 30, top: 59, size: 14, role: "secondary", opacity: 0.48, duration: 82, delay: -37, dx: -2.4, dy: 2, ds: 0.88 },
  { left: 50, top: 65, size: 9, role: "a", opacity: 0.4, duration: 56, delay: -8, dx: 2.2, dy: 2.2, ds: 1.19 },
  { left: 70, top: 58, size: 12, role: "b", opacity: 0.44, duration: 72, delay: -28, dx: -2, dy: -1.8, ds: 0.89 },
  { left: 90, top: 63, size: 11, role: "c", opacity: 0.42, duration: 68, delay: -14, dx: 2, dy: 2, ds: 1.14 },

  { left: 9, top: 89, size: 13, role: "primary", opacity: 0.48, duration: 78, delay: -22, dx: -2.2, dy: -2, ds: 0.88 },
  { left: 31, top: 84, size: 9, role: "a", opacity: 0.4, duration: 54, delay: -3, dx: 2, dy: 1.6, ds: 1.18 },
  { left: 50, top: 91, size: 15, role: "c", opacity: 0.5, duration: 88, delay: -44, dx: -2.6, dy: 1.8, ds: 0.87 },
  { left: 69, top: 86, size: 10, role: "b", opacity: 0.42, duration: 60, delay: -17, dx: 1.8, dy: -2.2, ds: 1.16 },
  { left: 91, top: 90, size: 12, role: "secondary", opacity: 0.46, duration: 74, delay: -26, dx: -2, dy: 2.2, ds: 0.89 },
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
        {BLOBS.map((b, i) => (
          <div
            key={i}
            className={`ambient-blob ambient-blob--${b.role}`}
            style={
              {
                left: `${b.left}%`,
                top: `${b.top}%`,
                width: `${b.size}vmax`,
                height: `${b.size}vmax`,
                marginTop: `${-b.size / 2}vmax`,
                marginLeft: `${-b.size / 2}vmax`,
                opacity: b.opacity,
                "--dur": `${b.duration}s`,
                "--delay": `${b.delay}s`,
                "--dx": `${b.dx}vmax`,
                "--dy": `${b.dy}vmax`,
                "--ds": b.ds,
              } as CSSProperties
            }
          />
        ))}
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

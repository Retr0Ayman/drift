import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import LavaLampCanvas from "./LavaLampCanvas";
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

/* EIGHTH pass -- replaced the entire DOM/CSS blob field (20 divs, each a
   radial-gradient + irregular border-radius, independently drifting via
   CSS keyframes) with LavaLampCanvas: a real Canvas2D metaball
   simulation. Every prior CSS-only pass, no matter how many blobs or how
   irregular their shapes, fundamentally could not produce actual
   merging/splitting -- overlapping CSS shapes just overlap, they never
   fuse into one connected shape with a real seam. See LavaLampCanvas.tsx
   for the full technique (blur+contrast on a single canvas bitmap, not a
   filtered DOM subtree) and why it doesn't reintroduce the ~30fps
   regression this codebase's own history already measured for a
   filtered live DOM subtree. Every blob is now reactive to the live
   per-game accent colors (not a minority "reactive-role" subset) --
   confirmed live in the previous pass that splitting blobs into "some
   react, most don't" read as inconsistent in a field meant to look like
   one connected substance. */
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
        <LavaLampCanvas />
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

import { useEffect, useRef, useState } from "react";
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

/* THIRD lava-lamp pass -- see AmbientBackground.css's own top comment for
   the full diagnosis of why the first two passes never visibly shipped
   (a leftover full-viewport wash layer, `.ambient-mesh`, dominated over
   the darkened base and glossy blobs both times). That layer is deleted
   here, not just dimmed -- five large glossy blobs (one per corner + one
   centered, up from four, for genuine full-viewport spread) are now the
   ONLY color source over a true near-black base. Still a purely CSS
   effect, motion restricted to `transform`/`opacity` -- never
   `filter: url(...)` or a live blend-mode, a deliberate choice (not an
   oversight) after finding this exact codebase's own history already
   measured a full-viewport SVG goo filter at ~30fps and removed it for
   that reason (see AmbientBackground.css). Same accent-color sourcing as
   before: --ambient-primary/--ambient-secondary set on :root by
   useAmbientAccent.ts on a game page (shifting three of the five blobs
   toward that game's real cover-art colors), falling back to the exact
   blue/magenta/purple mockup hues -- not the old muted neutral pair --
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
        <div className="ambient-blob-1" />
        <div className="ambient-blob-2" />
        <div className="ambient-blob-3" />
        <div className="ambient-blob-4" />
        <div className="ambient-blob-5" />
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

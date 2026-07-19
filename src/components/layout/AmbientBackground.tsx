import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import "./AmbientBackground.css";

// How far (px) the mesh/conic layers drift opposite the pointer. CSS gives
// .ambient-parallax a -32px inset buffer beyond the viewport specifically
// so this can move without ever exposing the page background at an edge.
const PARALLAX_MAX = 18;

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
  const reduced = usePrefersReducedMotion();
  const parallaxRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const sheenTarget = useRef<{ el: Element | null; x: number; y: number }>({ el: null, x: 0, y: 0 });

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Pointer parallax on the mesh/conic layers, plus the cursor-tracked glass
  // highlight (globals.css's .liquid-sheen::after), off the same rAF loop --
  // writes style.transform/custom-properties straight to the DOM every tick
  // instead of going through React state, so this never triggers a
  // re-render on mouse move (same compositor-only-transform discipline the
  // conic spin itself already documents). One delegated pointermove
  // listener drives both effects rather than adding a second global
  // listener just for the glass highlight. Off entirely under reduced
  // motion or while the tab is hidden, matching how the conic spin is
  // already gated.
  useEffect(() => {
    if (reduced || paused) return;
    const node = parallaxRef.current;
    if (!node) return;

    const onPointerMove = (e: PointerEvent) => {
      target.current = {
        x: -(e.clientX / window.innerWidth - 0.5) * PARALLAX_MAX,
        y: -(e.clientY / window.innerHeight - 0.5) * PARALLAX_MAX,
      };
      sheenTarget.current = { el: e.target as Element | null, x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let frame = requestAnimationFrame(function tick() {
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      node.style.transform = `translate3d(${current.current.x.toFixed(2)}px, ${current.current.y.toFixed(2)}px, 0)`;

      const panel = sheenTarget.current.el?.closest<HTMLElement>(".liquid-sheen");
      if (panel) {
        const rect = panel.getBoundingClientRect();
        const sx = ((sheenTarget.current.x - rect.left) / rect.width) * 100;
        const sy = ((sheenTarget.current.y - rect.top) / rect.height) * 100;
        panel.style.setProperty("--sheen-x", `${sx.toFixed(1)}%`);
        panel.style.setProperty("--sheen-y", `${sy.toFixed(1)}%`);
      }

      frame = requestAnimationFrame(tick);
    });

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced, paused]);

  return (
    <div className={`ambient-bg${paused ? " ambient-bg--paused" : ""}`} aria-hidden="true">
      <div className="ambient-parallax" ref={parallaxRef}>
        <div className="ambient-mesh" />
        <div className="ambient-conic" />
        <div className="ambient-conic-2" />
        <div className="ambient-blob-1" />
        <div className="ambient-blob-2" />
      </div>
      <div className="ambient-grain" />
    </div>
  );
}

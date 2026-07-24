import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

/* Real metaball simulation -- replaces the previous approach (20 static
   DOM divs, each a radial-gradient + irregular border-radius, drifting
   independently via CSS keyframes) after repeated confirmed-live rounds
   established that approach fundamentally can't produce real merging/
   splitting: CSS shapes don't interact with each other, no matter how
   many divs or how irregular their border-radius, two overlapping
   gradients just overlap, they never fuse into one connected shape with
   a real seam the way this brief (and the earlier "goo/metaball" work
   this session's own git history documents, see below) actually wants.

   This IS the real goo/metaball technique -- draw solid, opaque, moving
   circles onto a canvas, then apply `filter: blur() contrast()` to the
   canvas ELEMENT: blur softens each circle's edge into a soft alpha
   falloff (CSS blur affects the alpha channel, not just RGB), and where
   two blurred circles' soft edges overlap, the combined region reads as
   more solid; contrast() then snaps everything above/below a threshold
   to fully opaque/fully transparent, so overlapping blobs fuse into one
   connected shape with a smooth seam, and drifting apart past that
   threshold makes them visibly pinch and split back into two. This is
   the actual physical behavior a real lava lamp has -- CSS shape tricks
   never could produce it, only real per-pixel interaction can.

   Why this doesn't reintroduce the SVG-filter regression this codebase's
   own history already measured (~30fps for a full-viewport `filter:
   url(#goo)` applied to a DOM subtree with 12 independently-animating
   child divs, see AmbientBackground.css's git log): the filter here
   applies to exactly ONE element -- a `<canvas>`, which is a single flat
   bitmap with no DOM children to re-rasterize. Circle positions update
   in a plain Canvas2D draw loop (cheap: N `arc()`+`fill()` calls onto a
   deliberately low-resolution internal buffer, see SCALE below), and the
   blur+contrast filter is a standard GPU-compositable effect on that one
   fixed-size texture -- architecturally nothing like filtering a live,
   growing DOM subtree. */

// Internal canvas resolution is a FRACTION of the real viewport, computed
// from window.innerWidth/innerHeight (not a fixed constant) so the
// internal buffer's aspect ratio always matches the CSS-rendered size
// exactly -- stretching a mismatched aspect ratio would render every
// circle as an ellipse. Deliberately low (0.3x) since the heavy blur this
// technique needs already hides the reduced resolution, and keeping the
// pixel count small is what bounds the per-frame fill cost regardless of
// how large or high-DPI the actual monitor is.
const RES_SCALE = 0.3;
const MIN_W = 220;
const MIN_H = 140;

// Exactly the three approved-mockup hues -- mirrors tokens.css's
// --cosmic-a/b/c (hand-synced, same "small deliberate copy across a
// build boundary" pattern worker/shared/constants.ts already documents
// for its own mirror of src/lib/constants.ts, just across a JS-vs-CSS
// boundary here instead of a worker-vs-frontend one: a canvas fillStyle
// needs a real JS color string, it can't read a CSS custom property
// directly the way a DOM element's own background can).
const BASE_HUES: [number, number, number][] = [
  [239, 61, 134], // --cosmic-a, magenta/pink #ef3d86
  [63, 196, 240], // --cosmic-b, blue #3fc4f0
  [123, 63, 242], // --cosmic-c, purple #7b3ff2
];
const FALLBACK_PRIMARY: [number, number, number] = [63, 196, 240]; // matches --cosmic-b
const FALLBACK_SECONDARY: [number, number, number] = [239, 61, 134]; // matches --cosmic-a

// How much every blob leans toward the live per-game accent color when one
// is actually set (0 = ignores it entirely, 1 = pure accent, no base-hue
// character left) -- see the `hasAccent` gate in the draw loop below:
// this only ever applies on a real game page. On every other page (no
// --ambient-primary/secondary set at all), blend is forced to 0 so the
// full three-hue BASE_HUES palette stays genuinely visible -- confirmed
// live (real screenshot) that blending toward the FALLBACK colors
// unconditionally, even on non-game pages, washed out the purple hue
// almost entirely (the fallback pair is itself only 2 of the 3 base
// hues, so blending every blob 68% toward one of those two collapses
// the palette from three colors down to two everywhere, not just on
// game pages).
const ACCENT_BLEND = 0.55;

interface Blob {
  x: number; // 0..1 fraction of canvas width
  y: number; // 0..1 fraction of canvas height
  vx: number;
  vy: number;
  r: number; // 0..1 fraction of min(width,height)
  hue: number; // index into BASE_HUES
  accentSlot: 0 | 1; // which accent color (primary/secondary) this blob leans toward
}

// FIX (confirmed live): the first real metaball pass used 16 blobs at
// 0.16-0.26 (anchors) / 0.06-0.15 (small) radius fractions -- combined
// with real merging (the whole point), that density/size fused into two
// or three giant connected masses that ate almost all the near-black
// negative space, the exact "wash" failure mode a much earlier pass
// already had to fix once for the old DOM-blob version. Pulled back on
// both axes: fewer blobs, smaller radii -- still merges/splits for real
// as they drift (that's the rendering technique, not something size
// controls), just with real black gaps surviving between the fused
// clusters instead of the whole viewport reading as two colors.
const BLOB_COUNT = 13;

function makeBlobs(): Blob[] {
  const blobs: Blob[] = [];
  for (let i = 0; i < BLOB_COUNT; i++) {
    const big = i < 4; // first 4 are deliberately larger "anchor" blobs, rest smaller
    blobs.push({
      x: 0.08 + Math.random() * 0.84,
      y: 0.08 + Math.random() * 0.84,
      vx: (Math.random() - 0.5) * 0.0026,
      vy: (Math.random() - 0.5) * 0.0026,
      r: big ? 0.1 + Math.random() * 0.06 : 0.04 + Math.random() * 0.055,
      hue: i % BASE_HUES.length,
      accentSlot: i % 2 === 0 ? 0 : 1,
    });
  }
  return blobs;
}

function mixColor(base: [number, number, number], accent: [number, number, number], t: number): string {
  const r = Math.round(base[0] + (accent[0] - base[0]) * t);
  const g = Math.round(base[1] + (accent[1] - base[1]) * t);
  const b = Math.round(base[2] + (accent[2] - base[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function LavaLampCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef<Blob[]>(makeBlobs());
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const w = Math.max(MIN_W, Math.round(window.innerWidth * RES_SCALE));
      const h = Math.max(MIN_H, Math.round(window.innerHeight * RES_SCALE));
      canvas!.width = w;
      canvas!.height = h;
    }
    resize();
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 200);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    let tick = 0;
    let paused = document.hidden;
    let accentPrimary = FALLBACK_PRIMARY;
    let accentSecondary = FALLBACK_SECONDARY;
    // True only when useAmbientAccent.ts has actually set a real per-game
    // color on <html> (a game detail page). Gates ACCENT_BLEND to 0 on
    // every other page instead of blending toward the fallback pair
    // unconditionally -- see ACCENT_BLEND's own comment for why that
    // unconditional blend was silently collapsing the three-hue palette
    // down to two everywhere, not just on game pages.
    let hasAccent = false;

    // Re-read the live per-game accent colors periodically (every ~20
    // frames, not every frame) -- useAmbientAccent.ts sets these as plain
    // inline custom properties on <html>, no event this component could
    // subscribe to instead, and a getComputedStyle read is cheap but not
    // free, so this throttles it rather than calling it 60x/sec.
    function readAccent() {
      const cs = getComputedStyle(document.documentElement);
      const p = hexToRgb(cs.getPropertyValue("--ambient-primary"));
      const s = hexToRgb(cs.getPropertyValue("--ambient-secondary"));
      hasAccent = !!(p || s);
      accentPrimary = p || FALLBACK_PRIMARY;
      accentSecondary = s || FALLBACK_SECONDARY;
    }
    readAccent();

    function step() {
      const blobs = blobsRef.current;
      for (const b of blobs) {
        b.x += b.vx;
        b.y += b.vy;
        // Soft bounce off the canvas edges (with a small overshoot margin
        // so a blob can drift slightly off-canvas before turning back,
        // reading as less mechanical than a hard wall) -- this alone,
        // combined with each blob's own independent velocity, is what
        // makes blobs drift toward and away from each other over time;
        // the actual merging/splitting look is entirely a property of the
        // blur+contrast rendering below, not anything simulated here.
        if (b.x < -0.06 || b.x > 1.06) b.vx *= -1;
        if (b.y < -0.06 || b.y > 1.06) b.vy *= -1;
        // Gentle continuous random drift on velocity itself (not just
        // position) -- keeps the motion organic over long timescales
        // instead of settling into a perfectly periodic bounce loop.
        b.vx += (Math.random() - 0.5) * 0.00018;
        b.vy += (Math.random() - 0.5) * 0.00018;
        const maxSpeed = 0.0032;
        const speed = Math.hypot(b.vx, b.vy);
        if (speed > maxSpeed) {
          b.vx = (b.vx / speed) * maxSpeed;
          b.vy = (b.vy / speed) * maxSpeed;
        }
      }
    }

    function draw() {
      const w = canvas!.width;
      const h = canvas!.height;
      const minDim = Math.min(w, h);
      ctx!.clearRect(0, 0, w, h);
      for (const b of blobsRef.current) {
        const accent = b.accentSlot === 0 ? accentPrimary : accentSecondary;
        ctx!.fillStyle = mixColor(BASE_HUES[b.hue], accent, hasAccent ? ACCENT_BLEND : 0);
        ctx!.beginPath();
        ctx!.arc(b.x * w, b.y * h, b.r * minDim, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function loop() {
      tick++;
      if (tick % 20 === 0) readAccent();
      step();
      draw();
      if (!paused) raf = requestAnimationFrame(loop);
    }

    if (reduced) {
      draw(); // one static frame, no motion, no loop
    } else {
      raf = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      paused = document.hidden;
      if (!paused && !reduced && !raf) raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return <canvas ref={canvasRef} className="ambient-canvas" aria-hidden="true" />;
}

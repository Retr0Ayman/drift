import "./AmbientBackground.css";

/* Global, fixed, full-viewport light-source layer that sits behind every
   route. It's the thing GlassPanel's backdrop-filter and the navbar's
   scroll-scaled blur actually sample -- without a moving layer back here,
   "translucent" glass was blurring a flat color, which is indistinguishable
   from a solid one. Three soft radial-gradient blobs (no CSS blur filter --
   the softness comes from the gradient's own falloff, which is far cheaper
   to composite than filter: blur() on an element this large) drift slowly
   via transform/opacity only, so this stays on the GPU compositor thread
   and never touches layout. prefers-reduced-motion is handled by the
   blanket animation-freeze rule in globals.css -- every blob's keyframes
   start and end at the same resting transform, so freezing mid-animation
   still lands on a clean static frame, not a random one. */
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-blob ambient-blob--a" />
      <div className="ambient-blob ambient-blob--b" />
      <div className="ambient-blob ambient-blob--c" />
    </div>
  );
}

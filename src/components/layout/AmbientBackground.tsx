import "./AmbientBackground.css";

/* Fixed, full-viewport layer behind every route -- three soft radial-
   gradient blobs (no blur filter, the falloff itself provides the
   softness) drifting slowly via transform only, cheap on the GPU
   compositor thread. Subtle by design: a tinted-paper wash, not a light
   source. prefers-reduced-motion freezes on a resting frame via the
   blanket rule in globals.css. */
export default function AmbientBackground() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="ambient-blob ambient-blob--a" />
      <div className="ambient-blob ambient-blob--b" />
      <div className="ambient-blob ambient-blob--c" />
    </div>
  );
}

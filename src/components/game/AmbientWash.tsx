import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import "./AmbientWash.css";

interface AmbientWashProps {
  gameId: string;
  primary?: string | null;
  secondary?: string | null;
}

// Same fixed neutral pair worker/shared/colorExtract.ts falls back to --
// covers rows this game's D1 row predates the accent-color backfill for,
// or where extraction genuinely never cleared the saturation gate.
const FALLBACK_PRIMARY = "#6b4fa0";
const FALLBACK_SECONDARY = "#4a3570";

/* One-time "paint spill" reveal on game detail pages: a radial wash in the
   game's own cover-art colors, originating near the carousel's position
   (top-left of the content column), expanding once on mount into a low-
   opacity static backdrop behind every glass panel on the page. Keyed by
   gameId so navigating from one game to another replays it, but re-renders
   of the *same* game (P2P merge effects, etc.) don't retrigger it.
   prefers-reduced-motion skips straight to the settled end-state -- no
   animation, not a toned-down one, matching Reveal.tsx's own rule. */
export default function AmbientWash({ gameId, primary, secondary }: AmbientWashProps) {
  const reduced = usePrefersReducedMotion();
  const style = {
    "--wash-a": primary || FALLBACK_PRIMARY,
    "--wash-b": secondary || FALLBACK_SECONDARY,
  } as CSSProperties;

  if (reduced) {
    return <div className="ambient-wash ambient-wash--settled" style={style} />;
  }

  return (
    <motion.div
      key={gameId}
      className="ambient-wash"
      style={style}
      initial={{ opacity: 0.5, scale: 0.08 }}
      animate={{ opacity: 0.22, scale: 1 }}
      transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}

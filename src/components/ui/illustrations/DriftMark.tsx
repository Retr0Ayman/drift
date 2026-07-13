import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";

/* The nav-logo bracket glyph, scalable to hero size. Draws itself in via
   pathLength on mount -- a one-shot entrance, not a looping effect -- so the
   name of the product is the first thing that finishes forming on screen. */
export default function DriftMark({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <motion.circle
        cx="12"
        cy="12"
        r="7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

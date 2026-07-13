import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../../hooks/usePrefersReducedMotion";

/* The nav-logo bracket glyph, scalable to hero size. Draws itself in via
   pathLength on mount -- a one-shot entrance, not a looping effect -- so the
   name of the product is the first thing that finishes forming on screen. */
export default function DriftMark({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <motion.path
        d="M8 18V6h4.5c3 0 4.5 2.2 4.5 6s-1.5 6-4.5 6H8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.15, ease: [0.16, 1, 0.3, 1] }}
      />
    </svg>
  );
}

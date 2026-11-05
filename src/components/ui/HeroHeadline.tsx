import type { ReactNode } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { EASE } from "../../lib/motion";

/* One-time entrance on load: fade, a slight rise, and tracking that settles
   from a touch looser to its final value. Opacity-only under reduced motion. */
export default function HeroHeadline({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <h2 className={className}>{children}</h2>;
  return (
    <motion.h2
      className={className}
      initial={{ opacity: 0, y: 14, letterSpacing: "-0.012em" }}
      animate={{ opacity: 1, y: 0, letterSpacing: "-0.03em" }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      {children}
    </motion.h2>
  );
}

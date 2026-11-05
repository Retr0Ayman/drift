import type { ReactNode } from "react";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { REVEAL_TRANSITION, REVEAL_VIEWPORT, REVEAL_Y } from "../../lib/motion";

const TAGS = {
  div: motion.div,
  section: motion.section,
  li: motion.li,
  article: motion.article,
} as const;

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: keyof typeof TAGS;
}

/* Scroll-triggered fade+slide, Apple/Linear style. transform+opacity only (no
   layout-affecting properties), so this stays cheap even with many instances
   on one page (e.g. a full grid of cards). Disabled under
   prefers-reduced-motion -- renders the plain tag with no animation, not a
   toned-down version of it. */
export default function Reveal({ children, delay = 0, y = REVEAL_Y, className, as = "div" }: RevealProps) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  const Component = TAGS[as];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ ...REVEAL_TRANSITION, delay }}
    >
      {children}
    </Component>
  );
}

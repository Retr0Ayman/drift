import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

/* Fade+rise on every route change, same [0.16, 1, 0.3, 1] ease and transform-
   only motion Reveal already uses elsewhere on the site -- keyed on the full
   pathname (not just the route pattern), so navigating game-to-game or
   group-to-group re-triggers it too, not just switching between sections.
   Lives inside App.tsx's Suspense boundary, wrapping the Outlet directly, so
   the animation runs once the real page content is ready to show, not on an
   empty container while the lazy chunk is still loading behind
   RouteFallback. No exit animation / AnimatePresence -- that interacts
   poorly with Suspense-driven unmounts, and the incoming page's own fade-in
   already reads as a clean transition without it. */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useLenis } from "lenis/react";
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
  // SmoothScroll.tsx wraps the whole app in a global root Lenis instance
  // (skipped only under prefers-reduced-motion) -- Lenis intercepts and
  // re-asserts its OWN interpolated scroll position every animation frame,
  // so a bare window.scrollTo() gets fought/overridden on the very next
  // frame instead of actually landing at the top. CONFIRMED live: this was
  // the real cause of game pages loading mid-scroll, not a layout-shift or
  // focus-stealing issue -- window.scrollTo(0,0) alone left the page stuck
  // wherever Lenis's own untouched internal state still pointed.
  const lenis = useLenis();

  // location.key (not location.pathname) -- pathname is UNCHANGED when
  // navigating back/forward to a previously-visited URL, so an effect keyed
  // on pathname alone silently never re-fires for that case, leaving
  // whatever scroll position the browser's native history restoration (or
  // Lenis's own carried-over state) left the page at. key is a fresh value
  // per history entry, so this fires on every real navigation, including
  // returning to an identical route.
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [location.key, lenis]);

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

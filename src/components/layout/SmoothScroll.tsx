import type { ReactNode } from "react";
import { ReactLenis } from "lenis/react";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

/* Wraps the whole app in a global (root) Lenis instance for inertial scroll.
   `root` means it hijacks window scroll directly, no extra wrapper divs that
   would break position:sticky (the navbar depends on it). Skipped entirely
   under prefers-reduced-motion -- native scroll behaves exactly as users
   asked for, not just a softer version of the same effect. */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.11, duration: 1.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  );
}

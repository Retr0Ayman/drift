import { useEffect } from "react";

/* Mirrors a game page's accent colors onto :root as CSS custom properties
   so the site-wide AmbientBackground layer (mounted once in main.tsx, well
   outside this component tree, no prop channel down to it) can pick up the
   same per-game colors AmbientWash already renders locally. Cleared on
   unmount so navigating away from a game page drops back to
   AmbientBackground.css's own FALLBACK_PRIMARY/SECONDARY defaults instead
   of leaking the last-viewed game's hue onto the homepage/directories. */
export function useAmbientAccent(primary?: string | null, secondary?: string | null): void {
  useEffect(() => {
    if (!primary && !secondary) return;
    const root = document.documentElement.style;
    if (primary) root.setProperty("--ambient-primary", primary);
    if (secondary) root.setProperty("--ambient-secondary", secondary);
    return () => {
      root.removeProperty("--ambient-primary");
      root.removeProperty("--ambient-secondary");
    };
  }, [primary, secondary]);
}

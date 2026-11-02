import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// One-time (or re-triggered on real change) count-up animation for an
// already-known real number -- never a fake/randomized "loading" digit
// sequence, just an entrance flourish on the true value. Animates from
// whatever's currently displayed, not always from 0, so a value that
// increases again mid-animation (Hero's stats as useLiveCatalog streams in
// more pages) never visibly resets to zero. Skips the animation entirely
// under reduced-motion, returning the final value immediately.
export function useCountUp(value: number, duration = 900): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const displayRef = useRef(display);
  const frameRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    cancelAnimationFrame(frameRef.current);
    const start = performance.now();
    const from = displayRef.current;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const next = Math.round(from + (value - from) * easeOutExpo(t));
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration, reduced]);

  return display;
}

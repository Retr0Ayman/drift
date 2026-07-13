import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import "./IntroAnimation.css";

const SESSION_KEY = "drift.introSeen";
const HOLD_MS = 2200;
const ZOOM_MS = 650;

interface Target {
  x: number;
  y: number;
  scale: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Full-screen splash on first load of a session: logo holds centered, then
   zooms/translates into the real navbar logo's on-screen position (measured
   via getBoundingClientRect, not guessed) while the overlay fades away to
   reveal the already-mounted app underneath. Gated on sessionStorage so it
   plays once per tab session, not on every client-side nav back to "/". */
export default function IntroAnimation() {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [target, setTarget] = useState<Target | null>(null);
  const markRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) || prefersReducedMotion()) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setPhase("done");
      return;
    }

    setPhase("playing");
    document.body.style.overflow = "hidden";

    const holdTimer = setTimeout(() => {
      const real = document.querySelector<HTMLElement>(".navbar-mark");
      const mine = markRef.current;
      if (real && mine) {
        const r = real.getBoundingClientRect();
        const m = mine.getBoundingClientRect();
        setTarget({
          scale: r.width / m.width,
          x: r.left + r.width / 2 - (m.left + m.width / 2),
          y: r.top + r.height / 2 - (m.top + m.height / 2),
        });
      } else {
        setTarget({ x: -window.innerWidth / 2 + 50, y: -window.innerHeight / 2 + 32, scale: 0.28 });
      }
    }, HOLD_MS);

    return () => clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (!target) return;
    const finishTimer = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      document.body.style.overflow = "";
      setPhase("done");
    }, ZOOM_MS);
    return () => clearTimeout(finishTimer);
  }, [target]);

  useEffect(() => {
    if (phase !== "playing") return;
    const skip = () => {
      sessionStorage.setItem(SESSION_KEY, "1");
      document.body.style.overflow = "";
      setPhase("done");
    };
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, [phase]);

  function handleSkipClick() {
    sessionStorage.setItem(SESSION_KEY, "1");
    document.body.style.overflow = "";
    setPhase("done");
  }

  return (
    <AnimatePresence>
      {phase === "playing" ? (
        <motion.div
          className="intro-overlay"
          onClick={handleSkipClick}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <motion.div
            ref={markRef}
            className="intro-mark"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={
              target
                ? { opacity: 1, scale: target.scale, x: target.x, y: target.y }
                : { opacity: 1, scale: 1, x: 0, y: 0 }
            }
            transition={target ? { duration: ZOOM_MS / 1000, ease: [0.65, 0, 0.35, 1] } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2.2" />
            </svg>
          </motion.div>

          <motion.div
            className="intro-word"
            initial={{ opacity: 0, y: 12 }}
            animate={target ? { opacity: 0, y: -6 } : { opacity: 1, y: 0 }}
            transition={target ? { duration: 0.3 } : { duration: 0.5, delay: 0.3 }}
          >
            Orvyn
          </motion.div>

          <motion.div
            className="intro-sub"
            initial={{ opacity: 0, y: 8 }}
            animate={target ? { opacity: 0, y: -4 } : { opacity: 1, y: 0 }}
            transition={target ? { duration: 0.3 } : { duration: 0.5, delay: 0.85 }}
          >
            BY DAREALAYMAN
          </motion.div>

          <button className="intro-skip" onClick={handleSkipClick}>
            Skip ›
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

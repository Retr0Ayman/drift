import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import "./IntroAnimation.css";

const SESSION_KEY = "drift.introSeen";
const REVEAL_DELAY_MS = 500;
const HOLD_MS = 2200;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Splash: a big "o" holds centered, "rlaz" reveals beside it, then the
   overlay exits while the "o" -- sharing a layoutId with the navbar's own
   "o" -- animates into the wordmark's real position via Framer Motion's
   layout projection, no manual measurement needed. Gated on sessionStorage
   so it plays once per tab session. */
interface IntroAnimationProps {
  onDone?: () => void;
}

export default function IntroAnimation({ onDone }: IntroAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [revealRest, setRevealRest] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function finish() {
    timers.current.forEach(clearTimeout);
    sessionStorage.setItem(SESSION_KEY, "1");
    document.body.style.overflow = "";
    setPhase("done");
    onDone?.();
  }

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) || prefersReducedMotion()) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setPhase("done");
      onDone?.();
      return;
    }

    setPhase("playing");
    document.body.style.overflow = "hidden";
    timers.current = [setTimeout(() => setRevealRest(true), REVEAL_DELAY_MS), setTimeout(finish, HOLD_MS)];

    window.addEventListener("keydown", finish);
    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener("keydown", finish);
    };
  }, []);

  return (
    <AnimatePresence>
      {phase === "playing" ? (
        <motion.div
          className="intro-overlay"
          onClick={finish}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="intro-word-row">
            <motion.span layoutId="brand-o" className="intro-o">
              o
            </motion.span>
            {revealRest ? (
              <motion.span
                className="intro-rest"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                rlaz
              </motion.span>
            ) : null}
          </div>

          <motion.div
            className="intro-sub"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: revealRest ? 1 : 0, y: revealRest ? 0 : 8 }}
            transition={{ duration: 0.5 }}
          >
            BY DAREALAYMAN
          </motion.div>

          <button className="intro-skip" onClick={finish}>
            Skip ›
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

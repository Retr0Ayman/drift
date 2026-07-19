import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import DriftMark from "../ui/illustrations/DriftMark";
import "./IntroAnimation.css";

const REVEAL_DELAY_MS = 500;
const HOLD_MS = 2200;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Splash: the real DriftMark icon (not a stand-in text glyph) holds large
   and centered, "rlaz" reveals beside it, then the overlay exits while the
   icon -- sharing a layoutId with the navbar's own icon -- animates into
   the wordmark's real position via Framer Motion's layout projection, no
   manual measurement needed. IntroAnimation is mounted once at Layout's
   root (App.tsx), outside the routed <Outlet/>, so this effect's empty
   dependency array only ever re-runs on an actual fresh mount of Layout --
   a real page load/refresh -- never on in-app route navigation between
   child routes, which leaves Layout mounted. No session/persistence gate
   needed to get "plays once per page load": that's just what mounting
   once per load already means. */
interface IntroAnimationProps {
  onDone?: () => void;
}

export default function IntroAnimation({ onDone }: IntroAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "playing" | "done">("idle");
  const [revealRest, setRevealRest] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function finish() {
    // Removed first, not just in the effect's cleanup below -- this
    // component itself never unmounts (it's rendered unconditionally at
    // Layout's root for the whole session; only its overlay child
    // conditionally renders via `phase`), so the effect's cleanup never
    // runs from a normal "the intro is done" transition, only from an
    // actual unmount that never happens. Without this, the listener stayed
    // attached for the rest of the session and finish() fired again on
    // every subsequent keystroke anywhere on the site -- including typing
    // into the search palette -- each time redundantly resetting
    // document.body.style.overflow, which stomped on Radix Dialog's own
    // scroll-lock overflow:hidden while the palette was open and produced
    // a real, reproduced-live scroll-to-bottom jump.
    window.removeEventListener("keydown", finish);
    timers.current.forEach(clearTimeout);
    document.body.style.overflow = "";
    setPhase("done");
    onDone?.();
  }

  useEffect(() => {
    if (prefersReducedMotion()) {
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
            <motion.div layoutId="brand-mark" className="intro-mark">
              <DriftMark />
            </motion.div>
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

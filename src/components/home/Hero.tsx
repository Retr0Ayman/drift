import { motion } from "motion/react";
import DriftMark from "../ui/illustrations/DriftMark";
import DriftGlyph from "../ui/illustrations/DriftGlyph";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import "./Hero.css";

export default function Hero() {
  const reduced = usePrefersReducedMotion();
  const fadeUp = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="hero">
      <DriftGlyph className="hero-glyph" />
      <div className="hero-content">
        <motion.div className="hero-mark" {...fadeUp(0)}>
          <DriftMark />
        </motion.div>
        <motion.h1 className="hero-word" {...fadeUp(0.35)}>
          DRIFT
        </motion.h1>
        <motion.p className="hero-tag" {...fadeUp(0.55)}>
          Crack · build · drift tracker
        </motion.p>
        <motion.p className="hero-desc" {...fadeUp(0.65)}>
          Live crack, build and version status for PC games — hypervisor and traditional cracks side by
          side, flagged the moment either falls behind the latest patch.
        </motion.p>
        <motion.div className="hero-scrollcue" {...fadeUp(0.9)}>
          <span>The catalogue</span>
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </div>
    </section>
  );
}

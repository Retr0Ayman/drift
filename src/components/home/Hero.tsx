import { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import DriftMark from "../ui/illustrations/DriftMark";
import DriftGlyph from "../ui/illustrations/DriftGlyph";
import GlassPanel from "../ui/GlassPanel";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { gStatus, anyOutdated } from "../../lib/format";
import { gTimestamp } from "../../lib/catalog";
import type { Game } from "../../types/game";
import "./Hero.css";

export default function Hero({ games }: { games: Game[] }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // The signature scroll moment for this section: as the hero scrolls out
  // from under the floating navbar, its content recedes (fades + scales
  // down + drifts up slightly) instead of just being clipped by the
  // viewport edge -- a considered exit, not a hard cut into the catalogue.
  const heroOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -40]);

  const fadeUp = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  const stats = useMemo(() => {
    const hv = games.filter((g) => gStatus(g) === "hv").length;
    const outdated = games.filter((g) => anyOutdated(g)).length;
    const lastTs = games.reduce((mx, g) => Math.max(mx, gTimestamp(g)), 0);
    const lastLabel = lastTs
      ? new Date(lastTs).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";
    return { total: games.length, hv, outdated, lastLabel };
  }, [games]);

  return (
    <motion.section
      ref={ref}
      className="hero"
      style={reduced ? undefined : { opacity: heroOpacity, scale: heroScale, y: heroY }}
    >
      <div className="hero-grid">
        <div className="hero-primary">
          <motion.div className="hero-mark" {...fadeUp(0)}>
            <DriftMark />
          </motion.div>
          <motion.h1 className="hero-word" {...fadeUp(0.15)}>
            Orvyn
          </motion.h1>
          <motion.p className="hero-tag" {...fadeUp(0.3)}>
            Crack · build · drift tracker
          </motion.p>
          <motion.p className="hero-desc" {...fadeUp(0.4)}>
            Live crack, build and version status for PC games — hypervisor and traditional cracks side by
            side, flagged the moment either falls behind the latest patch.
          </motion.p>
          <motion.div className="hero-scrollcue" {...fadeUp(0.6)}>
            <span>The catalogue</span>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        </div>

        <motion.div className="hero-secondary" {...fadeUp(0.5)}>
          <GlassPanel strong className="hero-signal">
            <DriftGlyph className="hero-signal-glyph" />
            <div className="hero-signal-head">Live signal</div>
            <div className="hero-signal-grid">
              <div className="hero-signal-stat">
                <span className="hero-signal-n">{stats.total ? stats.total : "—"}</span>
                <span className="hero-signal-l">Titles tracked</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-n" style={{ color: "var(--hv)" }}>
                  {stats.total ? stats.hv : "—"}
                </span>
                <span className="hero-signal-l">Hypervisor cracks</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-n" style={{ color: "var(--out)" }}>
                  {stats.total ? stats.outdated : "—"}
                </span>
                <span className="hero-signal-l">Currently outdated</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-n hero-signal-n--sm">{stats.lastLabel}</span>
                <span className="hero-signal-l">Most recent crack</span>
              </div>
            </div>
          </GlassPanel>
        </motion.div>
      </div>
    </motion.section>
  );
}

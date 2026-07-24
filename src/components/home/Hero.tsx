import { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import OrlazWordmark from "../ui/illustrations/OrlazWordmark";
import GlassPanel from "../ui/GlassPanel";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { gStatus, anyOutdated, releaseTs } from "../../lib/format";
import { gTimestamp } from "../../lib/catalog";
import type { Game } from "../../types/game";
import "./Hero.css";

const ACTIVITY_DAYS = 14;

/* Real per-day counts of tracked crack/update activity -- every bucket is
   a count of actual Release rows whose own timestamp (releaseTs, xREL's
   raw ts or a parsed display date, never a guess) falls on that calendar
   day. Not a synthetic/decorative sparkline: a day with zero real
   releases renders as zero, there's no fabricated baseline data to make
   the shape look nicer. */
function activityBuckets(games: Game[]): number[] {
  const buckets = new Array(ACTIVITY_DAYS).fill(0);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const g of games) {
    for (const r of g.releases || []) {
      const ts = releaseTs(r);
      if (ts == null) continue;
      const d = new Date(ts);
      const dayMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diffDays = Math.round((todayMidnight - dayMidnight) / 86400000);
      if (diffDays >= 0 && diffDays < ACTIVITY_DAYS) buckets[ACTIVITY_DAYS - 1 - diffDays]++;
    }
  }
  return buckets;
}

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

  const activity = useMemo(() => activityBuckets(games), [games]);
  const activityMax = Math.max(...activity, 1);
  const activityWeek = activity.slice(-7).reduce((a, b) => a + b, 0);
  const activityTotal = activity.reduce((a, b) => a + b, 0);

  return (
    <motion.section
      ref={ref}
      className="hero"
      style={reduced ? undefined : { opacity: heroOpacity, scale: heroScale, y: heroY }}
    >
      <div className="hero-grid">
        <div className="hero-primary">
          <motion.h1 className="hero-word" {...fadeUp(0)}>
            <OrlazWordmark />
          </motion.h1>
          <motion.div className="hero-scrollcue" {...fadeUp(0.6)}>
            <span>The catalogue</span>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        </div>

        <motion.div className="hero-secondary" {...fadeUp(0.5)}>
          <GlassPanel aura className="hero-signal">
            <span className="hero-signal-glow hero-signal-glow--a" aria-hidden="true" />
            <span className="hero-signal-glow hero-signal-glow--b" aria-hidden="true" />
            <div className="hero-signal-head">
              <span className="hero-signal-dot" />
              Live signal
            </div>
            <div className="hero-signal-grid">
              <div className="hero-signal-stat">
                <span className="hero-signal-icon" style={{ color: "var(--ink-2)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </span>
                <span className="hero-signal-n">{stats.total ? stats.total : "—"}</span>
                <span className="hero-signal-l">Titles tracked</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-icon" style={{ color: "var(--hv)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                  </svg>
                </span>
                <span className="hero-signal-n" style={{ color: "var(--hv)" }}>
                  {stats.total ? stats.hv : "—"}
                </span>
                <span className="hero-signal-l">Hypervisor cracks</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-icon" style={{ color: "var(--out)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.6 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.4 3.9a2 2 0 0 0-2.8 0z" />
                  </svg>
                </span>
                <span className="hero-signal-n" style={{ color: "var(--out)" }}>
                  {stats.total ? stats.outdated : "—"}
                </span>
                <span className="hero-signal-l">Currently outdated</span>
              </div>
              <div className="hero-signal-stat">
                <span className="hero-signal-icon" style={{ color: "var(--ink-2)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3.5 2" />
                  </svg>
                </span>
                <span className="hero-signal-n hero-signal-n--sm">{stats.lastLabel}</span>
                <span className="hero-signal-l">Most recent crack</span>
              </div>
            </div>

            {activityTotal > 0 ? (
              <div className="hero-signal-activity">
                <span className="hero-signal-activity-label">
                  {activityWeek > 0
                    ? `${activityWeek} update${activityWeek === 1 ? "" : "s"} this week`
                    : `${activityTotal} update${activityTotal === 1 ? "" : "s"} in the last ${ACTIVITY_DAYS} days`}
                </span>
                <div className="hero-signal-bars">
                  {activity.map((n, i) => (
                    <span
                      key={i}
                      className="hero-signal-bar"
                      style={{ height: `${n ? Math.max((n / activityMax) * 100, 16) : 4}%` }}
                      title={`${n} update${n === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </GlassPanel>
        </motion.div>
      </div>
    </motion.section>
  );
}

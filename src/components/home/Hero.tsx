import { useEffect, useMemo, useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import OrlazWordmark from "../ui/illustrations/OrlazWordmark";
import GlassPanel from "../ui/GlassPanel";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import { useCountUp } from "../../hooks/useCountUp";
import { gStatus, anyOutdated, releaseTs } from "../../lib/format";
import { gTimestamp } from "../../lib/catalog";
import type { Game } from "../../types/game";
import type { StatusFilter } from "../../lib/filters";
import "./Hero.css";

// How far (px) the hero content drifts toward the pointer -- small on
// purpose, a subtle "this scene is responsive to you" cue layered on top
// of AmbientBackground's own (larger, opposite-direction) blob parallax
// rather than competing with it. Spring-smoothed, not 1:1 with the raw
// pointer position, so it reads as weighted/physical rather than a rigid
// cursor-follow.
const HERO_PARALLAX_PX = 14;

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

/* Renders as a real <button> (keyboard/focus-accessible, real click
   semantics) when a handler is passed, or a plain <div> otherwise --
   "Titles tracked"/"Most recent crack" have no single sensible filter
   target, so they stay inert, while "Hypervisor cracks"/"Currently
   outdated" become real shortcuts. Same class either way so the four
   tiles read as one consistent grid regardless of which are clickable. */
function StatTile({ onClick, title, children }: { onClick?: () => void; title?: string; children: ReactNode }) {
  if (!onClick) {
    return <div className="hero-signal-stat">{children}</div>;
  }
  return (
    <button type="button" className="hero-signal-stat hero-signal-stat--action" onClick={onClick} title={title}>
      {children}
    </button>
  );
}

interface HeroProps {
  games: Game[];
  /* Optional: when provided, "Hypervisor cracks" / "Currently outdated"
     become real shortcuts into Home's own filter state instead of inert
     numbers -- see Home.tsx's jumpToStatus for why this has to be a
     callback into existing state rather than a ?status= link (Home only
     reads that param on first mount, so a same-route link would silently
     no-op the vast majority of the time this gets clicked). Left optional
     so Hero still renders standalone (tests, storybook-style usage)
     without wiring a Home instance behind it. */
  onJumpToStatus?: (status: StatusFilter) => void;
}

export default function Hero({ games, onJumpToStatus }: HeroProps) {
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

  // Pointer parallax -- raw position in motion values (no React re-render
  // per mousemove), smoothed through a spring so the content settles into
  // place rather than snapping to the cursor. Off entirely under reduced-
  // motion, same gate every other moving piece here uses.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 55, damping: 18, mass: 0.4 });
  const springY = useSpring(pointerY, { stiffness: 55, damping: 18, mass: 0.4 });

  useEffect(() => {
    if (reduced) return;
    function onPointerMove(e: globalThis.PointerEvent) {
      pointerX.set((e.clientX / window.innerWidth - 0.5) * HERO_PARALLAX_PX);
      pointerY.set((e.clientY / window.innerHeight - 0.5) * HERO_PARALLAX_PX);
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [reduced, pointerX, pointerY]);

  // Blur-to-sharp added on top of the existing fade+rise -- a text reveal
  // reading as a deliberate cinematic focus-pull rather than a plain
  // opacity fade, the same cue Apple/Linear product pages lean on for a
  // hero headline's entrance. One-time on mount, never repeated -- this is
  // an entrance flourish, not an ambient effect.
  const fadeUp = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 16, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  // Drives the Live Signal card's cursor-glint (.liquid-sheen::after,
  // globals.css) -- same plain style.setProperty-on-the-element pattern
  // GameCard.tsx uses, no re-render per mouse move.
  function handleSignalPointerMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--glint-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    e.currentTarget.style.setProperty("--glint-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  const stats = useMemo(() => {
    const hv = games.filter((g) => gStatus(g) === "hv").length;
    const outdated = games.filter((g) => anyOutdated(g)).length;
    const lastTs = games.reduce((mx, g) => Math.max(mx, gTimestamp(g)), 0);
    const lastLabel = lastTs
      ? new Date(lastTs).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "—";
    return { total: games.length, hv, outdated, lastLabel };
  }, [games]);

  // Counts up to the real value on mount/change -- never a fake incrementing
  // placeholder, just an entrance flourish on numbers that are already
  // real. Naturally re-triggers (smoothly, from wherever it last landed,
  // not a reset to zero -- see useCountUp's own comment) as
  // useLiveCatalog streams in more of the catalog in the background, which
  // reads as the "Live signal" name actually meaning something rather than
  // a static snapshot.
  const totalDisplay = useCountUp(stats.total);
  const hvDisplay = useCountUp(stats.hv);
  const outdatedDisplay = useCountUp(stats.outdated);

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
      <motion.div className="hero-grid" style={reduced ? undefined : { x: springX, y: springY }}>
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
          <GlassPanel frost className="hero-signal" onPointerMove={handleSignalPointerMove}>
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
                <span className="hero-signal-n">{stats.total ? totalDisplay : "—"}</span>
                <span className="hero-signal-l">Titles tracked</span>
              </div>
              <StatTile
                onClick={onJumpToStatus && stats.hv ? () => onJumpToStatus("hv") : undefined}
                title={onJumpToStatus && stats.hv ? "Jump to hypervisor-cracked titles" : undefined}
              >
                <span className="hero-signal-icon" style={{ color: "var(--hv)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                  </svg>
                </span>
                <span className="hero-signal-n" style={{ color: "var(--hv)" }}>
                  {stats.total ? hvDisplay : "—"}
                </span>
                <span className="hero-signal-l">Hypervisor cracks</span>
              </StatTile>
              <StatTile
                onClick={onJumpToStatus && stats.outdated ? () => onJumpToStatus("outdated") : undefined}
                title={onJumpToStatus && stats.outdated ? "Jump to currently outdated titles" : undefined}
              >
                <span className="hero-signal-icon" style={{ color: "var(--out)" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4M12 17h.01M10.6 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.4 3.9a2 2 0 0 0-2.8 0z" />
                  </svg>
                </span>
                <span className="hero-signal-n" style={{ color: "var(--out)" }}>
                  {stats.total ? outdatedDisplay : "—"}
                </span>
                <span className="hero-signal-l">Currently outdated</span>
              </StatTile>
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
                  {activity.map((n, i) => {
                    const height = n ? Math.max((n / activityMax) * 100, 16) : 4;
                    return reduced ? (
                      <span key={i} className="hero-signal-bar" style={{ height: `${height}%` }} title={`${n} update${n === 1 ? "" : "s"}`} />
                    ) : (
                      <motion.span
                        key={i}
                        className="hero-signal-bar"
                        style={{ height: `${height}%` }}
                        title={`${n} update${n === 1 ? "" : "s"}`}
                        initial={{ scaleY: 0 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: 0.5, delay: 0.7 + i * 0.025, ease: [0.16, 1, 0.3, 1] }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : null}
          </GlassPanel>
        </motion.div>
      </motion.div>
    </motion.section>
  );
}

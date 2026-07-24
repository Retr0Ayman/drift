import { motion } from "motion/react";
import DriftMark from "./DriftMark";
import "./OrlazWordmark.css";

interface OrlazWordmarkProps {
  /* Only the splash (IntroAnimation.tsx) and the navbar's own O-slot share
     a layoutId -- Framer Motion projects the same ring shape shrinking
     from standalone-huge to inline-navbar-small between them. Every other
     instance (Footer) renders a plain, unshared O. */
  layoutId?: string;
  className?: string;
}

/* The "o" in "orlaz" IS the mark now, not a separate icon badge sitting
   next to the wordmark -- DriftMark's own two offset rings, sized to
   whatever font-size context renders this (all in em, no per-instance
   pixel value to keep in sync across navbar/footer/splash scale) and
   dropped straight into the O's literal position. */
export default function OrlazWordmark({ layoutId, className = "" }: OrlazWordmarkProps) {
  return (
    <span className={`orlaz-wordmark ${className}`}>
      <motion.span layoutId={layoutId} className="orlaz-o">
        <DriftMark />
      </motion.span>
      rlaz
    </span>
  );
}

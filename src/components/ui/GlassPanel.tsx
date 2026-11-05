import type { HTMLAttributes, ReactNode } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
  /* Simple content surface (fill + hairline); real frosted glass lives only
     on the navbar and overlays. */
  frost?: boolean;
  /* Stronger version of the same frost treatment -- more blur, more
     saturate, more see-through -- for surfaces that need to visibly float
     over the colorful metaball background instead of just reading as a
     slightly-tinted card (GameCard and the other grid tiles, plus
     release-card, see GlassPanel.css for the exact multiplier). Still
     same tokens as frost. */
  frostStrong?: boolean;
}

export default function GlassPanel({ children, className = "", strong, frost, frostStrong, ...rest }: GlassPanelProps) {
  return (
    <div
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${frostStrong ? " glass-panel--frost-strong" : frost ? " glass-panel--frost" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

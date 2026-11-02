import type { HTMLAttributes, ReactNode } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
  /* Static glass -- backdrop-filter blur+saturate, the same translucent
     --aura-panel-bg fill and --aura-a/--aura-b-derived border the search
     bar's own spinning aura ring (SearchBar.tsx, a raw .aura-ring div, not
     this component) uses, but no spin. The animated conic-gradient ring
     stays reserved for the search bar alone now -- the hero "Live signal"
     panel used to be the other reserved spot (via this component's own now-
     removed `aura` prop) but a spinning rainbow border read as generic
     AI-dashboard-mockup decoration on a panel meant to read as a real,
     professional live readout; frost (still visibly floating glass, no
     spin) replaced it there. */
  frost?: boolean;
  /* Stronger version of the same frost treatment -- more blur, more
     saturate, more see-through -- for surfaces that need to visibly float
     over the colorful metaball background instead of just reading as a
     slightly-tinted card (GameCard and the other grid tiles, plus
     release-card, see GlassPanel.css for the exact multiplier). Still
     built from the same --aura-* tokens frost uses, not a new palette. */
  frostStrong?: boolean;
}

export default function GlassPanel({ children, className = "", strong, frost, frostStrong, ...rest }: GlassPanelProps) {
  return (
    <div
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${frostStrong ? " glass-panel--frost-strong liquid-sheen" : frost ? " glass-panel--frost liquid-sheen" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

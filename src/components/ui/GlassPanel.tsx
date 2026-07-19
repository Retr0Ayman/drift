import type { HTMLAttributes, ReactNode } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
  aura?: boolean;
  /* Static glass -- backdrop-filter blur+saturate, the same translucent
     --aura-panel-bg fill and --aura-a/--aura-b-derived border the search
     bar's aura ring uses, but no spin. The animated conic-gradient ring
     stays reserved for the search bar / one hero panel, per tokens.css's
     own "reserved" rule -- this is the broader Stage 3
     rollout (side panels, release cards, group/publisher/franchise
     panels), which would read as gimmicky with a dozen spinning borders
     on one page. */
  frost?: boolean;
  /* Stronger version of the same frost treatment -- more blur, more
     saturate, more see-through -- for surfaces that need to visibly float
     over the colorful metaball background instead of just reading as a
     slightly-tinted card (GameCard and the other grid tiles, plus
     release-card, see GlassPanel.css for the exact multiplier). Still
     built from the same --aura-* tokens frost uses, not a new palette. */
  frostStrong?: boolean;
}

export default function GlassPanel({ children, className = "", strong, aura, frost, frostStrong, ...rest }: GlassPanelProps) {
  if (aura) {
    return (
      <div className="aura-ring">
        <div className={`glass-panel--aura liquid-sheen${className ? ` ${className}` : ""}`} {...rest}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${frostStrong ? " glass-panel--frost-strong liquid-sheen" : frost ? " glass-panel--frost liquid-sheen" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

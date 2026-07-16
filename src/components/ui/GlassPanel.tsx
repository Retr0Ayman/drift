import type { HTMLAttributes, ReactNode } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
  aura?: boolean;
  /* Static glass -- backdrop-filter blur+saturate, the same translucent
     --aura-panel-bg fill and --aura-a/--aura-b-derived border the search
     bar's aura ring uses, but no spin. The animated conic-gradient ring
     stays reserved for the search bar / one hero panel / AI tags, per
     tokens.css's own "reserved" rule -- this is the broader Stage 3
     rollout (side panels, release cards, group/publisher/franchise
     panels), which would read as gimmicky with a dozen spinning borders
     on one page. */
  frost?: boolean;
}

export default function GlassPanel({ children, className = "", strong, aura, frost, ...rest }: GlassPanelProps) {
  if (aura) {
    return (
      <div className="aura-ring">
        <div className={`glass-panel--aura${className ? ` ${className}` : ""}`} {...rest}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${frost ? " glass-panel--frost" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

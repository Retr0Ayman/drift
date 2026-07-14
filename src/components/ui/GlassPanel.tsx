import type { HTMLAttributes, ReactNode } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
  aura?: boolean;
}

export default function GlassPanel({ children, className = "", strong, aura, ...rest }: GlassPanelProps) {
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
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import "./Pill.css";

export type PillTone = "neutral" | "accent" | "hv" | "trad" | "dead" | "out" | "unc" | "unv";

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
  title?: string;
}

export default function Pill({ children, tone = "neutral", className = "", title }: PillProps) {
  return (
    <span className={`pill pill--${tone}${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}

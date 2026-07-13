import type { ReactNode } from "react";
import "./Pill.css";

export type PillTone = "neutral" | "accent" | "hv" | "trad" | "dead" | "out" | "unc" | "unv";

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}

export default function Pill({ children, tone = "neutral", className = "" }: PillProps) {
  return <span className={`pill pill--${tone}${className ? ` ${className}` : ""}`}>{children}</span>;
}

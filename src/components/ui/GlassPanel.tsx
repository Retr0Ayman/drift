import { useRef, type HTMLAttributes, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import "./GlassPanel.css";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  strong?: boolean;
}

/* Liquid Glass surface: backdrop blur + border + layered shadow (elevation +
   inset top highlight) for base depth, plus a specular highlight that tracks
   the pointer via CSS custom properties (set imperatively on the node, not
   through React state, so mousemove never triggers a re-render). */
export default function GlassPanel({ children, className = "", strong, ...rest }: GlassPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--glow-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty("--glow-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
  }

  return (
    <div
      ref={ref}
      className={`glass-panel${strong ? " glass-panel--strong" : ""}${className ? ` ${className}` : ""}`}
      onPointerMove={handlePointerMove}
      {...rest}
    >
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import "./DrmTag.css";

interface DrmTagProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

/* The protection/DRM pill family (Denuvo Anti-Tamper, VMProtect, etc.) --
   deliberately its own component, not another Pill tone, since it needs a
   shield glyph a plain <Pill> has no slot for. Reused everywhere a game's
   `tags` array renders: GameDetail.tsx's header and ReleaseCard.tsx's
   "Protection" row (which used to be a bare, unlabeled-by-shape
   .release-tag-chip span -- the direct root cause of the earlier "can't
   tell what DRM this is" complaint, since it looked identical to a genre
   pill). Rounded-square + border + icon + the --drm warm tint (see
   tokens.css's own comment on why that's a distinct color from any status
   tone) makes this read as unmistakably its own category at a glance,
   next to genre pills (rounded-full, no border, quiet) and status pills
   (rounded-square, bold, no icon, existing FLAG_TONE colors). */
export default function DrmTag({ children, className = "", title }: DrmTagProps) {
  return (
    <span className={`drm-tag${className ? ` ${className}` : ""}`} title={title}>
      <svg className="drm-tag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2.5 4.5 5.5v5.6c0 5 3.3 8.6 7.5 10.4 4.2-1.8 7.5-5.4 7.5-10.4V5.5L12 2.5Z" />
      </svg>
      {children}
    </span>
  );
}

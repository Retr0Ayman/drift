import type { ReactNode } from "react";
import "./AiTag.css";

/* The one deliberate extension of Phase 1's "aura reserved for the search
   bar and one hero panel per page" rule (see tokens.css's own comment) --
   AI-generated content (AiSummary, FaqSection, GameFact) gets this instead
   of a plain grey Pill, so "this came from a model, not tracked data" reads
   as a distinct, consistent signal everywhere it appears. Same rotating
   conic-gradient technique .glass-panel--aura uses, just at badge scale --
   no full-panel blur wash, a thin glowing ring around a small pill. */
export default function AiTag({ children = "AI" }: { children?: ReactNode }) {
  return (
    <span className="ai-tag-ring">
      <span className="ai-tag">{children}</span>
    </span>
  );
}

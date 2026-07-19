import { useEffect, useState } from "react";
import { fetchSummary, type SummaryFacts } from "../../lib/summary";
import "./AiSummary.css";

interface AiSummaryProps {
  kind: "group" | "publisher";
  cacheKey: string;
  name: string;
  facts: SummaryFacts;
  /* Gate on the caller's own "is this data settled yet" signal (e.g. a
     group page's live-release fetch still in flight). Confirmed live bug:
     without this, the effect below fires on [kind, cacheKey] alone, which
     stabilizes almost immediately from route params -- so it was capturing
     and generating from whatever `facts` existed on that first render,
     nearly always BEFORE the live release count had loaded. A group's
     summary would confidently describe e.g. "3 tracked releases" as the
     complete picture when the real count (still loading at that instant)
     was ~30. Defaults to true for callers with no async loading state to
     gate on. */
  ready?: boolean;
}

/* Short generated blurb, strictly grounded in real tracked data passed in
   via `facts` (see worker/routes/summary.ts for the exact grounding rule). */
export default function AiSummary({ kind, cacheKey, name, facts, ready = true }: AiSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setSummary(null);
    setError(null);
    fetchSummary(kind, cacheKey, name, facts).then((res) => {
      if (cancelled) return;
      setSummary(res.summary);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cacheKey, ready]);

  if (loading || (!summary && error)) return null; // quiet no-op, not a placeholder block

  return summary ? <p className="ai-summary">{summary}</p> : null;
}

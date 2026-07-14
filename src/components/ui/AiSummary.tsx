import { useEffect, useState } from "react";
import { fetchSummary, type SummaryFacts } from "../../lib/summary";
import "./AiSummary.css";

interface AiSummaryProps {
  kind: "group" | "publisher";
  cacheKey: string;
  name: string;
  facts: SummaryFacts;
}

/* Short AI-generated blurb, strictly grounded in real tracked data passed
   in via `facts` (see worker/routes/summary.ts for the exact grounding
   rule) -- never shown as a hard fact, always labeled as AI-generated so
   it reads as commentary on real data, not as an additional data source. */
export default function AiSummary({ kind, cacheKey, name, facts }: AiSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [kind, cacheKey]);

  if (loading || (!summary && error)) return null; // quiet no-op, not a placeholder block

  return summary ? (
    <p className="ai-summary">
      <span className="ai-summary-tag">AI summary</span>
      {summary}
    </p>
  ) : null;
}

import { useEffect, useState, type ReactNode } from "react";
import type { Game } from "../../types/game";
import { fetchFaq } from "../../lib/faq";
import GlassPanel from "../ui/GlassPanel";
import "./FaqSection.css";

/* Renders **bold** as <strong> via plain React text nodes -- never
   dangerouslySetInnerHTML, since this text comes from a third-party LLM
   service and must never be interpreted as HTML. */
function renderInline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export default function FaqSection({ game }: { game: Game }) {
  const [loading, setLoading] = useState(true);
  const [faq, setFaq] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFaq(null);
    setError(null);
    fetchFaq(game).then((res) => {
      if (cancelled) return;
      setFaq(res.faq);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  const lines = faq ? faq.split("\n").map((l) => l.trim()).filter(Boolean) : [];

  return (
    <div className="detail-faq">
      <h4>FAQ</h4>
      <GlassPanel className="faq-panel">
        {loading ? (
          <p className="faq-status">Generating…</p>
        ) : error || !lines.length ? (
          <p className="faq-status">
            FAQ generation is unavailable right now{error ? ` (${error})` : ""}.
          </p>
        ) : (
          <div className="faq-body">
            {lines.map((line, i) => (
              <p key={i}>{renderInline(line)}</p>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

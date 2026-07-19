import { useEffect, useState, type ReactNode } from "react";
import * as RadixAccordion from "@radix-ui/react-accordion";
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

interface QaPair {
  q: string;
  a: string;
}

/* worker/routes/faq.ts's prompt asks for exactly "Q: ..." / "A: ..." line
   pairs -- parsed here into real pairs instead of a flat line dump, so
   each one can render as its own accordion row. A malformed line (model
   drifted from the requested format) is just skipped, not fabricated into
   a pair. */
function parseQaPairs(faq: string): QaPair[] {
  const lines = faq.split("\n").map((l) => l.trim()).filter(Boolean);
  const pairs: QaPair[] = [];
  let pendingQ: string | null = null;
  for (const line of lines) {
    if (line.startsWith("Q:")) {
      pendingQ = line.slice(2).trim();
    } else if (line.startsWith("A:") && pendingQ) {
      pairs.push({ q: pendingQ, a: line.slice(2).trim() });
      pendingQ = null;
    }
  }
  return pairs;
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

  const pairs = faq ? parseQaPairs(faq) : [];
  const ready = !loading && !error && pairs.length > 0;

  return (
    <div className="detail-faq">
      <h4>FAQ</h4>
      <GlassPanel className={`faq-panel${ready ? " ai-glow" : ""}`}>
        {loading ? (
          <p className="faq-status">Generating…</p>
        ) : error || !pairs.length ? (
          <p className="faq-status">
            FAQ generation is unavailable right now{error ? ` (${error})` : ""}.
          </p>
        ) : (
          <RadixAccordion.Root type="single" collapsible defaultValue="q-0" className="faq-accordion">
            {pairs.map((pair, i) => (
              <RadixAccordion.Item key={i} value={`q-${i}`} className="faq-item">
                <RadixAccordion.Header>
                  <RadixAccordion.Trigger className="faq-item-trigger">
                    <span className="faq-item-q">{renderInline(pair.q)}</span>
                    <span className="faq-item-chev">›</span>
                  </RadixAccordion.Trigger>
                </RadixAccordion.Header>
                <RadixAccordion.Content className="faq-item-content">
                  <p className="faq-item-a">{renderInline(pair.a)}</p>
                </RadixAccordion.Content>
              </RadixAccordion.Item>
            ))}
          </RadixAccordion.Root>
        )}
      </GlassPanel>
    </div>
  );
}

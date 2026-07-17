import { useEffect, useState } from "react";
import type { Game } from "../../types/game";
import { fetchOutlook } from "../../lib/outlook";
import GlassPanel from "../ui/GlassPanel";
import AiTag from "../ui/AiTag";
import "./CrackOutlook.css";

/* Third AI surface on the game page, distinct from GameFact (bio trivia,
   sidebar) and FaqSection (Q&A, its own tab): a short practical verdict on
   THIS game's crack situation right now. Lives above the release list in
   the "Crack options" tab, since that's what it's actually about, instead
   of adding a fourth panel to the already-full sidebar. Same honesty rule
   as the other two -- a failed/unset-key call shows a real "unavailable"
   line, never a fabricated-looking fallback. */
export default function CrackOutlook({ game }: { game: Game }) {
  const [loading, setLoading] = useState(true);
  const [outlook, setOutlook] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setOutlook(null);
    setError(null);
    fetchOutlook(game).then((res) => {
      if (cancelled) return;
      setOutlook(res.outlook);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  return (
    <GlassPanel className="crack-outlook" frost>
      <div className="crack-outlook-h">
        Crack outlook
        {!loading && !error && outlook ? <AiTag /> : null}
      </div>
      {loading ? (
        <p className="crack-outlook-status">Generating…</p>
      ) : error || !outlook ? (
        <p className="crack-outlook-status">Outlook generation is unavailable right now{error ? ` (${error})` : ""}.</p>
      ) : (
        <p>{outlook}</p>
      )}
    </GlassPanel>
  );
}

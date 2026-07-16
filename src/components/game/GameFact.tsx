import { useEffect, useState } from "react";
import type { Game } from "../../types/game";
import { fetchFact } from "../../lib/fact";
import { franchiseFor } from "../../lib/companies";
import GlassPanel from "../ui/GlassPanel";
import AiTag from "../ui/AiTag";

// Prefers a real, hand-curated seed fact when one exists (see
// src/data/seedGames.ts) -- only calls the AI generator for games that
// don't have one, which in practice is every live-loaded game (the seed
// catalog gets replaced once the live sync completes).
export default function GameFact({ game }: { game: Game }) {
  const [fact, setFact] = useState<string | null>(game.fact || null);
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    if (game.fact) {
      setFact(game.fact);
      setAiGenerated(false);
      return;
    }
    let cancelled = false;
    fetchFact(game.id, {
      title: game.title,
      developer: game.developer,
      genres: game.genres,
      released: game.released,
      franchise: franchiseFor(game.title),
    }).then((res) => {
      if (cancelled) return;
      setFact(res.fact);
      setAiGenerated(!!res.fact);
    });
    return () => {
      cancelled = true;
    };
  }, [game]);

  if (!fact) return null;

  return (
    <GlassPanel className="detail-factbox" frost>
      <div className="detail-factbox-h">
        Did you know
        {aiGenerated ? <AiTag /> : null}
      </div>
      <p>{fact}</p>
    </GlassPanel>
  );
}

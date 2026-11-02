import { useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useTrending } from "../../hooks/useTrending";
import { usePageMeta } from "../../hooks/usePageMeta";
import GameCard from "../home/GameCard";
import Reveal from "../ui/Reveal";
import "./Trending.css";

// Ranking is real, computed watch-toggle counts (worker/routes/trending.ts,
// migrations/0012) -- distinct anonymous devices that added a game to their
// watchlist in the last windowDays, never an AI-guessed "hot right now"
// score. A game with zero real watchers just doesn't appear here, same
// "not enough data yet" honesty group-reliability's stars use.
export default function Trending() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { rows, windowDays, loading } = useTrending();

  usePageMeta({
    title: "Trending",
    description: `The most-watchlisted PC crack releases on orlaz over the last ${windowDays} days.`,
  });

  const ranked = rows
    .map((row) => ({ game: games.find((g) => g.id === row.game_id), watchers: row.watchers }))
    .filter((r): r is { game: NonNullable<typeof r.game>; watchers: number } => !!r.game);

  return (
    <div className="wrap trending-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="trending-hero">
          <span className="trending-eyebrow">Trending</span>
          <h1>Most-watched right now</h1>
          <p className="trending-lede">
            Ranked by real watchlist adds from real visitors over the last {windowDays} days — not a guess, a count.
          </p>
        </div>
      </Reveal>

      {loading ? (
        <div className="trending-empty">Loading…</div>
      ) : ranked.length ? (
        <div className="trending-grid">
          {ranked.map(({ game, watchers }, i) => (
            <Reveal key={game.id} delay={Math.min(i, 8) * 0.045}>
              <div className="trending-card-wrap">
                <span className="trending-rank">#{i + 1}</span>
                <span className="trending-watchers">
                  {watchers} watcher{watchers === 1 ? "" : "s"}
                </span>
                <GameCard game={game} priority={i === 0} />
              </div>
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="trending-empty">
          Nothing trending yet — star a game from its detail page to be the first watcher.
        </div>
      )}
    </div>
  );
}

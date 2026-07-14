import { useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { useWatchlist } from "../../hooks/useWatchlist";
import GameCard from "../home/GameCard";
import Reveal from "../ui/Reveal";
import WishlistImport from "./WishlistImport";
import { usePageMeta } from "../../hooks/usePageMeta";
import { anyOutdated, driftDelta } from "../../lib/format";
import "./Watchlist.css";

export default function Watchlist() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const { watched } = useWatchlist();

  // Outdated-first, same "drift surfaces at the top" idea as the rest of the
  // app -- a watched game whose crack has fallen behind the current Steam
  // build is the one thing on this page that actually needs attention.
  const watchedGames = games
    .filter((g) => watched.includes(g.id))
    .sort((a, b) => Number(anyOutdated(b)) - Number(anyOutdated(a)));
  const outdatedCount = watchedGames.filter((g) => anyOutdated(g)).length;
  usePageMeta({
    title: "Your watchlist",
    description: "Games you're tracking for crack/build drift, sorted with outdated ones first.",
  });

  return (
    <div className="wrap watchlist-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>

      <Reveal>
        <div className="watchlist-hero">
          <span className="watchlist-eyebrow">Your watchlist</span>
          <h1>Games you're tracking</h1>
          <p className="watchlist-lede">
            {watchedGames.length
              ? `${watchedGames.length} title${watchedGames.length === 1 ? "" : "s"} watched${
                  outdatedCount ? ` · ${outdatedCount} drifted outdated` : ""
                }.`
              : "Star a game from its detail page to add it here."}
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <WishlistImport />
      </Reveal>

      {watchedGames.length ? (
        <div className="watchlist-grid">
          {watchedGames.map((g, i) => {
            const delta = driftDelta(g);
            return (
              <Reveal key={g.id} delay={Math.min(i, 8) * 0.045}>
                <div className="watchlist-card-wrap">
                  {delta > 0 ? (
                    <span className="watchlist-drift-badge">{delta.toLocaleString("en-US")} builds behind</span>
                  ) : null}
                  <GameCard game={g} />
                </div>
              </Reveal>
            );
          })}
        </div>
      ) : (
        <div className="watchlist-empty">
          You're not watching anything yet — star a game to get notified when its crack drifts out of date.
        </div>
      )}
    </div>
  );
}

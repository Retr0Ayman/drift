import { useWatchlist } from "../../hooks/useWatchlist";
import "./WatchToggle.css";

interface WatchToggleProps {
  gameId: string;
  size?: "sm" | "lg";
  className?: string;
}

export default function WatchToggle({ gameId, size = "sm", className = "" }: WatchToggleProps) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(gameId);

  return (
    <button
      type="button"
      className={`watch-toggle watch-toggle--${size}${watched ? " watch-toggle--on" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={watched}
      title={watched ? "Remove from watchlist" : "Add to watchlist"}
      onClick={() => toggle(gameId)}
    >
      <span className="watch-toggle-star">{watched ? "★" : "☆"}</span>
      <span className="watch-toggle-label">{watched ? "Watching" : "Watch"}</span>
    </button>
  );
}

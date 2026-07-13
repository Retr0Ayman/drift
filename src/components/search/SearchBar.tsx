import { useState, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useNavigate } from "react-router-dom";
import { useAutocomplete, type Suggestion } from "../../hooks/useAutocomplete";
import { buildLiveGameFromRows } from "../../lib/catalog";
import type { Game } from "../../types/game";
import "./SearchBar.css";

interface SearchBarProps {
  games: Game[];
  onLiveGameResolved: (game: Game) => void;
}

export default function SearchBar({ games, onLiveGameResolved }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const navigate = useNavigate();
  const { results, loading } = useAutocomplete(query, games);
  const showPopover = open && (loading || resolving || results.length > 0);

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  async function selectSuggestion(s: Suggestion) {
    if (s.kind === "local") {
      navigate(`/game/${s.id}`);
      closeAndReset();
      return;
    }
    setResolving(true);
    const game = await buildLiveGameFromRows(s.title);
    setResolving(false);
    // A live match that never resolves a Steam appid is skipped, not shown
    // with placeholder art -- a wrong/missing match is worse than nothing.
    if (!game) return;
    onLiveGameResolved(game);
    navigate(`/game/${game.id}`);
    closeAndReset();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = results[activeIndex] ?? results[0];
      if (s) selectSuggestion(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover.Root open={showPopover} onOpenChange={(o) => setOpen(o)}>
      <Popover.Anchor asChild>
        <div className="searchbar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            placeholder="Search"
            aria-label="Search titles"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActiveIndex(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="searchbar-popover"
          align="end"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {loading ? <div className="searchbar-status">Searching…</div> : null}
          {resolving ? <div className="searchbar-status">Opening…</div> : null}
          {!loading && !resolving
            ? results.map((s, i) => (
                <button
                  key={s.id}
                  className={`searchbar-item${i === activeIndex ? " searchbar-item--active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(s)}
                >
                  <span className="searchbar-item-title">{s.title}</span>
                  {s.kind === "local" && s.year ? <span className="searchbar-item-year">{s.year}</span> : null}
                </button>
              ))
            : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

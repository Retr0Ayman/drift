import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useNavigate } from "react-router-dom";
import { useAutocomplete, type Suggestion } from "../../hooks/useAutocomplete";
import { buildLiveGameFromRows } from "../../lib/catalog";
import { parseSearchIntent } from "../../lib/searchIntent";
import { matchFranchise } from "../../lib/companies";
import { slugify } from "../../lib/format";
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
  const { results, loading, assisted, assisting } = useAutocomplete(query, games);
  const intent = useMemo(() => parseSearchIntent(query), [query]);
  const franchiseMatch = useMemo(() => matchFranchise(query), [query]);
  const showPopover = open && (loading || resolving || assisting || results.length > 0 || !!intent || !!franchiseMatch || !!assisted);

  const localResults = results.filter((r) => r.kind === "local");
  const liveResults = results.filter((r) => r.kind === "live");
  const assistedResults = assisted?.results ?? [];
  // Flat index across every visible row group, in render order, so
  // arrow-key navigation moves through all of them in one sequence.
  const flat: Array<Suggestion | { kind: "intent" } | { kind: "franchise"; name: string }> = [
    ...(intent ? [{ kind: "intent" as const }] : []),
    ...(franchiseMatch ? [{ kind: "franchise" as const, name: franchiseMatch }] : []),
    ...localResults,
    ...liveResults,
    ...assistedResults,
  ];

  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  }

  function applyIntent() {
    if (!intent) return;
    const params = new URLSearchParams();
    if (intent.status) params.set("status", intent.status);
    if (intent.year) params.set("year", intent.year);
    navigate(`/?${params.toString()}`);
    closeAndReset();
  }

  function goToFranchise() {
    if (!franchiseMatch) return;
    navigate(`/franchise/${slugify(franchiseMatch)}`);
    closeAndReset();
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

  function activate(row: Suggestion | { kind: "intent" } | { kind: "franchise"; name: string } | undefined) {
    if (!row) return;
    if (row.kind === "intent") applyIntent();
    else if (row.kind === "franchise") goToFranchise();
    else selectSuggestion(row);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      activate(flat[activeIndex] ?? flat[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  let rowCursor = -1;
  let stagger = -1;

  return (
    <Popover.Root open={showPopover} onOpenChange={(o) => setOpen(o)}>
      <Popover.Anchor asChild>
        <div className="aura-ring searchbar-aura">
          <div className="searchbar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              placeholder="Search titles, groups, publishers…"
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
            <kbd className="searchbar-kbd-hint">⌘K</kbd>
          </div>
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        {/* Open/close motion via Radix's own [data-state] CSS animation
            hooks (see SearchBar.css) -- Radix's Presence primitive already
            defers unmount until the exit animation finishes, no
            forceMount/AnimatePresence wiring needed on top of it. Each row
            gets a small staggered fade-in (--i custom property driving a
            per-row animation-delay) instead of the whole list popping in
            as one flat block. */}
        <Popover.Content
          className="searchbar-popover"
          align="end"
          sideOffset={10}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {intent ? (
            <button
              className={`searchbar-intent searchbar-row${(rowCursor += 1) === activeIndex ? " searchbar-item--active" : ""}`}
              style={{ "--i": ++stagger } as CSSProperties}
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyIntent}
            >
              <span className="searchbar-intent-icon">⌁</span>
              <span>
                Filter by <strong>{intent.label}</strong>
              </span>
            </button>
          ) : null}

          {franchiseMatch ? (
            <button
              className={`searchbar-intent searchbar-row${(rowCursor += 1) === activeIndex ? " searchbar-item--active" : ""}`}
              style={{ "--i": ++stagger } as CSSProperties}
              onMouseDown={(e) => e.preventDefault()}
              onClick={goToFranchise}
            >
              <span className="searchbar-intent-icon">◈</span>
              <span>
                Go to the <strong>{franchiseMatch}</strong> franchise ›
              </span>
            </button>
          ) : null}

          {loading ? <div className="searchbar-status">Searching…</div> : null}
          {resolving ? <div className="searchbar-status">Opening…</div> : null}

          {!loading && !resolving && localResults.length ? (
            <div className="searchbar-group">
              <div className="searchbar-group-label">In your catalogue</div>
              {localResults.map((s) => {
                rowCursor += 1;
                const idx = rowCursor;
                return (
                  <button
                    key={s.id}
                    className={`searchbar-item searchbar-row${idx === activeIndex ? " searchbar-item--active" : ""}`}
                    style={{ "--i": ++stagger } as CSSProperties}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                  >
                    <span className="searchbar-item-title">{s.title}</span>
                    {s.kind === "local" && s.year ? <span className="searchbar-item-year">{s.year}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {!loading && !resolving && liveResults.length ? (
            <div className="searchbar-group">
              <div className="searchbar-group-label">From xREL, live</div>
              {liveResults.map((s) => {
                rowCursor += 1;
                const idx = rowCursor;
                return (
                  <button
                    key={s.id}
                    className={`searchbar-item searchbar-row${idx === activeIndex ? " searchbar-item--active" : ""}`}
                    style={{ "--i": ++stagger } as CSSProperties}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                  >
                    <span className="searchbar-item-title">{s.title}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {!loading && !resolving && assisting ? (
            <div className="searchbar-status searchbar-status--thinking">
              <span className="searchbar-thinking-dot" />
              <span className="searchbar-thinking-dot" />
              <span className="searchbar-thinking-dot" />
              Thinking…
            </div>
          ) : null}

          {!loading && !resolving && assisted && assistedResults.length ? (
            <div className="searchbar-group">
              <div className="searchbar-group-label">Did you mean “{assisted.label}”?</div>
              {assistedResults.map((s) => {
                rowCursor += 1;
                const idx = rowCursor;
                return (
                  <button
                    key={s.id}
                    className={`searchbar-item searchbar-row${idx === activeIndex ? " searchbar-item--active" : ""}`}
                    style={{ "--i": ++stagger } as CSSProperties}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(s)}
                  >
                    <span className="searchbar-item-title">{s.title}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

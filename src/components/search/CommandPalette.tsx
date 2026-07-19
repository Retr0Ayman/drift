import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";
import { useAutocomplete, type Suggestion } from "../../hooks/useAutocomplete";
import { parseSearchIntent } from "../../lib/searchIntent";
import { buildLiveGameFromRows } from "../../lib/catalog";
import { matchFranchise } from "../../lib/companies";
import { slugify } from "../../lib/format";
import type { Game } from "../../types/game";
import type { CatalogStatus } from "../../hooks/useLiveCatalog";
import "./CommandPalette.css";

interface CommandPaletteProps {
  games: Game[];
  catalogStatus: CatalogStatus;
  onLiveGameResolved: (game: Game) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The one search surface for the whole app -- opened via Cmd/Ctrl+K or by
// clicking the navbar's SearchBar pill (both drive the same open state,
// lifted to Layout in App.tsx so the two triggers can share it). Used to be
// paired with a second, separate inline popover living in SearchBar itself
// with its own near-duplicate of this exact suggestion/intent/franchise
// logic -- consolidated into just this one, since two divergent search UIs
// was never an intentional design, just how the pieces landed over time.
export default function CommandPalette({ games, catalogStatus, onLiveGameResolved, open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const navigate = useNavigate();
  const { results, loading, assisted, assisting } = useAutocomplete(query, games);
  const intent = useMemo(() => parseSearchIntent(query), [query]);
  const franchiseMatch = useMemo(() => matchFranchise(query), [query]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
    }
  }, [open]);

  const localResults = results.filter((r) => r.kind === "local");
  const liveResults = results.filter((r) => r.kind === "live");
  const assistedResults = assisted?.results ?? [];
  const flat: Array<Suggestion | { kind: "intent" } | { kind: "franchise"; name: string }> = [
    ...(intent ? [{ kind: "intent" as const }] : []),
    ...(franchiseMatch ? [{ kind: "franchise" as const, name: franchiseMatch }] : []),
    ...localResults,
    ...liveResults,
    ...assistedResults,
  ];

  function close() {
    onOpenChange(false);
  }

  function applyIntent() {
    if (!intent) return;
    const params = new URLSearchParams();
    if (intent.status) params.set("status", intent.status);
    if (intent.year) params.set("year", intent.year);
    navigate(`/?${params.toString()}`);
    close();
  }

  function goToFranchise() {
    if (!franchiseMatch) return;
    navigate(`/franchise/${slugify(franchiseMatch)}`);
    close();
  }

  async function selectSuggestion(s: Suggestion) {
    if (s.kind === "local") {
      navigate(`/game/${s.id}`);
      close();
      return;
    }
    setResolving(true);
    const game = await buildLiveGameFromRows(s.title);
    setResolving(false);
    if (!game) return;
    onLiveGameResolved(game);
    navigate(`/game/${game.id}`);
    close();
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
    }
  }

  let rowCursor = -1;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="cmdk-overlay" />
        <Dialog.Content className="cmdk-content liquid-sheen" aria-describedby={undefined}>
          <Dialog.Title className="cmdk-visually-hidden">Search orlaz</Dialog.Title>
          <div className="cmdk-input-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              autoFocus
              placeholder="Search titles, groups, publishers…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={onKeyDown}
            />
            <kbd className="cmdk-esc">ESC</kbd>
          </div>

          <div className="cmdk-results">
            {intent ? (
              <button
                className={`cmdk-intent cmdk-row${(rowCursor += 1) === activeIndex ? " cmdk-row--active" : ""}`}
                onClick={applyIntent}
              >
                <span className="cmdk-intent-icon">⌁</span>
                <span>
                  Filter by <strong>{intent.label}</strong>
                </span>
              </button>
            ) : null}

            {franchiseMatch ? (
              <button
                className={`cmdk-intent cmdk-row${(rowCursor += 1) === activeIndex ? " cmdk-row--active" : ""}`}
                onClick={goToFranchise}
              >
                <span className="cmdk-intent-icon">◈</span>
                <span>
                  Go to the <strong>{franchiseMatch}</strong> franchise ›
                </span>
              </button>
            ) : null}

            {loading ? <div className="cmdk-status">Searching…</div> : null}
            {resolving ? <div className="cmdk-status">Opening…</div> : null}

            {!loading && !resolving && localResults.length ? (
              <div className="cmdk-group">
                <div className="cmdk-group-label">In your catalogue</div>
                {localResults.map((s) => {
                  rowCursor += 1;
                  const idx = rowCursor;
                  return (
                    <button
                      key={s.id}
                      className={`cmdk-item cmdk-row${idx === activeIndex ? " cmdk-row--active" : ""}`}
                      onClick={() => selectSuggestion(s)}
                    >
                      <span className="cmdk-item-title">{s.title}</span>
                      {s.kind === "local" && s.year ? <span className="cmdk-item-year">{s.year}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {!loading && !resolving && liveResults.length ? (
              <div className="cmdk-group">
                <div className="cmdk-group-label">From xREL, live</div>
                {liveResults.map((s) => {
                  rowCursor += 1;
                  const idx = rowCursor;
                  return (
                    <button
                      key={s.id}
                      className={`cmdk-item cmdk-row${idx === activeIndex ? " cmdk-row--active" : ""}`}
                      onClick={() => selectSuggestion(s)}
                    >
                      <span className="cmdk-item-title">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {!loading && !resolving && assisting ? <div className="cmdk-status">Thinking…</div> : null}

            {!loading && !resolving && assisted && assistedResults.length ? (
              <div className="cmdk-group">
                <div className="cmdk-group-label">Did you mean "{assisted.label}"?</div>
                {assistedResults.map((s) => {
                  rowCursor += 1;
                  const idx = rowCursor;
                  return (
                    <button
                      key={s.id}
                      className={`cmdk-item cmdk-row${idx === activeIndex ? " cmdk-row--active" : ""}`}
                      onClick={() => selectSuggestion(s)}
                    >
                      <span className="cmdk-item-title">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* "No matches" must mean we actually checked, not just that
                nothing has come back yet -- besides the in-flight live
                fetch (loading) and the Groq typo-assist stage (assisting,
                which can still turn up a "did you mean"), the catalog's
                own first sync pass (status "syncing") also has to be past
                us, since local matches are only as good as whatever's
                loaded into `games` so far. */}
            {!loading && !resolving && !assisting && !intent && !flat.length && catalogStatus !== "syncing" && query.trim().length >= 2 ? (
              <div className="cmdk-status">No matches.</div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

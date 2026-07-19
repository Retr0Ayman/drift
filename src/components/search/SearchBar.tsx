import "./SearchBar.css";

interface SearchBarProps {
  onOpenSearch: () => void;
}

/* Just a trigger now, not its own search UI -- opens the same CommandPalette
   overlay Cmd/Ctrl+K does (see App.tsx's Layout, which lifts the open state
   so both triggers share it). Used to run a full second, near-duplicate
   copy of CommandPalette's suggestion/intent/franchise logic in its own
   anchored Popover; consolidated into one search surface instead of two
   that could drift out of sync with each other. */
export default function SearchBar({ onOpenSearch }: SearchBarProps) {
  return (
    <div className="aura-ring searchbar-aura">
      <button type="button" className="searchbar liquid-sheen" onClick={onOpenSearch} aria-label="Search titles, groups, publishers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="searchbar-placeholder">Search titles, groups, publishers…</span>
        <kbd className="searchbar-kbd-hint">⌘K</kbd>
      </button>
    </div>
  );
}

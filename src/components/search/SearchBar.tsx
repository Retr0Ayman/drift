import "./SearchBar.css";

interface SearchBarProps {
  onOpenSearch: () => void;
}

/* Just a trigger -- opens the same CommandPalette overlay Cmd/Ctrl+K does
   (App.tsx's Layout lifts the open state so both share it). */
export default function SearchBar({ onOpenSearch }: SearchBarProps) {
  return (
    <button type="button" className="searchbar" onClick={onOpenSearch} aria-label="Search games, groups, publishers">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="searchbar-placeholder">Search games, groups, publishers</span>
      <kbd className="searchbar-kbd-hint">⌘K</kbd>
    </button>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import SearchBar from "../search/SearchBar";
import type { Game } from "../../types/game";
import type { CatalogStatus } from "../../hooks/useLiveCatalog";
import "./Navbar.css";

const STATUS_LABEL: Record<CatalogStatus, string> = {
  seeded: "SEEDED",
  syncing: "SYNCING",
  live: "LIVE",
};

interface NavbarProps {
  games: Game[];
  status: CatalogStatus;
  onLiveGameResolved: (game: Game) => void;
}

/* Blur radius + background alpha scale with scroll position via Motion values
   (no React re-render on scroll -- these update on the compositor/rAF
   directly), instead of a flat fixed bar. */
export default function Navbar({ games, status, onLiveGameResolved }: NavbarProps) {
  const { scrollY } = useScroll();
  const blur = useTransform(scrollY, [0, 140], [0, 22]);
  const bgAlpha = useTransform(scrollY, [0, 140], [0, 0.78]);
  const borderAlpha = useTransform(scrollY, [0, 140], [0, 0.22]);
  const backdropFilter = useTransform(blur, (b) => `blur(${b}px) saturate(160%)`);
  // rgb(244, 236, 224) is --bg-0 (the warm cream page base); the border
  // ramps in a warm brown tint (matching --glass-border-strong) rather than
  // white, which would be invisible against a light ground.
  const background = useTransform(bgAlpha, (a) => `rgba(244, 236, 224, ${a})`);
  const borderColor = useTransform(borderAlpha, (a) => `rgba(130, 95, 60, ${a})`);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.nav
      className="navbar"
      style={{ backdropFilter, WebkitBackdropFilter: backdropFilter, background, borderBottomColor: borderColor }}
    >
      <div className="navbar-inner wrap">
        <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
          <span className="navbar-mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M8 18V6h4.5c3 0 4.5 2.2 4.5 6s-1.5 6-4.5 6H8Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="navbar-word">
            <span className="navbar-title">DRIFT</span>
            <span className="navbar-sub">BY DAREALAYMAN</span>
          </span>
        </Link>

        <button
          className="navbar-toggle"
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>

        <div className={`navbar-links${menuOpen ? " navbar-links--open" : ""}`}>
          <Link to="/" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link to="/groups" onClick={() => setMenuOpen(false)}>Groups</Link>
          <Link to="/publishers" onClick={() => setMenuOpen(false)}>Publishers</Link>
        </div>

        <div className="navbar-search-slot">
          <SearchBar games={games} onLiveGameResolved={onLiveGameResolved} />
        </div>

        <div className="navbar-live">
          <span className="navbar-pip" />
          <span>{STATUS_LABEL[status]}</span>
        </div>
      </div>
    </motion.nav>
  );
}

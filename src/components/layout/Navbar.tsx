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

/* Floating pill nav, Apple/Linear-marketing-site style -- margin from every
   edge, never spans the full viewport width, sits on top of the page
   rather than being part of its flow (position: fixed; App.tsx compensates
   with padding-top on .page-content). Scroll only nudges the pill's own
   shadow/border intensity and a slight scale-down, not a 0->solid alpha
   ramp -- a floating element that's invisible at rest reads as broken, not
   restrained, the way a flush edge-to-edge bar could get away with. */
export default function Navbar({ games, status, onLiveGameResolved }: NavbarProps) {
  const { scrollY } = useScroll();
  const scrollProgress = useTransform(scrollY, [0, 120], [0, 1]);
  const scale = useTransform(scrollProgress, [0, 1], [1, 0.985]);
  const shadowAlpha = useTransform(scrollProgress, [0, 1], [0.14, 0.32]);
  const borderAlpha = useTransform(scrollProgress, [0, 1], [0.22, 0.36]);
  const boxShadow = useTransform(
    shadowAlpha,
    (a) => `0 24px 60px -18px rgba(0, 0, 0, ${a}), inset 0 1px 0 rgba(255,255,255,0.08)`,
  );
  const borderColor = useTransform(borderAlpha, (a) => `rgba(255, 255, 255, ${a})`);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="navbar-float">
      <motion.nav className="navbar" style={{ scale, boxShadow, borderColor }}>
        <div className="navbar-inner">
          <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
            <span className="navbar-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2.2" />
              </svg>
            </span>
            <span className="navbar-word">
              <span className="navbar-title">Orvyn</span>
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
            <Link to="/watchlist" onClick={() => setMenuOpen(false)}>Watchlist</Link>
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
    </div>
  );
}

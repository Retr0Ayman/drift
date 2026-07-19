import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import SearchBar from "../search/SearchBar";
import DriftMark from "../ui/illustrations/DriftMark";
import Pill, { type PillTone } from "../ui/Pill";
import type { CatalogStatus } from "../../hooks/useLiveCatalog";
import "./Navbar.css";

const STATUS_LABEL: Record<CatalogStatus, string> = {
  seeded: "SEEDED",
  syncing: "SYNCING",
  live: "LIVE",
};

// Reuses the same status-pill tones item 2 already gave a bolder, more
// confident treatment (rounded-square, bold weight) -- "live" maps to the
// same green "Current" tone a release in good standing gets, "syncing" to
// the warm in-progress "out" tone, "seeded" to the neutral "unv" tone. Not
// a new badge style: this IS the FLAG_TONE system, just applied to a
// different status vocabulary than release freshness.
const STATUS_TONE: Record<CatalogStatus, PillTone> = {
  seeded: "unv",
  syncing: "out",
  live: "dead",
};

interface NavbarProps {
  status: CatalogStatus;
  onOpenSearch: () => void;
  revealBrandMark: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

/* Floating pill nav, Apple/Linear-marketing-site style -- margin from every
   edge, never spans the full viewport width, sits on top of the page
   rather than being part of its flow (position: fixed; App.tsx compensates
   with padding-top on .page-content). Scroll only nudges the pill's own
   shadow/border intensity and a slight scale-down, not a 0->solid alpha
   ramp -- a floating element that's invisible at rest reads as broken, not
   restrained, the way a flush edge-to-edge bar could get away with. */
export default function Navbar({ status, onOpenSearch, revealBrandMark, theme, onToggleTheme }: NavbarProps) {
  const { scrollY } = useScroll();
  const scrollProgress = useTransform(scrollY, [0, 120], [0, 1]);
  const scale = useTransform(scrollProgress, [0, 1], [1, 0.985]);
  const shadowAlpha = useTransform(scrollProgress, [0, 1], [0.05, 0.12]);
  // Composed with var(--glass-highlight) (the same top-edge inner-highlight
  // GlassPanel.css now gives every other glass surface) so the navbar gets
  // real depth too -- an inline style always wins over any CSS box-shadow
  // rule regardless of specificity, so the highlight has to be baked into
  // this motion value rather than left in a static CSS rule that scroll
  // would just override every frame.
  const boxShadow = useTransform(shadowAlpha, (a) => `var(--glass-highlight), 0 8px 24px -8px rgba(23, 21, 15, ${a})`);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="navbar-float">
      <motion.nav className="navbar liquid-sheen" style={{ scale, boxShadow }}>
        <div className="navbar-inner">
          <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
            {revealBrandMark ? (
              <motion.span layoutId="brand-mark" className="navbar-mark">
                <DriftMark />
              </motion.span>
            ) : (
              <span className="navbar-mark">
                <DriftMark />
              </span>
            )}
            <span className="navbar-word">
              <span className="navbar-title">orlaz</span>
              <span className="navbar-sub">BY DAREALAYMAN</span>
            </span>
          </Link>

          {/* FIX (confirmed live): .navbar-search-slot below is fully
              display:none under the 860px breakpoint, and Cmd/Ctrl+K has no
              mobile equivalent -- search was completely unreachable on any
              phone/tablet-width viewport, not just visually cramped. Same
              icon-button treatment as navbar-toggle/theme-toggle, only
              shown where the full SearchBar pill isn't (see Navbar.css). */}
          <button className="navbar-search-toggle" aria-label="Search" onClick={onOpenSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>

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
            <Link to="/digest" onClick={() => setMenuOpen(false)}>Digest</Link>
            <Link to="/publishers" onClick={() => setMenuOpen(false)}>Publishers</Link>
            <Link to="/watchlist" onClick={() => setMenuOpen(false)}>Watchlist</Link>
          </div>

          <div className="navbar-search-slot">
            <SearchBar onOpenSearch={onOpenSearch} />
          </div>

          <div className="navbar-status-group">
            <Pill tone="neutral" className="navbar-beta" title="orlaz is in active development -- data and visuals are still evolving">
              BETA
            </Pill>
            <Pill tone={STATUS_TONE[status]} className="navbar-live">
              {STATUS_LABEL[status]}
            </Pill>
          </div>

          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
              </svg>
            )}
          </button>
        </div>
      </motion.nav>
    </div>
  );
}

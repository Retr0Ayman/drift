import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import SearchBar from "../search/SearchBar";
import OrlazWordmark from "../ui/illustrations/OrlazWordmark";
import SyncStatus from "./SyncStatus";
import type { CatalogStatus } from "../../hooks/useLiveCatalog";
import { useTheme } from "../../hooks/useTheme";
import "./Navbar.css";

interface NavbarProps {
  status: CatalogStatus;
  latestTs: number | null;
  onOpenSearch: () => void;
  revealBrandMark: boolean;
}

/* Two separate floating glass capsules (a compact brand pill + a longer
   main pill), not one continuous bar -- the actual visionOS/dock pattern
   this whole site's glass language is modeled on is DISTINCT floating
   panels with real negative space (and the galactic wallpaper) between
   them, not a single edge-to-edge surface. .navbar-row constrains both to
   the same combined max-width the old single .navbar used, so the
   overall footprint on screen is unchanged, just split. Scroll only
   nudges each pill's own shadow/border intensity and a slight scale-down,
   not a 0->solid alpha ramp -- a floating element that's invisible at
   rest reads as broken, not restrained, the way a flush edge-to-edge bar
   could get away with. */
export default function Navbar({ status, latestTs, onOpenSearch, revealBrandMark }: NavbarProps) {
  const { scrollY } = useScroll();
  const scrollProgress = useTransform(scrollY, [0, 120], [0, 1]);
  const scale = useTransform(scrollProgress, [0, 1], [1, 0.985]);
  const shadowAlpha = useTransform(scrollProgress, [0, 1], [0.05, 0.12]);
  // Composed with var(--glass-highlight) (the same top-edge inner-highlight
  // GlassPanel.css now gives every other glass surface) so the navbar gets
  // real depth too -- an inline style always wins over any CSS box-shadow
  // rule regardless of specificity, so the highlight has to be baked into
  // this motion value rather than left in a static CSS rule that scroll
  // would just override every frame. Third layer is new for the galactic
  // pass -- a soft cosmic-blue glow underneath, same reason it has to live
  // here and not in Navbar.css: Navbar.css's own box-shadow attempts would
  // just lose to this inline style regardless of specificity.
  const boxShadow = useTransform(
    shadowAlpha,
    (a) => `var(--glass-highlight), 0 8px 24px -8px rgba(23, 21, 15, ${a})`,
  );

  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="navbar-float">
      <div className="navbar-row">
        <motion.div className="navbar-brand liquid-sheen" style={{ scale, boxShadow }}>
          <span className="navbar-topglow" />
          <Link to="/" className="navbar-logo" onClick={() => setMenuOpen(false)}>
            <span className="navbar-word">
              <OrlazWordmark layoutId={revealBrandMark ? "brand-mark" : undefined} className="navbar-title" />
              <span className="navbar-sub">by DaRealAyman</span>
            </span>
          </Link>
        </motion.div>

        <motion.nav className="navbar-main liquid-sheen" style={{ scale, boxShadow }}>
          <span className="navbar-topglow" />
          <div className="navbar-inner">
            {/* FIX (confirmed live): .navbar-search-slot below is fully
                display:none under the 860px breakpoint, and Cmd/Ctrl+K has no
                mobile equivalent -- search was completely unreachable on any
                phone/tablet-width viewport, not just visually cramped. Same
                icon-button treatment as navbar-toggle/theme-toggle, only
                shown where the full SearchBar pill isn't (see Navbar.css). */}
            <button
              className="navbar-theme-toggle"
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={toggleTheme}
            >
              {theme === "light" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4.5" />
                  <path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.5 14.2a8.5 8.5 0 1 1-10.7-10.7 7 7 0 0 0 10.7 10.7z" />
                </svg>
              )}
            </button>

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
              <NavLink to="/" end onClick={() => setMenuOpen(false)}>Home</NavLink>
              <NavLink to="/groups" onClick={() => setMenuOpen(false)}>Groups</NavLink>
              <NavLink to="/trending" onClick={() => setMenuOpen(false)}>Trending</NavLink>
              <NavLink to="/digest" onClick={() => setMenuOpen(false)}>Digest</NavLink>
              <NavLink to="/publishers" onClick={() => setMenuOpen(false)}>Publishers</NavLink>
              <NavLink to="/denuvo-tracker" onClick={() => setMenuOpen(false)}>Denuvo Tracker</NavLink>
              <NavLink to="/watchlist" onClick={() => setMenuOpen(false)}>Watchlist</NavLink>
            </div>

            <div className="navbar-search-slot">
              <SearchBar onOpenSearch={onOpenSearch} />
            </div>

            <div className="navbar-status-group">
              <span className="navbar-beta" title="orlaz is in active development -- data and visuals are still evolving">
                Beta
              </span>
              <SyncStatus status={status} latestTs={latestTs} />
            </div>
          </div>
        </motion.nav>
      </div>
    </div>
  );
}

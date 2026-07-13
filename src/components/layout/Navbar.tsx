import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import "./Navbar.css";

/* Blur radius + background alpha scale with scroll position via Motion values
   (no React re-render on scroll -- these update on the compositor/rAF
   directly), instead of a flat fixed bar. */
export default function Navbar() {
  const { scrollY } = useScroll();
  const blur = useTransform(scrollY, [0, 140], [0, 22]);
  const bgAlpha = useTransform(scrollY, [0, 140], [0, 0.72]);
  const borderAlpha = useTransform(scrollY, [0, 140], [0, 0.1]);
  const backdropFilter = useTransform(blur, (b) => `blur(${b}px) saturate(160%)`);
  const background = useTransform(bgAlpha, (a) => `rgba(8, 9, 11, ${a})`);
  const borderColor = useTransform(borderAlpha, (a) => `rgba(255, 255, 255, ${a})`);

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
        </div>

        <div className="navbar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input placeholder="Search" aria-label="Search titles" />
        </div>

        <div className="navbar-live">
          <span className="navbar-pip" />
          <span>LIVE</span>
        </div>
      </div>
    </motion.nav>
  );
}

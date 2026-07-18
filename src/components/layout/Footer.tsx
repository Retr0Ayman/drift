import { Link } from "react-router-dom";
import DriftMark from "../ui/illustrations/DriftMark";
import "./Footer.css";

const EXPLORE_LINKS = [
  { to: "/", label: "Home" },
  { to: "/groups", label: "Groups" },
  { to: "/digest", label: "Digest" },
  { to: "/publishers", label: "Publishers" },
  { to: "/watchlist", label: "Watchlist" },
];

/* Real, professional footer -- replaces the old two-paragraph dev-note
   version (a casual "orlaz by DaRealAyman · status & build tracker, not a
   mirror" line and, worse, a literal "See DEPLOY.md" reference that had no
   business being user-facing at all). The actual SUBSTANCE of the old
   footer -- the no-mirror disclaimer and the real data-source attribution
   -- stays, just organized into real labeled sections instead of two
   run-together sentences. */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-col footer-brand">
          <div className="footer-logo">
            <span className="footer-mark">
              <DriftMark />
            </span>
            <span className="footer-wordmark">orlaz</span>
          </div>
          <p className="footer-tagline">Crack-status and Steam build tracking for PC releases.</p>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">Data sources</h4>
          <ul className="footer-list">
            <li>Metadata — Steam Store API</li>
            <li>Groups &amp; releases — xREL API</li>
            <li>Build history — SteamDB / steamcmd</li>
          </ul>
        </div>

        <div className="footer-col">
          <h4 className="footer-heading">Explore</h4>
          <ul className="footer-list">
            {EXPLORE_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer-col footer-legal">
          <h4 className="footer-heading">Disclaimer</h4>
          <p>
            orlaz tracks public release metadata and Steam build status only. It does not host, mirror, or link to
            any downloads, files, or manifests — news sources only.
          </p>
          <p>
            orlaz is in early access and under active development. Data, AI-generated content, and visuals are
            still being refined, so expect occasional gaps or rough edges.
          </p>
        </div>
      </div>

      <div className="wrap footer-bottom">
        <span>© {year} orlaz</span>
        <span className="footer-bottom-note">Real: Steam metadata, groups, facts, build IDs · Curated: crack-build pairings</span>
      </div>
    </footer>
  );
}

import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer wrap">
      <div>
        DRIFT by DaRealAyman · status &amp; build tracker, not a mirror.
        <br />
        Metadata: Steam Store API · Groups: xREL API · Builds: SteamDB/steamcmd. News sources only — no
        downloads, files or manifests.
      </div>
      <div className="footer-right">
        Real: Steam metadata, groups, facts, build ids · Curated: crack-build pairings
        <br />
        See DEPLOY.md.
      </div>
    </footer>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { publishersIndex } from "../../lib/companies";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import CompanyLogo from "./CompanyLogo";
import WorldMap from "./WorldMap";
import "./Publishers.css";

export default function PublishersDirectory() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const idx = publishersIndex(games);
  const [country, setCountry] = useState<string | null>(null);

  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    idx.forEach((e) => {
      if (e.country) counts[e.country] = (counts[e.country] || 0) + 1;
    });
    return counts;
  }, [idx]);

  const visible = country ? idx.filter((e) => e.country === country) : idx;
  const taggedCount = idx.filter((e) => e.country).length;

  return (
    <div className="wrap publishers-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>
      <Reveal>
        <div className="publishers-head">
          <span className="publishers-eyebrow">Publishers</span>
          <h1>Every publisher DRIFT is tracking</h1>
          <p className="publishers-lede">
            AAA publishers sort to the top. Real icons where we have a verified company domain; a plain
            initials badge everywhere else — never a guessed image. Region tags are a curated HQ mapping, not
            an API — untagged publishers just don't appear on the map, not mis-tagged.
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <GlassPanel className="publishers-map-panel">
          <div className="publishers-map-head">
            <span>{taggedCount} of {idx.length} publishers have a known HQ region</span>
            {country ? (
              <button className="publishers-map-clear" onClick={() => setCountry(null)}>
                Clear: {country} ✕
              </button>
            ) : null}
          </div>
          <WorldMap countryCounts={countryCounts} selected={country} onSelect={setCountry} />
        </GlassPanel>
      </Reveal>

      <div className="publishers-grid">
        {visible.map((e, i) => (
          <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
            <Link to={`/publisher/${e.key}`}>
              <GlassPanel className={`publisher-card${e.aaa ? " publisher-card--aaa" : ""}`}>
                <CompanyLogo name={e.name} domain={e.domain} size={40} />
                <div>
                  <div className="publisher-name">
                    {e.name}
                    {e.aaa ? <span className="publisher-aaa-badge">AAA</span> : null}
                  </div>
                  <div className="publisher-count">
                    {e.count} title{e.count === 1 ? "" : "s"}
                    {e.country ? ` · ${e.country}` : ""}
                  </div>
                </div>
              </GlassPanel>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { publishersIndex } from "../../lib/companies";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import CompanyLogo from "./CompanyLogo";
import WorldMap from "./WorldMap";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Publishers.css";

export default function PublishersDirectory() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const idx = publishersIndex(games);
  usePageMeta({
    title: "Publishers",
    description: `${idx.length || "Every"} publisher orlaz is tracking, AAA and indie alike.`,
  });
  const [country, setCountry] = useState<string | null>(null);
  const [aaaOnly, setAaaOnly] = useState(false);

  const countryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    idx.forEach((e) => {
      if (e.country) counts[e.country] = (counts[e.country] || 0) + 1;
    });
    return counts;
  }, [idx]);

  const aaaFiltered = aaaOnly ? idx.filter((e) => e.aaa) : idx;
  const visible = country ? aaaFiltered.filter((e) => e.country === country) : aaaFiltered;
  const taggedCount = idx.filter((e) => e.country).length;
  const aaaCount = idx.filter((e) => e.aaa).length;
  const topByVolume = idx[0];

  return (
    <div className="wrap publishers-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ All titles
      </button>
      <Reveal>
        <div className="publishers-hero">
          <div className="publishers-hero-main">
            <span className="publishers-eyebrow">Publishers</span>
            <h1>Every publisher orlaz is tracking</h1>
            <p className="publishers-lede">
              AAA publishers sort to the top and carry a distinct badge — a curated tier list, not a
              size/revenue API. Real icons where we have a verified company domain; a plain initials badge
              everywhere else — never a guessed image.
            </p>
          </div>
          <GlassPanel strong className="publishers-signal">
            <div className="publishers-signal-head">Directory signal</div>
            <div className="publishers-signal-grid">
              <div className="publishers-signal-stat">
                <span className="publishers-signal-n">{idx.length || "—"}</span>
                <span className="publishers-signal-l">Publishers tracked</span>
              </div>
              <div className="publishers-signal-stat">
                <span className="publishers-signal-n" style={{ color: "var(--accent)" }}>
                  {aaaCount || "—"}
                </span>
                <span className="publishers-signal-l">AAA tier</span>
              </div>
              <div className="publishers-signal-stat">
                <span className="publishers-signal-n">{taggedCount || "—"}</span>
                <span className="publishers-signal-l">Confirmed HQ region</span>
              </div>
              <div className="publishers-signal-stat">
                <span className="publishers-signal-n publishers-signal-n--sm">{topByVolume?.name || "—"}</span>
                <span className="publishers-signal-l">Most tracked</span>
              </div>
            </div>
          </GlassPanel>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <GlassPanel className="publishers-map-panel">
          <div className="publishers-map-head">
            <div className="publishers-map-headline">
              <span>{taggedCount} of {idx.length} publishers have a confirmed HQ region — click a country to filter</span>
              <span className="publishers-map-sub">Countries without a filled marker have no tagged publisher yet.</span>
            </div>
            <div className="publishers-map-controls">
              <button
                className={`publishers-aaa-toggle${aaaOnly ? " publishers-aaa-toggle--on" : ""}`}
                onClick={() => setAaaOnly((v) => !v)}
                aria-pressed={aaaOnly}
              >
                AAA only ({aaaCount})
              </button>
              {country ? (
                <button className="publishers-map-clear" onClick={() => setCountry(null)}>
                  Clear: {country} ✕
                </button>
              ) : null}
            </div>
          </div>
          <WorldMap countryCounts={countryCounts} selected={country} onSelect={setCountry} />
        </GlassPanel>
      </Reveal>

      <div className="publishers-grid-head">
        {visible.length} publisher{visible.length === 1 ? "" : "s"} shown
        {aaaOnly ? " · AAA only" : ""}
        {country ? ` · HQ: ${country}` : ""}
      </div>

      <div className="publishers-grid">
        {visible.map((e, i) => (
          <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
            <Link to={`/publisher/${e.key}`}>
              <GlassPanel className={`publisher-card${e.aaa ? " publisher-card--aaa" : ""}`} frostStrong>
                <CompanyLogo name={e.name} domain={e.domain} size={40} />
                <div>
                  <div className="publisher-name">
                    {e.name}
                    {e.aaa ? <span className="publisher-aaa-badge">AAA</span> : null}
                  </div>
                  <div className="publisher-count">
                    {e.count} title{e.count === 1 ? "" : "s"}
                    {" · "}
                    {e.country ? e.country : <span className="publisher-region-unknown">Region unknown</span>}
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

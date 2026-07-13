import { Link, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { publishersIndex } from "../../lib/companies";
import GlassPanel from "../ui/GlassPanel";
import Reveal from "../ui/Reveal";
import CompanyLogo from "./CompanyLogo";
import "./Publishers.css";

export default function PublishersDirectory() {
  const navigate = useNavigate();
  const { games } = useCatalog();
  const idx = publishersIndex(games);

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
            Grouped by publisher, franchises collapsed together where we know the mapping. Real logos where we
            have a verified company domain; a plain initials badge everywhere else — never a guessed image.
          </p>
        </div>
      </Reveal>

      <div className="publishers-grid">
        {idx.map((e, i) => (
          <Reveal key={e.key} delay={Math.min(i, 8) * 0.04}>
            <Link to={`/publisher/${e.key}`}>
              <GlassPanel className="publisher-card">
                <CompanyLogo name={e.name} domain={e.domain} size={40} />
                <div>
                  <div className="publisher-name">{e.name}</div>
                  <div className="publisher-count">
                    {e.count} title{e.count === 1 ? "" : "s"}
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

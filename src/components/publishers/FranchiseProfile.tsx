import { useParams, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { franchiseFor, franchiseNameForSlug } from "../../lib/companies";
import Reveal from "../ui/Reveal";
import GameCard from "../home/GameCard";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Publishers.css";

export default function FranchiseProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { games, status } = useCatalog();
  const name = slug ? franchiseNameForSlug(slug) : null;
  const matches = name ? games.filter((g) => franchiseFor(g.title) === name) : [];

  usePageMeta({
    title: name ? `${name} franchise` : "Franchise not found",
    description:
      name && matches.length
        ? `${matches.length} tracked title${matches.length === 1 ? "" : "s"} in the ${name} franchise.`
        : undefined,
  });

  if (!name) {
    return (
      <div className="wrap publishers-page">
        <button className="back-link" onClick={() => navigate(-1)}>
          ‹ Back
        </button>
        <p className="publishers-lede">Unknown franchise.</p>
      </div>
    );
  }

  if (!matches.length) {
    return (
      <div className="wrap publishers-page">
        <button className="back-link" onClick={() => navigate(-1)}>
          ‹ Back
        </button>
        <p className="publishers-lede">
          {status === "live"
            ? `No titles from the ${name} franchise in the currently loaded catalogue.`
            : "Catalogue is still syncing — this franchise's titles may not have loaded yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="wrap publishers-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ Back
      </button>

      <Reveal>
        <div className="publisherhead">
          <div>
            <div className="publisherhead-tag">Franchise</div>
            <h1>{name}</h1>
            <div className="publisherhead-meta">
              {matches.length} title{matches.length === 1 ? "" : "s"} tracked
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.05}>
        <section className="franchise-block">
          <div className="franchise-grid">
            {matches.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
      </Reveal>
    </div>
  );
}

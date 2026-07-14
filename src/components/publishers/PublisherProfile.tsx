import { useParams, useNavigate } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { publisherDomain, isAaaPublisher, publisherCountry, groupByFranchise } from "../../lib/companies";
import { slugify } from "../../lib/format";
import CompanyLogo from "./CompanyLogo";
import Reveal from "../ui/Reveal";
import AiSummary from "../ui/AiSummary";
import GameCard from "../home/GameCard";
import "./Publishers.css";

export default function PublisherProfile() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { games, status } = useCatalog();
  const matches = games.filter((g) => g.publisher && slugify(g.publisher) === key);

  if (!matches.length) {
    return (
      <div className="wrap publishers-page">
        <button className="back-link" onClick={() => navigate(-1)}>
          ‹ Publishers
        </button>
        <p className="publishers-lede">
          {status === "live"
            ? "No titles from this publisher in the currently loaded catalogue."
            : "Catalogue is still syncing — this publisher's titles may not have loaded yet."}
        </p>
      </div>
    );
  }

  const name = matches[0].publisher as string;
  const domain = publisherDomain(name);
  const { franchises, standalone } = groupByFranchise(matches);

  return (
    <div className="wrap publishers-page">
      <button className="back-link" onClick={() => navigate(-1)}>
        ‹ Publishers
      </button>

      <Reveal>
        <div className="publisherhead">
          <CompanyLogo name={name} domain={domain} size={60} />
          <div>
            <div className="publisherhead-tag">Publisher</div>
            <h1>{name}</h1>
            <div className="publisherhead-meta">
              {matches.length} title{matches.length === 1 ? "" : "s"} tracked
              {franchises.length ? ` · ${franchises.length} franchise${franchises.length === 1 ? "" : "s"}` : ""}
            </div>
            <AiSummary
              kind="publisher"
              cacheKey={key || name}
              name={name}
              ready={status === "live"}
              facts={{
                "Titles tracked": matches.length,
                "AAA tier": isAaaPublisher(name) ? "yes" : "no",
                "HQ region": publisherCountry(name) || "unknown",
                "Tracked titles": matches.slice(0, 8).map((g) => g.title),
              }}
            />
          </div>
        </div>
      </Reveal>

      {franchises.map((f, i) => (
        <Reveal key={f.name} delay={Math.min(i, 6) * 0.05}>
          <section className="franchise-block">
            <h2 className="franchise-title">{f.name}</h2>
            <div className="franchise-grid">
              {f.games.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        </Reveal>
      ))}

      {standalone.length ? (
        <Reveal delay={Math.min(franchises.length, 6) * 0.05}>
          <section className="franchise-block">
            {franchises.length ? <h2 className="franchise-title franchise-title--muted">Other titles</h2> : null}
            <div className="franchise-grid">
              {standalone.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        </Reveal>
      ) : null}
    </div>
  );
}

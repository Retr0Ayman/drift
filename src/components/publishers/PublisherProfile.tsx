import { useParams, useNavigate, Link } from "react-router-dom";
import { useCatalog } from "../../hooks/useCatalog";
import { publisherDomain, isAaaPublisher, publisherCountry, groupByFranchise } from "../../lib/companies";
import { slugify } from "../../lib/format";
import type { Game } from "../../types/game";
import CompanyLogo from "./CompanyLogo";
import Reveal from "../ui/Reveal";
import GlassPanel from "../ui/GlassPanel";
import AiSummary from "../ui/AiSummary";
import GameCard from "../home/GameCard";
import { usePageMeta } from "../../hooks/usePageMeta";
import "./Publishers.css";

/* Real, distinctive angle for the AI summary instead of a second listing
   of titles it already has via Franchises/Tracked titles below -- confirmed
   live the old fact set (title count + AAA tag + HQ region + franchise
   names + up to 8 individual titles) gave the model nothing genuinely new
   to say once a small publisher's franchise list and title list were the
   same handful of games, so it restated that one list three ways instead.
   The most common real protection scheme across a publisher's own tracked
   catalog (worker/backfill/pcgamingwiki.ts's real per-game DRM lookup,
   already stored on every game) is a real, computed fact this site
   specifically tracks and no other publisher-info source would phrase this
   way -- exactly the kind of angle worth leading with. */
function commonProtectionFact(games: Game[]): string | undefined {
  const counts = new Map<string, number>();
  for (const g of games) {
    for (const t of g.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  if (!counts.size) return undefined;
  const [topTag, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return `${topCount} of ${games.length} tracked title${games.length === 1 ? "" : "s"} use ${topTag}`;
}

export default function PublisherProfile() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { games, status } = useCatalog();
  const matches = games.filter((g) => g.publisher && slugify(g.publisher) === key);

  usePageMeta({
    title: matches[0]?.publisher || "Publisher",
    description: matches.length
      ? `${matches.length} tracked title${matches.length === 1 ? "" : "s"} from ${matches[0].publisher}.`
      : undefined,
  });

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
        <GlassPanel className="publisherhead" frost>
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
                "AAA publisher": isAaaPublisher(name) ? "true" : undefined,
                "HQ region": publisherCountry(name) || "unknown",
                // Already computed above for the header/franchise-block
                // rendering -- real, currently-unused-by-the-AI data, same
                // "don't restate metadata, use what's actually distinctive"
                // fix already applied to fact.ts's Did You Know box.
                Franchises: franchises.length ? franchises.map((f) => f.name) : undefined,
                // FIX (confirmed live, repetitive-summary report): this used
                // to be matches.slice(0, 8) -- every tracked title,
                // including ones already named via Franchises above. For a
                // publisher with few titles (most of them, outside the very
                // largest), that's the same handful of games listed twice
                // under two different fact labels, which is exactly what
                // produced summaries restating one title list three ways.
                // standalone (already computed above) is only the titles
                // NOT already covered by a franchise entry, so this and
                // Franchises never overlap.
                "Tracked titles": standalone.length ? standalone.slice(0, 8).map((g) => g.title) : undefined,
                Protection: commonProtectionFact(matches),
              }}
            />
          </div>
        </GlassPanel>
      </Reveal>

      {franchises.map((f, i) => (
        <Reveal key={f.name} delay={Math.min(i, 6) * 0.05}>
          <section className="franchise-block">
            <h2 className="franchise-title">
              <Link to={`/franchise/${slugify(f.name)}`}>{f.name}</Link>
            </h2>
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

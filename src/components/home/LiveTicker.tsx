import { Link } from "react-router-dom";
import Pill from "../ui/Pill";
import { releaseTs } from "../../lib/format";
import type { Game, Release } from "../../types/game";
import "./LiveTicker.css";

interface TickerItem {
  id: string;
  title: string;
  group: string;
  method: Release["method"];
  isRepack: boolean;
  isAnonymous: boolean;
  ts: number;
}

const TICKER_LIMIT = 16;

/* Each game contributes at most its own single most-recently-updated
   release (never every release it has, which would let one prolific
   title's whole history crowd out every other game) -- same "one real
   data point per game" discipline Hero's activity sparkline uses. Uses
   releaseTs (format.ts), the same real-timestamp-or-parsed-date helper
   every other recency feature on this site already relies on -- nothing
   invented here that the rest of the app doesn't already trust. Empty
   when no release on any game has a usable timestamp; callers must
   handle that (LiveTicker renders nothing rather than a fabricated
   placeholder row). */
function buildTicker(games: Game[]): TickerItem[] {
  const items: TickerItem[] = [];
  for (const g of games) {
    let best: { r: Release; ts: number } | null = null;
    for (const r of g.releases || []) {
      const ts = releaseTs(r);
      if (ts == null) continue;
      if (!best || ts > best.ts) best = { r, ts };
    }
    if (best) {
      items.push({
        id: g.id,
        title: g.title,
        group: best.r.group,
        method: best.r.method,
        isRepack: !!best.r.isRepack,
        isAnonymous: !!best.r.isAnonymous,
        ts: best.ts,
      });
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, TICKER_LIMIT);
}

function TickerRow({ items, duplicate }: { items: TickerItem[]; duplicate?: boolean }) {
  return (
    <div className="live-ticker-row" aria-hidden={duplicate ? "true" : undefined}>
      {items.map((it, i) => (
        <Link
          key={`${it.id}-${i}`}
          to={`/game/${it.id}`}
          className="live-ticker-item"
          tabIndex={duplicate ? -1 : undefined}
        >
          <Pill tone={it.isRepack || it.isAnonymous ? "neutral" : it.method}>
            {it.isAnonymous ? "P2P" : it.isRepack ? "Repack" : it.method === "hv" ? "HV" : "TRAD"}
          </Pill>
          <span className="live-ticker-title">{it.title}</span>
          <span className="live-ticker-group">{it.isAnonymous ? "Anonymous" : it.group}</span>
        </Link>
      ))}
    </div>
  );
}

/* Full-width "breaking news" style strip -- the site-wide equivalent of
   the Hero's per-page Live Signal panel, except this one is a genuine
   feed of individual real releases rather than aggregate counts. Content
   is duplicated once and the pair is animated together (translateX 0 to
   -50%, linear, infinite) -- the standard seamless-marquee technique: at
   -50% the duplicate is pixel-identical to where the original started,
   so the loop point is invisible. Pauses on hover/focus so a release can
   actually be clicked, and collapses to a plain horizontally-scrollable
   (no animation) row under prefers-reduced-motion. */
export default function LiveTicker({ games }: { games: Game[] }) {
  const items = buildTicker(games);
  if (!items.length) return null;

  return (
    <div className="live-ticker liquid-sheen">
      <span className="live-ticker-label">
        <span className="live-ticker-dot" />
        Live
      </span>
      <div className="live-ticker-viewport">
        <div className="live-ticker-track">
          <TickerRow items={items} />
          <TickerRow items={items} duplicate />
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { releaseTs, earliestGenuineRelease, crackTimingDays, crackTimingLabel } from "../../lib/format";
import type { Game, Release } from "../../types/game";
import "./LiveTicker.css";

interface TickerCandidate {
  id: string;
  title: string;
  group: string;
  method: Release["method"];
  isRepack: boolean;
  isAnonymous: boolean;
  isFirst: boolean;
  timingDays: number | null;
  timingLabel: string | null;
  metacritic?: number;
  reviewPct?: number;
  ts: number;
  score: number;
}

const TICKER_LIMIT = 16;
const MIN_ITEMS = 6;

/* Real, unfabricated signals only -- every one of these already exists on
   Game/Release and is trusted elsewhere in the app (earliestGenuineRelease
   backs the GameDetail timeline's "first crack" marker, crackTimingLabel
   is the same Cracked-in-N-days copy the group leaderboard uses,
   metacritic/reviewPct are the same fields GameDetail's own stat badges
   read). Weights, not hard gates: a repack still CAN surface if nothing
   more notable is happening, it just needs the rest of the pool to be
   thin first (see the threshold-relaxation loop below).

   Deliberately NOT a flat bonus for isFirst alone -- confirmed live
   against the real catalog: most single-release niche/indie titles are
   trivially their own "first crack" by definition (there's only ever one
   release to compare against), so a flat isFirst bonus barely filtered
   anything and low-profile titles with slow, unremarkable turnarounds
   (Parcel Simulator "cracked in 185 days") still dominated the pool.
   "First crack" only earns real weight here when it's ALSO a fast one --
   the combination is the actual notable story ("this well-known-enough-
   to-race-for title got cracked same-day"), not the isFirst flag by
   itself. */
function scoreCandidate(
  c: Pick<TickerCandidate, "isFirst" | "method" | "isRepack" | "isAnonymous" | "metacritic" | "reviewPct" | "timingDays">,
): number {
  let score = 0;
  if (c.method === "hv") score += 3;
  if (c.metacritic != null && c.metacritic >= 75) score += 2;
  if (c.reviewPct != null && c.reviewPct >= 85) score += 2;
  if (c.isFirst && c.timingDays != null) {
    if (c.timingDays <= 2) score += 2;
    else if (c.timingDays <= 7) score += 1;
  }
  if (c.isRepack) score -= 3;
  if (c.isAnonymous) score -= 1;
  return score;
}

function toCandidate(g: Game, r: Release, ts: number, isFirst: boolean): TickerCandidate {
  const timingDays = isFirst ? crackTimingDays(g, r) : null;
  const timingLabel = isFirst ? crackTimingLabel(g, r) : null;
  const c = {
    id: g.id,
    title: g.title,
    group: r.group,
    method: r.method,
    isRepack: !!r.isRepack,
    isAnonymous: !!r.isAnonymous,
    isFirst,
    timingDays,
    timingLabel,
    metacritic: g.metacritic ?? undefined,
    reviewPct: g.reviewPct ?? undefined,
    ts,
  };
  return { ...c, score: scoreCandidate(c) };
}

/* One real event per game (never every release it has, which would let a
   prolific/ongoing title crowd out everyone else) -- but which event is
   now a real choice instead of always "whatever updated most recently":
   a game's genuine first crack (earliestGenuineRelease, the same helper
   the GameDetail timeline trusts) is scored alongside its most-recently-
   updated release, and the better STORY wins, not just the newer
   timestamp. Then the whole pool is filtered toward what's actually
   notable -- hypervisor bypasses, first cracks, well-reviewed titles --
   and only falls back toward including routine repacks/anonymous
   uploads if the catalog genuinely doesn't have enough notable real
   events to fill the ticker (never fabricated, just less picky). */
function buildTicker(games: Game[]): TickerCandidate[] {
  const perGame: TickerCandidate[] = [];
  for (const g of games) {
    const releases = g.releases || [];
    const genuine = earliestGenuineRelease(releases);
    const candidates: TickerCandidate[] = [];

    if (genuine) {
      const ts = releaseTs(genuine);
      if (ts != null) candidates.push(toCandidate(g, genuine, ts, true));
    }

    let latest: { r: Release; ts: number } | null = null;
    for (const r of releases) {
      const ts = releaseTs(r);
      if (ts == null) continue;
      if (!latest || ts > latest.ts) latest = { r, ts };
    }
    if (latest && latest.r !== genuine) {
      candidates.push(toCandidate(g, latest.r, latest.ts, false));
    }

    if (!candidates.length) continue;
    candidates.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.ts - a.ts));
    perGame.push(candidates[0]);
  }

  perGame.sort((a, b) => b.ts - a.ts);

  let threshold = 1;
  let pool = perGame.filter((c) => c.score >= threshold);
  while (pool.length < Math.min(MIN_ITEMS, perGame.length) && threshold > -6) {
    threshold -= 1;
    pool = perGame.filter((c) => c.score >= threshold);
  }

  return pool.slice(0, TICKER_LIMIT);
}

/* Real, but not always a meaningful STORY -- an old backlog title whose
   first tracked crack row simply postdates its (much older) Steam release
   date by years reads as "Cracked in 4081 days," which isn't a race
   result, it's a backfill artifact (the actual crack timing race is
   normally measured in single/double-digit days). timingDays already only
   earns a scoring bonus within a 7-day window; this caps what the UI will
   actually PRINT the same way, so a real-but-nonsensical-looking number
   never gets surfaced as if it were a notable turnaround. */
const TIMING_DISPLAY_CAP_DAYS = 90;

/* Distinct phrasing per real distinguishing feature instead of one
   template stamped out for every item -- a first crack, a hypervisor
   bypass, a repack, and a well-reviewed title's routine update all read
   as different little facts now, not the same "[pill] title group" shape
   repeated on a loop. Every branch only ever states something the
   candidate's own real fields support. */
function phraseFor(c: TickerCandidate): { headline: string; meta: string; accent?: string } {
  const groupLabel = c.isAnonymous ? "Anonymous" : c.group;
  const showTiming = c.timingLabel != null && c.timingDays != null && Math.abs(c.timingDays) <= TIMING_DISPLAY_CAP_DAYS;

  if (c.isFirst && c.method === "hv") {
    return { headline: `First hypervisor bypass: ${c.title}`, meta: `by ${groupLabel}`, accent: "var(--hv)" };
  }
  if (c.isFirst) {
    const suffix = showTiming ? ` · ${c.timingLabel}` : "";
    return { headline: `First crack: ${c.title}`, meta: `by ${groupLabel}${suffix}` };
  }
  if (c.method === "hv") {
    return { headline: `${groupLabel} bypasses ${c.title}`, meta: "Hypervisor", accent: "var(--hv)" };
  }
  if (c.isRepack) {
    return { headline: `${groupLabel} repacked ${c.title}`, meta: "Repack" };
  }
  if (c.isAnonymous) {
    return { headline: `P2P release: ${c.title}`, meta: "Anonymous upload" };
  }
  if (c.metacritic != null && c.metacritic >= 75) {
    return { headline: `${groupLabel} cracked ${c.title}`, meta: `Metacritic ${c.metacritic}` };
  }
  if (c.reviewPct != null && c.reviewPct >= 85) {
    return { headline: `${groupLabel} cracked ${c.title}`, meta: `${c.reviewPct}% positive` };
  }
  return { headline: `${groupLabel} cracked ${c.title}`, meta: "" };
}

function TickerRow({ items, duplicate }: { items: TickerCandidate[]; duplicate?: boolean }) {
  return (
    <div className="live-ticker-row" aria-hidden={duplicate ? "true" : undefined}>
      {items.map((it, i) => {
        const { headline, meta, accent } = phraseFor(it);
        return (
          <Link
            key={`${it.id}-${i}`}
            to={`/game/${it.id}`}
            className="live-ticker-item"
            tabIndex={duplicate ? -1 : undefined}
          >
            <span className="live-ticker-headline" style={accent ? { color: accent } : undefined}>
              {headline}
            </span>
            {meta ? <span className="live-ticker-meta">{meta}</span> : null}
          </Link>
        );
      })}
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

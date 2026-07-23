import "./StarRating.css";

interface StarRatingProps {
  /* 1-5 in 0.5 steps, or null when there isn't enough real data yet
     (worker/backfill/groupReliability.ts's MIN_SAMPLE) -- rendered as an
     honest "Not yet rated" state, never a guessed/default star count. */
  stars: number | null;
  genuineCount: number;
  correctionCount: number;
  avgFixDays: number | null;
  className?: string;
}

/* Transparent, computed reliability score -- never an AI-guessed/vibes
   score presented as fact (see orlaz-group-reliability-star-rating.md).
   The title tooltip spells out exactly which real releases fed the
   number, so this reads as "here's the math," not an opaque badge. */
export default function StarRating({ stars, genuineCount, correctionCount, avgFixDays, className = "" }: StarRatingProps) {
  if (stars == null) {
    return (
      <span
        className={`star-rating star-rating--unrated ${className}`}
        title={
          genuineCount > 0
            ? `Only ${genuineCount} tracked genuine crack${genuineCount === 1 ? "" : "s"} so far -- not enough to compute a reliable score yet.`
            : "No genuine (non-repack) crack releases tracked yet for this group."
        }
      >
        Not yet rated
      </span>
    );
  }

  const clean = genuineCount - correctionCount;
  const tooltip =
    `${clean} of ${genuineCount} tracked crack${genuineCount === 1 ? "" : "s"} needed no correction release` +
    (correctionCount
      ? ` — ${correctionCount} needed a PROPER/CRACKFIX-style follow-up${avgFixDays != null ? `, avg ${avgFixDays}d to fix` : ""}.`
      : ".");

  return (
    <span className={`star-rating ${className}`} title={tooltip} aria-label={`${stars} out of 5 stars, ${tooltip}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fillPct = Math.max(0, Math.min(1, stars - i)) * 100;
        return (
          <span className="star-rating-star" key={i} aria-hidden="true">
            <span className="star-rating-star-empty">★</span>
            <span className="star-rating-star-fill" style={{ width: `${fillPct}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

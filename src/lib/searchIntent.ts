import type { StatusFilter } from "./filters";

export interface SearchIntent {
  status?: StatusFilter;
  year?: string;
  label: string;
}

const STATUS_KEYWORDS: Array<{ re: RegExp; status: StatusFilter; label: string }> = [
  { re: /\bhypervisor\b|\bhvb?\b/i, status: "hv", label: "Hypervisor" },
  { re: /\btraditional\b|\btrad\b/i, status: "trad", label: "Traditional" },
  { re: /\boutdated\b|\bdrifted\b|\bbehind\b/i, status: "outdated", label: "Outdated" },
  { re: /\buncracked\b|\bnot cracked\b/i, status: "uncracked", label: "Uncracked" },
  { re: /\bunreleased\b|\bupcoming\b/i, status: "unreleased", label: "Unreleased" },
];

const MONTH_TO_YEAR_HINT = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i;
const YEAR_RE = /\b(20[12]\d)\b/;

/* Deterministic (no AI) keyword -> real-filter mapper. Never guesses at
   game titles or generates anything -- it either recognizes an explicit
   status/year keyword combination the app already has a real filter for,
   or returns null and the search just falls back to a normal title search.
   "hypervisor games from june 2026" -> status=hv, year=2026 (the app has
   no month-level filter, so a month token is acknowledged in the label but
   only the year actually narrows results -- never silently pretends to
   filter by month when it can't). */
export function parseSearchIntent(query: string): SearchIntent | null {
  const q = query.trim();
  if (q.length < 4) return null;

  const statusMatch = STATUS_KEYWORDS.find((k) => k.re.test(q));
  const yearMatch = q.match(YEAR_RE);
  const hasMonth = MONTH_TO_YEAR_HINT.test(q);

  if (!statusMatch && !yearMatch) return null;
  // A bare year or bare status word alone is too likely to be part of a
  // real title (e.g. "2077", "Traditional Chinese Edition") -- only surface
  // this as a filter suggestion when there's a real game-status word AND
  // that word isn't the entire query.
  if (!statusMatch) return null;

  const labelParts = [statusMatch.label];
  if (yearMatch) labelParts.push(yearMatch[1]);
  else if (hasMonth) labelParts.push("(year not recognized, showing all years)");

  return {
    status: statusMatch.status,
    year: yearMatch ? yearMatch[1] : undefined,
    label: labelParts.join(" · "),
  };
}

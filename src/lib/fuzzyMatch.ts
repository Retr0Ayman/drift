// Optimal-string-alignment distance (Levenshtein + adjacent-transposition as
// a single edit), bounded by usage below to short scene/game title words --
// no need for a banded/optimized variant at this scale. Plain Levenshtein
// was tried first and rejected: it scores a single adjacent-letter swap
// ("eldne" for "elden") as distance 2, not 1, since it has to model a swap
// as two substitutions -- which pushed one of the single most common real
// typo patterns outside this function's own distance-1 threshold below.
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

/* Loose match used by the command palette's local (synchronous, no network)
   matching against game titles/group names/publisher names: a straight
   substring match first (cheapest, catches "witcher 3" -> "The Witcher 3:
   Wild Hunt" and partial group/publisher names like "denuvo" ->
   "DenuvOwO"), then falls back to a per-word edit-distance check so a
   handful of typo'd or dropped characters ("wicher 3") still resolves
   without needing the network-round-trip Groq assist (CommandPalette's own
   last-resort tier for genuinely wrong guesses this can't catch). Every
   query word must match some target word, either by prefix or by small
   edit distance -- short query words (<3 chars) only get the prefix check,
   since a 1-char edit distance on something that short matches almost
   anything and would make the "fuzzy" part noise rather than signal. */
export function fuzzyIncludes(target: string, query: string): boolean {
  const t = target.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (t.includes(q)) return true;

  const targetWords = t.split(/[^a-z0-9]+/).filter(Boolean);
  const queryWords = q.split(/[^a-z0-9]+/).filter(Boolean);
  if (!queryWords.length) return false;

  return queryWords.every((qw) => {
    if (qw.length < 3) return targetWords.some((tw) => tw.startsWith(qw));
    const maxDist = qw.length <= 5 ? 1 : 2;
    return targetWords.some((tw) => tw.startsWith(qw) || tw.includes(qw) || editDistance(tw, qw) <= maxDist);
  });
}

/* Cheap repetition check for AI-written paragraphs. A sentence is "repeated"
   when its content words overlap an earlier sentence by >= 60% (Jaccard on
   lowercased words minus stopwords) -- the "same list restated three ways"
   failure the publisher summaries kept showing. Pure string maths, no
   external call. */
const STOP = new Set(
  "a an the and or of in on at to for with by from as is are was were be been it its this that these those their there which who has have had also both across into over than then".split(" "),
);

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function overlap(a: Set<string>, b: Set<string>): number {
  // Overlap coefficient (shared / smaller set), so a short sentence that
  // merely restates part of a longer one counts as repeated.
  if (a.size < 3 || b.size < 3) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / Math.min(a.size, b.size);
}

export function hasRepetition(text: string, threshold = 0.65): boolean {
  const sets = splitSentences(text).map(words);
  for (let i = 1; i < sets.length; i++) for (let j = 0; j < i; j++) if (overlap(sets[i], sets[j]) >= threshold) return true;
  return false;
}

/* Last resort after a retry still repeats: keep each sentence only if it adds
   something. Dropping text can never introduce an ungrounded claim. */
export function dropRepeatedSentences(text: string, threshold = 0.65): string {
  const kept: string[] = [];
  const keptSets: Set<string>[] = [];
  for (const s of splitSentences(text)) {
    const w = words(s);
    if (keptSets.some((k) => overlap(w, k) >= threshold)) continue;
    kept.push(s);
    keptSets.push(w);
  }
  return kept.join(" ");
}

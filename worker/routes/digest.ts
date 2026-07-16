import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface DigestRequest {
  facts: Record<string, string | number | string[] | null | undefined>;
}

/* Same grounding discipline as summary.ts's group/publisher blurbs: the
   client computes every real number/name from actual tracked data
   (src/lib/digest.ts), this route only ever frames those exact facts into
   a short narrative -- the system prompt forbids inventing anything beyond
   what's handed to it, including guessing at facts that came through as
   null (a real "nothing notable" state, not a gap to fill in). */
const SYSTEM_PROMPT =
  "You write a short, factual 2-4 sentence digest paragraph (no headers, no bullet points) for the homepage " +
  "of a PC game crack/build-status tracking site, summarizing what's notable in the tracked catalogue right " +
  "now. You are STRICTLY grounded in the facts given: total tracked titles and releases, the most active " +
  "cracking group in the last 30 days and how many releases they've put out, the fastest crack in the last 30 " +
  "days (group, game, and days from release to crack -- negative means it leaked early), the longest-" +
  "outstanding uncracked title, and a handful of recently active titles. If a fact is null or missing, simply " +
  "don't mention that angle -- never invent a substitute. Never invent group history, member names, legality " +
  "commentary, or any fact not explicitly given. Write like a brief, sharp status update, not marketing copy.";

function buildFacts(facts: DigestRequest["facts"]): string {
  return Object.entries(facts)
    .map(([k, v]) => {
      if (v == null || v === "") return null;
      return `${k}: ${Array.isArray(v) ? v.join(", ") : v}`;
    })
    .filter(Boolean)
    .join("\n");
}

export const handleDigest: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: DigestRequest;
  try {
    body = (await request.json()) as DigestRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.facts) return json({ error: "facts required" }, 60, 400);

  const { text, error } = await callGroq(
    env,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildFacts(body.facts) },
    ],
    { maxTokens: 220 },
  );
  if (!text) return json({ error: error || "digest generation unavailable" }, 30, 502);
  // Cached a few hours, not a full day -- this is meant to feel like "what's
  // happening now," and the underlying facts (30-day windows, recent
  // titles) genuinely shift within a day as steady-state sync keeps adding
  // real data.
  return json({ digest: text }, 10800);
};

import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface OutlookRequest {
  title: string;
  status: "current" | "outdated" | "unverified" | "none";
  buildGap?: number;
  methods?: string[];
  isRepack?: boolean;
  crackTimingDays?: number | null;
  protection?: string[];
  releaseCount?: number;
}

/* Third AI surface, distinct purpose from fact.ts (bio trivia) and faq.ts
   (Q&A): a 1-2 sentence "practical bottom line" about THIS game's crack
   situation right now -- current vs. outdated (with the real build gap),
   repack vs. original crack, hypervisor vs. traditional tradeoffs, and how
   fast it was cracked relative to its own release date, when the client's
   derived facts (lib/format.ts's driftDelta/crackTimingDays) actually
   support one of those. Same grounding discipline as the other two: never
   invent a benchmark, a comparison to other titles, or a claim the given
   facts don't cover -- if nothing is cracked yet, say that plainly instead
   of reaching for something to fill the space. */
const SYSTEM_PROMPT =
  "You write a single short, practical blurb (1-2 sentences) for a crack/build-status tracking site's \"Crack " +
  "Outlook\" box -- the straight, practical bottom line on this specific game's crack situation right now. You " +
  "are STRICTLY grounded in the facts given: whether the tracked crack is current, outdated (and by how many " +
  "builds, if given), or unverified; whether it's a repack rather than an original crack; whether it's " +
  "hypervisor or traditional; and how many days after/before release it was first cracked, if that's given. " +
  "Never invent a comparison to other titles, an industry benchmark, a difficulty rating, or any number not " +
  "explicitly in the facts. If the game has no tracked crack at all, say so plainly and briefly rather than " +
  "inventing something to fill the space.\n\n" +
  "Lead with whatever fact matters most this time rather than always opening the same way: if the crack is " +
  "meaningfully outdated, the build gap is usually the most useful thing to say first; if it's a repack, " +
  "that distinction matters more than currency; if it was cracked unusually fast or leaked early, that's " +
  "often the most interesting fact available. Use the real numbers given (build gap, day count) rather than " +
  "vague words like \"recently\" or \"a while ago\" when a specific number is available. Plain text, no " +
  "markdown, no preamble, no quotes.";

function buildFacts(body: OutlookRequest): string {
  const lines = [
    `Title: ${body.title}`,
    `Tracked crack status: ${
      { current: "current, matches or beats the latest Steam build", outdated: "outdated, trails the latest Steam build", unverified: "unverified, no confirmed build number", none: "not cracked yet" }[
        body.status
      ]
    }`,
    body.status === "outdated" && body.buildGap ? `Build gap: crack trails the latest Steam build by ${body.buildGap} build(s)` : null,
    body.methods?.length ? `Crack method(s) tracked: ${body.methods.join(", ")}` : null,
    body.isRepack ? "The leading tracked release is a repack, not an original crack" : null,
    body.crackTimingDays != null
      ? body.crackTimingDays === 0
        ? "Cracked on release day"
        : body.crackTimingDays > 0
          ? `Cracked ${body.crackTimingDays} day(s) after release`
          : `Leaked ${Math.abs(body.crackTimingDays)} day(s) before release`
      : null,
    body.protection?.length ? `Protection: ${body.protection.join(", ")}` : null,
    body.releaseCount ? `Number of tracked crack releases: ${body.releaseCount}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export const handleOutlook: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: OutlookRequest;
  try {
    body = (await request.json()) as OutlookRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.title || !body.status) return json({ error: "title and status required" }, 60, 400);

  const { text, error } = await callGroq(
    env,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildFacts(body) },
    ],
    { maxTokens: 100 },
  );
  if (!text) return json({ error: error || "outlook generation unavailable" }, 30, 502);
  return json({ outlook: text }, 3600);
};

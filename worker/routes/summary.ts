import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface SummaryRequest {
  kind: "group" | "publisher";
  name: string;
  facts: Record<string, string | number | string[] | undefined>;
}

/* Same grounding discipline as FAQ generation: the system prompt forbids
   inventing anything beyond the facts handed to it, and this route builds
   the fact list itself from structured fields the client computed from real
   tracked data -- no raw freeform prompt ever reaches Groq from the client.
   Used for the short summary blurb on group and publisher pages.

   Same variety fix applied to fact.ts and faq.ts: these paragraphs used to
   open the same way for every group/publisher ("[Name] is a ... group/
   publisher that has ..."). Now steered to lead with a concrete number or
   trait instead of restating the name first, and to vary which fact leads. */
const SYSTEM_PROMPT: Record<SummaryRequest["kind"], string> = {
  /* A genuinely higher-risk AI surface than anything else this site generates
     (fact.ts/outlook.ts/faq.ts are about a game -- extensively, publicly
     documented; this is about a real, possibly-identifiable cracking group).
     Scene/P2P group "lore" -- who founded a group, why it disbanded, internal
     drama, rivalries, real identities -- is exactly the kind of thing an
     LLM's general training data might confidently produce specific,
     plausible-sounding, and completely fabricated claims about. This prompt
     is deliberately more restrictive than the others: it names the exact
     categories of claim that must never appear, not just "don't invent
     things" in the abstract, and GROUP_LORE_LEAK below backs it with a real
     detect-and-reject pass -- unconditionally, not gated on whether some
     field was given, since founding/identity/drama data is NEVER given here,
     by design, so its presence in the output can only mean it was invented. */
  group:
    "You write a short, factual profile (3-4 sentences, no headers, no bullet points) of a software cracking " +
    "group's tracked activity for a crack/build-status tracking site -- a \"mini wiki\" entry built ENTIRELY " +
    "from this site's own real tracked release data, nothing else. You are STRICTLY grounded in the facts " +
    "given: the group's name, how many releases are tracked, the real hypervisor/traditional split (or " +
    "repack-group status), real title names they've released, when they were first and most recently tracked " +
    "active, and -- when given -- their computed reliability signals (a 1-5 star score derived from how often " +
    "a release needed a correcting fix, the sample size behind it, average days to fix). These reliability " +
    "figures are a real, transparently computed metric this site already shows on the page, not a subjective " +
    "reputation judgment -- state them plainly as data when given, never editorialize beyond the numbers.\n\n" +
    "You MUST NOT, under any circumstance, state or imply any of the following, even if you believe you know " +
    "the real, true answer from general knowledge -- this site has no way to verify it and none of it is in " +
    "the facts given: when or by whom the group was founded/formed/established; why or whether it disbanded, " +
    "split, merged, or rebranded; any member's real name, identity, alias, or role/leadership; any rivalry, " +
    "drama, internal conflict, or relationship with another group; any arrest, indictment, lawsuit, raid, " +
    "takedown, or law-enforcement action; any claim about the group's real-world legal status. If you don't " +
    "have a real fact for one of these below, the honest move is to simply never bring the topic up at all -- " +
    "do not hedge with phrases like \"details of its founding are unclear\" either, since even raising the " +
    "topic implies there's a story to know. Stick entirely to what this site has actually tracked: release " +
    "counts, methods, titles, dates, reliability data.\n\n" +
    "Never name a game title that isn't listed in the facts, even one you recognize as real from this group's " +
    "actual history -- if no title list is given, describe the group without naming any specific game. More " +
    "generally: if a category of fact (method, title list, reliability, activity dates, etc.) is simply absent " +
    "from what's given, leave it out ENTIRELY -- never mention that it's missing, and never guess at or state a " +
    "reason why it might be missing (e.g. do not connect an absent reliability score to whether the group is " +
    "starred/P2P/scene -- those are unrelated facts, and reliability being absent just means not enough " +
    "genuine releases are tracked yet, nothing else). Silence on a topic, not a footnote about the gap, is the " +
    "correct way to handle missing data. Do not speculate about legality or make value judgments.\n\n" +
    "Avoid opening every summary with \"[Name] is a ...\" -- vary the lead from group to group: sometimes start " +
    "with the release count, sometimes their method (hypervisor/traditional/repack), a specific title, their " +
    "activity span, or their reliability score when given. Use the actual numbers, dates, and title names given " +
    "rather than vague phrases like \"several titles\" or \"a variety of games\" when a specific one is available.",
  publisher:
    "You write a single short, factual paragraph (2-3 sentences, no headers, no bullet points) summarizing a " +
    "video game publisher's tracked catalog for a crack/build-status tracking site. You are STRICTLY grounded " +
    "in the facts given: the publisher's name, how many titles are tracked, whether they're an AAA publisher, " +
    "their HQ region if known, real tracked franchise names when given, real tracked title names, and -- when " +
    "given -- the real most-common protection scheme across their own tracked titles (a genuine computed stat " +
    "this site tracks, not a guess). Never invent company history, founding dates, financials, or any fact not " +
    "explicitly given. Never name a game title or franchise that isn't listed in the facts, even one you " +
    "recognize as real from this publisher's actual catalog -- if no title/franchise list is given, describe " +
    "the publisher without naming any specific one. More generally: if a category of fact (AAA status, HQ " +
    "region, franchise list, title list, protection, etc.) is simply absent from what's given, leave it out of " +
    "the summary rather than filling the gap with anything you might otherwise know about this real publisher.\n\n" +
    "The Franchises and Tracked titles facts, when both given, never overlap -- Franchises are named franchise " +
    "groups, Tracked titles are titles NOT already covered by one of those franchises. Do not treat them as two " +
    "versions of the same list: mention each once, for what it actually is, rather than restating the same " +
    "handful of titles under both a franchise name and an individual title list. Do not pad the paragraph by " +
    "listing the same information three different ways (e.g. as \"notable franchises\", then again as " +
    "\"tracked titles\", then again as \"also encompasses\") -- say each real fact once.\n\n" +
    "When an AAA publisher fact is given, phrase it naturally within a sentence (e.g. \"a major AAA publisher\" " +
    "or \"known for AAA releases\") -- never state it as a raw label like \"marked as AAA tier\" or \"tagged AAA\", " +
    "since that reads like a database field name, not a sentence. The same applies to every other fact: write " +
    "natural prose from the data, never echo a fact's label verbatim.\n\n" +
    "When a Franchises fact is given, naming one or two of the actual series tracked is usually sharper and " +
    "more specific than a bare title count on its own -- prefer that angle when it's available rather than " +
    "defaulting to just the count. A given Protection fact is a genuinely distinctive, site-specific angle -- " +
    "prefer leading with it or the franchise names over generic filler when either is available.\n\n" +
    "Avoid opening every summary with \"[Name] is a ...\" -- vary the lead from publisher to publisher: " +
    "sometimes start with the tracked title count, sometimes with the HQ region, sometimes with a specific " +
    "franchise or title name, sometimes with the protection stat. Use the actual numbers, franchise names, and " +
    "title names given rather than vague phrases like \"several titles\" or \"a range of games\" when a " +
    "specific count or name is available.",
};

function buildFacts(body: SummaryRequest): string {
  const lines = Object.entries(body.facts).map(([k, v]) => {
    if (v == null || v === "") return null;
    return `${k}: ${Array.isArray(v) ? v.join(", ") : v}`;
  });
  return [`Name: ${body.name}`, ...lines].filter(Boolean).join("\n");
}

/* Group-only, and deliberately UNCONDITIONAL (unlike fact.ts's
   FRANCHISE_LEAK, which only fires when no franchise field was given) --
   founding/identity/drama/legal-status data is NEVER included in what this
   route feeds the model for a group (buildFacts only ever has release
   counts/methods/titles/dates/reliability numbers to draw from), so any of
   this vocabulary appearing in the output can only mean it was invented,
   regardless of what else was or wasn't given. Broad on purpose -- this is
   pattern-matching against an open-ended category of possible fabrication
   (real/possibly-identifiable people and groups), not a single well-defined
   claim like FRANCHISE_LEAK's "was a series name invented." That means it
   cannot promise the same completeness FRANCHISE_LEAK has for its narrower
   question: a fabrication phrased in vocabulary this list doesn't happen to
   catch would still get through. The prompt's own explicit, exhaustive
   "MUST NOT" list carries real weight here precisely because this backstop
   can't be assumed airtight the way the DRM/franchise ones are for their
   narrower questions. */
const GROUP_LORE_LEAK =
  /\b(founded|founder|co-founder|formed in|formed by|established in|disband(ed)?|rival(ry|s)?|led by|leader(ship)?|members? (include|are|is|consist)|real (name|identity)|identity of|known as|a\.?k\.?a\.?|alias(es)?|arrest(ed)?|indict(ed|ment)?|prosecut(ed|ion)|lawsuit|law\s?enforcement|\bFBI\b|\bDOJ\b|\bICE\b|raided?|takedown|shut\s?down by|court(room)?|sentenced|convicted|splinter(ed)?|split from|merged with|rebrand(ed)?|renamed from|former member|ex-member|internal (drama|conflict)|feud(ed)?)\b/i;

function violatesGrounding(body: SummaryRequest, text: string): boolean {
  return body.kind === "group" && GROUP_LORE_LEAK.test(text);
}

export const handleSummary: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: SummaryRequest;
  try {
    body = (await request.json()) as SummaryRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.name || (body.kind !== "group" && body.kind !== "publisher")) {
    return json({ error: "name and kind ('group'|'publisher') required" }, 60, 400);
  }

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT[body.kind] },
    { role: "user" as const, content: buildFacts(body) },
  ];

  let { text, error } = await callGroq(env, messages, { maxTokens: 220 });
  if (text && violatesGrounding(body, text)) {
    // One retry with the violating draft shown back and a blunt correction
    // -- cheaper and more honest than serving a fabricated lore claim about
    // a real group.
    ({ text, error } = await callGroq(
      env,
      [
        ...messages,
        {
          role: "user" as const,
          content: `You wrote: "${text}"\nThat states or implies something about founding, identity, disbanding, drama, or legal history that was never given -- this site has no real data for any of that. Rewrite it about the same group using ONLY the release/method/date/reliability facts already given, without touching that topic at all.`,
        },
      ],
      { maxTokens: 220 },
    ));
    if (text && violatesGrounding(body, text)) {
      return json({ error: "summary generation could not stay grounded for this group" }, 30, 502);
    }
  }
  if (!text) return json({ error: error || "summary generation unavailable" }, 30, 502);
  return json({ summary: text }, 3600);
};

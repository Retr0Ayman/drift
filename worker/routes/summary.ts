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
  group:
    "You write a single short, factual paragraph (2-3 sentences, no headers, no bullet points) summarizing a " +
    "software cracking group's tracked activity for a crack/build-status tracking site. You are STRICTLY " +
    "grounded in the facts given: the group's name, how many releases are tracked, whether they lean " +
    "hypervisor or traditional cracking (or are a repack group), and which real titles they've released. " +
    "Never invent history, reputation, founding dates, member names, or anything not explicitly given. Do not " +
    "speculate about legality or make value judgments.\n\n" +
    "Avoid opening every summary with \"[Name] is a ...\" -- vary the lead from group to group: sometimes start " +
    "with the release count, sometimes with their method (hypervisor/traditional/repack), sometimes with a " +
    "specific title they've released. Use the actual numbers and title names given rather than vague phrases " +
    "like \"several titles\" or \"a variety of games\" when a specific count or name is available.",
  publisher:
    "You write a single short, factual paragraph (2-3 sentences, no headers, no bullet points) summarizing a " +
    "video game publisher's tracked catalog for a crack/build-status tracking site. You are STRICTLY grounded " +
    "in the facts given: the publisher's name, how many titles are tracked, whether they're tagged AAA, their " +
    "HQ region if known, and real tracked title names. Never invent company history, founding dates, " +
    "financials, or any fact not explicitly given.\n\n" +
    "Avoid opening every summary with \"[Name] is a ...\" -- vary the lead from publisher to publisher: " +
    "sometimes start with the tracked title count, sometimes with the HQ region, sometimes with a specific " +
    "title name. Use the actual numbers and title names given rather than vague phrases like \"several titles\" " +
    "or \"a range of games\" when a specific count or name is available.",
};

function buildFacts(body: SummaryRequest): string {
  const lines = Object.entries(body.facts).map(([k, v]) => {
    if (v == null || v === "") return null;
    return `${k}: ${Array.isArray(v) ? v.join(", ") : v}`;
  });
  return [`Name: ${body.name}`, ...lines].filter(Boolean).join("\n");
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

  const { text, error } = await callGroq(
    env,
    [
      { role: "system", content: SYSTEM_PROMPT[body.kind] },
      { role: "user", content: buildFacts(body) },
    ],
    { maxTokens: 180 },
  );
  if (!text) return json({ error: error || "summary generation unavailable" }, 30, 502);
  return json({ summary: text }, 3600);
};

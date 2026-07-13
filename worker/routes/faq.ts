import type { Handler } from "../shared/types";
import { json } from "../shared/http";

interface FaqRequest {
  title: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  released?: string;
  protection?: string[];
  releases?: Array<{ method: string; group: string; status: string }>;
}

/* Strictly grounded: the system prompt forbids inventing anything beyond
   the facts handed to it, and this route builds the fact list itself from
   structured fields -- the client can never pass a raw freeform prompt, both
   to keep the grounding consistent and so this can't be used as an open
   proxy to pollinations.ai for unrelated content. text.pollinations.ai is a
   genuinely public, keyless, informal community service with no uptime/SLA
   guarantee -- errors are relayed as a real "unavailable" response, not
   masked or silently retried into something that looks like success. */
const SYSTEM_PROMPT =
  "You write short, factual FAQ answers about video games for a crack/build-status tracking site. " +
  "You are STRICTLY grounded in the facts provided in the user message -- title, developer, publisher, " +
  "genres, release date, DRM/protection type, and crack status/method. Never invent plot details, lore, " +
  "sales figures, review scores, release dates, or any fact not explicitly given. If asked something the " +
  "given facts don't cover, say the information isn't available rather than guessing. Write 4-6 short Q&A " +
  "pairs as plain text (no markdown headers), each formatted as \"Q: ...\" then \"A: ...\" on the next line, " +
  "each answer 1-2 sentences.";

function buildFacts(body: FaqRequest): string {
  const lines = [
    `Title: ${body.title}`,
    body.developer ? `Developer: ${body.developer}` : null,
    body.publisher ? `Publisher: ${body.publisher}` : null,
    body.genres?.length ? `Genres: ${body.genres.join(", ")}` : null,
    body.released ? `Released: ${body.released}` : null,
    body.protection?.length ? `Protection: ${body.protection.join(", ")}` : null,
    body.releases?.length
      ? `Crack status: ${body.releases.map((r) => `${r.method} crack by ${r.group} (${r.status})`).join("; ")}`
      : "Crack status: not yet cracked as of this data",
  ];
  return lines.filter(Boolean).join("\n");
}

export const handleFaq: Handler = async ({ request }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: FaqRequest;
  try {
    body = (await request.json()) as FaqRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.title) return json({ error: "title required" }, 60, 400);

  try {
    const r = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildFacts(body) },
        ],
        model: "openai",
      }),
    });
    if (!r.ok) {
      return json({ error: `pollinations.ai returned ${r.status}` }, 30, 502);
    }
    const text = (await r.text()).trim();
    if (!text) {
      return json({ error: "empty response from pollinations.ai" }, 30, 502);
    }
    return json({ faq: text }, 3600);
  } catch (e) {
    return json({ error: `pollinations.ai request failed: ${e instanceof Error ? e.message : String(e)}` }, 30, 502);
  }
};

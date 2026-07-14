import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface AssistRequest {
  query: string;
}

/* Query-correction only, never a data source: this route's ONLY job is to
   guess what real game title a partial/misspelled search query probably
   means, so the client can re-run the REAL search with that guess. The
   guess itself is never shown to the user or trusted as fact -- the client
   always re-validates it against the actual xREL/Steam search before
   displaying anything, exactly the same "never fabricate, always verify"
   rule as everywhere else in this project. This route can be confidently
   wrong (typos are genuinely ambiguous) without that ever becoming a false
   claim on the page, because a wrong guess just produces zero results on
   re-search and gets silently discarded. */
const SYSTEM_PROMPT =
  "You help correct search queries on a PC game crack/build-status tracking site. Given a partial or " +
  "possibly misspelled game title, respond with ONLY the single most likely full, correctly-spelled real " +
  "video game title -- no explanation, no punctuation around it, no quotes. If you cannot confidently guess " +
  "a specific real game, respond with exactly: UNKNOWN";

export const handleSearchAssist: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: AssistRequest;
  try {
    body = (await request.json()) as AssistRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  const query = (body.query || "").trim();
  if (query.length < 3) return json({ error: "query too short" }, 60, 400);

  const { text, error } = await callGroq(
    env,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
    { maxTokens: 40, temperature: 0.2 },
  );
  if (!text) return json({ error: error || "search assist unavailable" }, 30, 502);

  const cleaned = text.trim().replace(/^["']|["']$/g, "");
  const suggestion = cleaned.toUpperCase() === "UNKNOWN" ? null : cleaned;
  return json({ suggestion }, 60);
};

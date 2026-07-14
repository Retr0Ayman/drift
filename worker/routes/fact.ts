import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface FactRequest {
  title: string;
  developer?: string;
  genres?: string[];
  released?: string;
  franchise?: string | null;
}

/* Same grounding discipline as summary.ts/faq.ts: strictly limited to the
   facts handed in, no outside trivia/lore/history the model might "know"
   from training. Used for GameDetail's "Did you know" box. */
const SYSTEM_PROMPT =
  "You write a single short, well-phrased sentence about a video game for a crack/build-status tracking " +
  "site's \"Did you know\" box. You are STRICTLY grounded in the facts given -- title, developer, genres, " +
  "release date, and franchise if given. Combine them into one interesting observation (e.g. how the genres " +
  "combine, its place in a franchise, how recent the release is). Never invent plot details, lore, sales " +
  "figures, review scores, awards, or any fact not explicitly given. One sentence only, no preamble, no quotes.";

function buildFacts(body: FactRequest): string {
  const lines = [
    `Title: ${body.title}`,
    body.developer ? `Developer: ${body.developer}` : null,
    body.genres?.length ? `Genres: ${body.genres.join(", ")}` : null,
    body.released ? `Released: ${body.released}` : null,
    body.franchise ? `Franchise: ${body.franchise}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

export const handleFact: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: FactRequest;
  try {
    body = (await request.json()) as FactRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.title) return json({ error: "title required" }, 60, 400);

  const { text, error } = await callGroq(
    env,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildFacts(body) },
    ],
    { maxTokens: 80 },
  );
  if (!text) return json({ error: error || "fact generation unavailable" }, 30, 502);
  return json({ fact: text }, 3600);
};

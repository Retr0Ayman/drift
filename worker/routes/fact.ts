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
   from training. Used for GameDetail's "Did you know" box.

   FIX (confirmed live): the previous version produced the same two
   sentence shapes for every one of 900+ games -- "X combines Y and Z..."
   or "X is part of the long-running Y franchise..." -- because it only
   offered one path (combine the fields) with no instruction to vary
   structure. Now given a menu of angles and told to rotate which one
   leads and to open with something concrete instead of the game title
   restating itself. */
const SYSTEM_PROMPT =
  "You write a single short, well-phrased sentence about a video game for a crack/build-status tracking " +
  "site's \"Did you know\" box. You are STRICTLY grounded in the facts given -- title, developer, genres, " +
  "release date, and franchise if given -- never invent plot details, lore, sales figures, review scores, " +
  "awards, or any fact not explicitly given.\n\n" +
  "Pick ONE of these angles based on which the given facts actually support best, and vary your choice from " +
  "game to game rather than defaulting to the same one every time:\n" +
  "- Franchise legacy: where this entry sits in a long-running series, if a franchise is given.\n" +
  "- Release recency: how old or new the game is relative to today, or what year/era it landed in.\n" +
  "- Genre combination: a specific, non-obvious way its genres intersect.\n" +
  "- Developer pedigree: what the given developer name signals, if it's a notable one.\n\n" +
  "Do NOT start the sentence with the game's title followed by a generic template like \"X combines Y and " +
  "Z\" or \"X is part of the Y franchise\" -- these exact shapes are overused. Instead, lead with something " +
  "concrete more often than not: a date, a year, a number, a genre name, or a developer/franchise name, with " +
  "the game's title appearing naturally later in the sentence rather than as the opening subject every time. " +
  "One sentence only, no preamble, no quotes.";

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

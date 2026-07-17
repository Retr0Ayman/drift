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
   restating itself.

   FIX #2 (confirmed live): banning those two exact shapes didn't fix the
   underlying problem, it just relocated it -- every sample tested then
   opened with "In 2025, ..."; banning that too just produced "With its
   blend of..."/"With a legacy spanning decades..." for every single
   sample instead. At temperature 0.4 the model collapses onto whatever
   single opener the prompt hasn't explicitly forbidden yet, and along the
   way started asserting things like "over two decades" of franchise
   history that were never in the facts given (only the franchise NAME was
   given, not its start date or duration -- an invented fact wearing the
   franchise-legacy angle as cover). Fixed by naming a longer list of
   banned openers instead of playing whack-a-mole one at a time, explicitly
   forbidding invented duration/legacy claims, and raising temperature so
   the model isn't forced into its single lowest-entropy phrasing. */
const SYSTEM_PROMPT =
  "You write a single short, well-phrased sentence about a video game for a crack/build-status tracking " +
  "site's \"Did you know\" box. You are STRICTLY grounded in the facts given -- title, developer, genres, " +
  "release date, franchise if given, and today's date -- never invent plot details, lore, sales figures, review " +
  "scores, awards, or any fact not explicitly given. This includes franchise duration/legacy claims: you are " +
  "told the franchise NAME only, never its start date, entry count, or history. Even if you happen to know " +
  "from training that a named franchise is old or well-known, treat that as information you do not have here " +
  "and must not use -- do not use ANY of these words or their synonyms about the franchise: \"decades\", " +
  "\"legacy\", \"long-running\", \"iconic\", \"beloved\", \"storied\", \"venerable\", \"classic\", " +
  "\"established\", \"years\" (as in a duration). You may say it's part of that named series, nothing more.\n\n" +
  "Pick ONE of these angles based on which the given facts actually support best, and vary your choice from " +
  "game to game rather than defaulting to the same one every time:\n" +
  "- Franchise tie-in: name the series this entry belongs to, without any claim about its age or history. Only " +
  "use this angle when a Franchise field is literally given below -- never infer or guess a series from the " +
  "title itself (a word like \"Two\", \"II\", or a sequel-sounding name does NOT mean a franchise was given). " +
  "When no Franchise field is given, this game is standalone as far as you know: do not use the words " +
  "\"series\", \"franchise\", \"installment\", \"sequel\", or \"saga\" anywhere in the sentence.\n" +
  "- Release recency: how old or new the release date is compared to today's date, stated plainly (e.g. months " +
  "or years ago), not with an invented sense of scale like \"just landed\" unless the gap is genuinely small.\n" +
  "- Genre combination: a specific, non-obvious way its genres intersect.\n" +
  "- Developer credit: name the developer plainly -- do not editorialize about their reputation or pedigree, " +
  "that is never something the given facts actually support.\n\n" +
  "Never open with the game's title as the subject, and never default to any single recurring opener across " +
  "different games -- specifically, do NOT let any of these become your go-to shape: \"X combines Y and Z\", " +
  "\"X is part of the Y franchise\", \"In [year], ...\", \"With its/a ...\", \"Since its release, ...\". Rotate " +
  "the actual opening word across games: sometimes a bare year or number, sometimes the developer or franchise " +
  "name as a plain subject, sometimes a genre word, sometimes a short subordinate clause -- the point is that " +
  "reading five of these in a row should not reveal a repeated shape. One sentence only, no preamble, no quotes.";

function buildFacts(body: FactRequest): string {
  const lines = [
    `Title: ${body.title}`,
    body.developer ? `Developer: ${body.developer}` : null,
    body.genres?.length ? `Genres: ${body.genres.join(", ")}` : null,
    body.released ? `Released: ${body.released}` : null,
    body.franchise ? `Franchise: ${body.franchise}` : null,
    `Today's date: ${new Date().toISOString().slice(0, 10)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/* Confirmed live: even with an explicit "do not use the word 'series'"
   instruction repeated twice in the system prompt, llama-3.3-70b still
   invented a franchise for a standalone game (no Franchise field given)
   in 3 of 5 samples tested for "It Takes Two" -- a real grounding
   violation, not just a phrasing quirk. Prompt-only mitigation had already
   been tightened twice and plateaued, so this is a hard backstop: when no
   franchise was given, any of these words in the output means the model
   fabricated one anyway, and that response must never reach the page. */
const FRANCHISE_LEAK = /\b(franchise|series|installment|instalment|sequel|saga)\b/i;

function violatesGrounding(body: FactRequest, text: string): boolean {
  return !body.franchise && FRANCHISE_LEAK.test(text);
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

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildFacts(body) },
  ];

  let { text, error } = await callGroq(env, messages, { maxTokens: 80, temperature: 0.75 });
  if (text && violatesGrounding(body, text)) {
    // One retry with the violating draft shown back and a blunt correction
    // -- cheaper and more honest than serving a fabricated franchise claim.
    ({ text, error } = await callGroq(
      env,
      [
        ...messages,
        { role: "user" as const, content: `You wrote: "${text}"\nThat invents a franchise/series that was never given. Rewrite it about the same game without naming or implying any series at all.` },
      ],
      { maxTokens: 80, temperature: 0.5 },
    ));
    if (text && violatesGrounding(body, text)) {
      return json({ error: "fact generation could not stay grounded for this title" }, 30, 502);
    }
  }
  if (!text) return json({ error: error || "fact generation unavailable" }, 30, 502);
  return json({ fact: text }, 3600);
};

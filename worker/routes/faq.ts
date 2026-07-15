import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface FaqRequest {
  title: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  released?: string;
  protection?: string[];
  releases?: Array<{ method: string; group: string; status: string; isRepack?: boolean; updateCount?: number }>;
}

/* Strictly grounded: the system prompt forbids inventing anything beyond
   the facts handed to it, and this route builds the fact list itself from
   structured fields -- the client can never pass a raw freeform prompt, both
   to keep the grounding consistent and so this can't be used as an open
   proxy to Groq for unrelated content.

   Switched from pollinations.ai to Groq: pollinations hit real 429/502s
   twice during testing (a free, keyless, informal community service with no
   uptime/SLA guarantee). Groq has a real free tier and is meaningfully more
   reliable -- but the honesty rule doesn't change: a missing key or a failed
   call surfaces as a real "unavailable" response, never masked or silently
   retried into something that looks like success. */
/* FIX (confirmed live): the previous version listed developer/publisher/
   genres/released/protection as facts to draw questions from, and that's
   exactly what it did -- every generated FAQ was "who made this / who
   published it / what genre / when did it release / what DRM," all of
   which are already sitting in GameDetail.tsx's header two seconds above
   this section. Not wrong, just redundant padding. Those fields are still
   sent below (a title alone isn't always enough context, and a game with
   no crack data yet still needs *something* to ground a real answer in),
   but the prompt now explicitly forbids making them the subject of a
   question, and is steered toward what this specific site's data actually
   adds: how many groups/methods have cracked it, whether the tracked
   crack is still current, and repack implications. */
const SYSTEM_PROMPT =
  "You write short, factual FAQ answers for a crack/build-status tracking site. The reader has already seen " +
  "this game's developer, publisher, genre, release date, and DRM/protection type in the page header directly " +
  "above this FAQ -- NEVER write a question whose answer just restates one of those fields (no \"who developed " +
  "this\", \"who published this\", \"what genre is this\", \"when was this released\", \"what DRM/protection " +
  "does this use\"). That information is background context only, not a topic. Instead focus on what this " +
  "site's data actually adds: how many groups or crack methods have released a crack for this game and, if " +
  "more than one exists, the practical difference between them (e.g. hypervisor vs. traditional reliability); " +
  "whether the tracked crack has kept up with the game's own latest update, using the given crack status " +
  "(current/outdated/unverified); and whether any tracked release is a repack rather than an original crack, " +
  "and what that means for the user, only if repack data is given. If the given facts don't support one of " +
  "those angles (e.g. nothing cracked yet, or only one release with no repack/method contrast to make), ask " +
  "about whatever real crack-status information IS available instead of falling back to a bio-fact question -- " +
  "you are STRICTLY grounded in the facts provided in the user message and must never invent plot details, " +
  "lore, sales figures, review scores, or any fact not explicitly given; if the facts don't cover something, " +
  "say so rather than guessing. Write 4-6 short Q&A pairs as plain text (no markdown headers), each formatted " +
  "as \"Q: ...\" then \"A: ...\" on the next line, each answer 1-2 sentences.";

function buildFacts(body: FaqRequest): string {
  const lines = [
    `Title: ${body.title}`,
    body.developer ? `Developer: ${body.developer}` : null,
    body.publisher ? `Publisher: ${body.publisher}` : null,
    body.genres?.length ? `Genres: ${body.genres.join(", ")}` : null,
    body.released ? `Released: ${body.released}` : null,
    body.protection?.length ? `Protection: ${body.protection.join(", ")}` : null,
  ];

  if (body.releases?.length) {
    const methods = [...new Set(body.releases.map((r) => r.method))];
    lines.push(`Number of tracked crack releases: ${body.releases.length}`);
    lines.push(`Crack method(s) tracked: ${methods.join(", ")}`);
    lines.push(
      "Crack releases: " +
        body.releases
          .map((r) => {
            const bits = [`${r.method} crack by ${r.group}`, `status: ${r.status}`];
            if (r.isRepack) bits.push("this is a repack, not an original crack");
            if (r.updateCount && r.updateCount > 1) bits.push(`updated ${r.updateCount} times so far`);
            return bits.join(", ");
          })
          .join("; "),
    );
  } else {
    lines.push("Crack status: not yet cracked as of this data");
  }

  return lines.filter(Boolean).join("\n");
}

export const handleFaq: Handler = async ({ request, env }) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 60, 405);

  let body: FaqRequest;
  try {
    body = (await request.json()) as FaqRequest;
  } catch {
    return json({ error: "invalid JSON body" }, 60, 400);
  }
  if (!body.title) return json({ error: "title required" }, 60, 400);

  const { text, error } = await callGroq(env, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildFacts(body) },
  ]);
  if (!text) return json({ error: error || "FAQ generation unavailable" }, 30, 502);
  return json({ faq: text }, 3600);
};

import type { Handler } from "../shared/types";
import { json } from "../shared/http";
import { callGroq } from "../shared/groq";

interface OutlookRequest {
  title: string;
  status: "current" | "outdated" | "unverified" | "none";
  outdatedDays?: number;
  methods?: string[];
  isRepack?: boolean;
  crackTimingDays?: number | null;
  protection?: string[];
  /* DRM this game genuinely used to have, per PCGamingWiki's own
     Removed_DRM field (worker/backfill/pcgamingwiki.ts's classifyDrm),
     that's since been removed -- e.g. Denuvo dropped post-launch. Real
     historical fact, not current-state: lets the outlook honestly explain
     a hypervisor crack (a technique that exists specifically to bypass
     Denuvo Anti-Tamper) for a game whose current `protection` no longer
     shows it, instead of the two facts silently contradicting each other. */
  formerProtection?: string[];
  releaseCount?: number;
}

/* Third AI surface, distinct purpose from fact.ts (bio trivia) and faq.ts
   (Q&A): a 1-2 sentence "practical bottom line" about THIS game's crack
   situation right now -- current vs. outdated (with how long it's been
   outdated, in real days), repack vs. original crack, hypervisor vs.
   traditional tradeoffs, and how fast it was cracked relative to its own
   release date, when the client's derived facts (lib/format.ts's
   outdatedDays/crackTimingDays) actually support one of those. Same
   grounding discipline as the other two: never invent a benchmark, a
   comparison to other titles, or a claim the given facts don't cover -- if
   nothing is cracked yet, say that plainly instead of reaching for
   something to fill the space.

   BUG FIX (confirmed live, 007 First Light): this used to take a `buildGap`
   fact -- the client's old driftDelta(), a raw `currentBuild - crackBuild`
   subtraction of Steam BuildIDs -- and have the model report it verbatim as
   "trailing the latest Steam build by N builds." Steam's BuildID is one
   global, monotonically-increasing counter shared across Valve's ENTIRE
   platform (every app, every depot, every publisher's update bumps the same
   sequence), so that subtraction is NOT a per-game update count; it mostly
   reflects elapsed time and unrelated platform-wide activity -- a game
   untouched for a year can show a meaningless six-digit "builds behind"
   number. outdatedDays (client's lib/format.ts, driven by the real
   currentBuildUpdatedAt Steam timestamp) replaces it with an honest,
   time-based number instead. */
const SYSTEM_PROMPT =
  "You write a single short, practical blurb (1-2 sentences) for a crack/build-status tracking site's \"Crack " +
  "Outlook\" box -- the straight, practical bottom line on this specific game's crack situation right now. You " +
  "are STRICTLY grounded in the facts given: whether the tracked crack is current, outdated (and for how many " +
  "days, if given), or unverified; whether it's a repack rather than an original crack; whether it's " +
  "hypervisor or traditional; and how many days after/before release it was first cracked, if that's given. " +
  "Never invent a comparison to other titles, an industry benchmark, a difficulty rating, or any number not " +
  "explicitly in the facts -- in particular, never invent or imply a count of how many times Steam has updated " +
  "this specific game; that count is not given to you and is not derivable from anything you do have. If the " +
  "game has no tracked crack at all, say so plainly and briefly rather than inventing something to fill the space.\n\n" +
  "Lead with whatever fact matters most this time rather than always opening the same way: if the crack is " +
  "meaningfully outdated, how long it's been outdated is usually the most useful thing to say first; if it's a " +
  "repack, that distinction matters more than currency; if it was cracked unusually fast or leaked early, that's " +
  "often the most interesting fact available; if a Formerly-used-protection fact is given AND a hypervisor method " +
  "is tracked, that's usually the single most interesting thing about this game -- say plainly that the " +
  "hypervisor crack originally bypassed that protection and the publisher has since removed it, don't bury or " +
  "skip that story in favor of a blander opening. Use the real numbers given (days outdated, crack timing) " +
  "rather than vague words like \"recently\" or \"a while ago\" when a specific number is available.\n\n" +
  "If the tracked crack is outdated AND its method is hypervisor, remember that hypervisor bypasses are tied to " +
  "one specific game build by nature of the method -- an anti-tamper update on literally the next patch " +
  "routinely breaks them, so being outdated is normal, expected behavior for that method, not a sign of a " +
  "neglected or lower-quality release. Frame it that way (e.g. \"typical for hypervisor cracks\") rather than " +
  "as a red flag, unless the facts given show it's been outdated for an unusually long time.\n\n" +
  "When neither a Protection fact nor a Formerly-used-protection fact is given below, you were not told what " +
  "DRM or anti-cheat (if any) this game uses or ever used -- do not name or guess one (e.g. Denuvo, EAC/Easy " +
  "Anti-Cheat, BattlEye, VMProtect, Arxan, SecuROM, StarForce, or any other specific product), even if a game " +
  "like this typically has one. You may still freely describe the crack method (hypervisor vs. traditional) " +
  "when that's given, since that's real data -- just never name what protection it bypasses unless one of " +
  "those two facts is explicitly given.\n\n" +
  "When a Formerly-used-protection fact IS given, you may name it -- but strictly as something this game USED " +
  "TO have and its publisher has since removed, never as active protection today (e.g. \"originally bypassed " +
  "Denuvo Anti-Tamper via a hypervisor crack; Denuvo has since been removed\" is grounded; \"this crack bypasses " +
  "Denuvo\" in the present tense is not, when Denuvo is only in the former-protection fact and not in Protection " +
  "itself). If a Protection fact is ALSO given, that's what's true right now -- the former one only explains " +
  "history, it never overrides or contradicts the current one. Plain text, no markdown, no preamble, no quotes.";

/* Confirmed live on Ground Branch: page's own Protection field correctly showed
   "--" (game.tags empty, so buildFacts below omits the Protection line entirely),
   but the model still wrote that the crack bypasses "Denuvo protection" -- the
   same fabrication class fact.ts hit with invented franchises, just defaulting to
   Denuvo as its go-to guess instead. Prompt-only wasn't enough for fact.ts either,
   so this is the same hard backstop: when no protection was given, any real DRM/
   anti-cheat product name in the output means it was invented, not reported. */
const DRM_LEAK =
  /\b(denuvo|easy\s*anti-?cheat|\bEAC\b|battle\s*eye|vmprotect|arxan|securom|starforce|themida|enigma\s*protector|safedisc|tages|codemeter|cmactlicense|wibu(-|\s)?systems|pace\s*anti-?piracy|cactus\s*(protection\s*system)?|games?\s*for\s*windows\s*live|\bGFWL\b|ubisoft\s*connect|uplay)\b/i;

function violatesGrounding(body: OutlookRequest, text: string): boolean {
  return !body.protection?.length && !body.formerProtection?.length && DRM_LEAK.test(text);
}

function buildFacts(body: OutlookRequest): string {
  const lines = [
    `Title: ${body.title}`,
    `Tracked crack status: ${
      { current: "current, matches or beats the latest Steam build", outdated: "outdated, trails the latest Steam build", unverified: "unverified, no confirmed build number", none: "not cracked yet" }[
        body.status
      ]
    }`,
    body.status === "outdated" && body.outdatedDays != null
      ? `Outdated: crack has trailed the latest Steam build for ${body.outdatedDays === 0 ? "less than a day" : `${body.outdatedDays} day(s)`}`
      : null,
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
    body.formerProtection?.length ? `Formerly used protection (since removed by the publisher): ${body.formerProtection.join(", ")}` : null,
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

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildFacts(body) },
  ];

  // 350, not 100: openai/gpt-oss-120b spends reasoning tokens out of this same
  // budget before the final 1-2 sentence answer (see groq.ts) -- 100 was tuned
  // for llama-3.3's non-reasoning output and left too little room, confirmed
  // live to intermittently starve the actual content entirely.
  let { text, error } = await callGroq(env, messages, { maxTokens: 350 });
  if (text && violatesGrounding(body, text)) {
    // One retry with the violating draft shown back and a blunt correction --
    // cheaper and more honest than serving a fabricated DRM claim.
    ({ text, error } = await callGroq(
      env,
      [
        ...messages,
        { role: "user" as const, content: `You wrote: "${text}"\nThat names a specific DRM/anti-cheat product that was never given. Rewrite it about the same game without naming or guessing any protection.` },
      ],
      { maxTokens: 350 },
    ));
    if (text && violatesGrounding(body, text)) {
      return json({ error: "outlook generation could not stay grounded for this title" }, 30, 502);
    }
  }
  if (!text) return json({ error: error || "outlook generation unavailable" }, 30, 502);
  return json({ outlook: text }, 3600);
};

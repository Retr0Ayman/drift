import type { Env } from "./env";

/* Shared Groq chat-completions client -- Groq's API is OpenAI-compatible, so
   this is a plain POST to /openai/v1/chat/completions with a Bearer token.
   Used by every AI-assisted feature (FAQ generation, group/publisher
   summary blurbs, search interpretation) so the "is the key set / did the
   call fail" handling only lives in one place. Every caller is responsible
   for its own strict grounding via the system prompt it passes in -- this
   helper doesn't add or remove any instructions, it just relays. */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

export interface GroqMessage {
  role: "system" | "user";
  content: string;
}

export interface GroqResult {
  text: string | null;
  error: string | null;
}

// Every AI surface on the site (fact/faq/outlook/summary/digest/searchAssist)
// funnels through this one call -- confirmed live, none of them had any
// retry, so a single transient Groq hiccup (a brief 5xx, a 429 under a burst
// of concurrent requests, a dropped connection) surfaced as a hard, user-
// visible "generation unavailable" for every one of them, with no chance to
// recover on its own. 429/5xx/network-level failures are exactly the class a
// short retry actually fixes; a 4xx like a bad request or an auth failure
// would just fail identically again, so those return immediately instead of
// wasting a retry attempt on something retrying can't help.
// openai/gpt-oss-120b's on_demand tier has a noticeably tighter TPM cap than
// llama-3.3-70b-versatile had -- confirmed live, a handful of back-to-back
// calls (a real possibility when a page loads several AI surfaces at once)
// returned 429s asking to retry in anywhere from ~1s to ~8s, well past what
// the old 300/900ms backoff (tuned for the previous model's rate limits)
// could ever cover.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 3000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroqOnce(env: Env, messages: GroqMessage[], opts: { maxTokens?: number; temperature?: number }): Promise<GroqResult & { retryable?: boolean }> {
  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 500,
        // openai/gpt-oss-120b is a reasoning model -- unlike llama-3.3-70b-versatile,
        // it defaults to reasoning_effort "medium" and spends chain-of-thought tokens
        // out of the same max_tokens budget before ever emitting the final answer.
        // Confirmed live: with this unset, every short (80-220 max_tokens) call on
        // this site came back as message.content === "" (reasoning consumed the
        // whole budget), surfacing as "empty response from Groq" for every AI
        // surface. These are all short, non-analytical grounded-text tasks that
        // don't benefit from deep reasoning, so pin it to "low" to leave the budget
        // for the actual answer.
        reasoning_effort: "low",
      }),
    });
    if (!r.ok) {
      let detail = "";
      try {
        const errBody = (await r.json()) as { error?: { message?: string } };
        detail = errBody.error?.message || "";
      } catch {
        // response body wasn't JSON -- fall through with just the status
      }
      const retryable = r.status === 429 || r.status >= 500;
      return { text: null, error: `Groq returned ${r.status}${detail ? `: ${detail}` : ""}`, retryable };
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: null, error: "empty response from Groq" };
    return { text, error: null };
  } catch (e) {
    // A fetch throwing at all (network blip, connection reset) is itself a
    // transient failure class -- retryable, same as a 429/5xx.
    return { text: null, error: `Groq request failed: ${e instanceof Error ? e.message : String(e)}`, retryable: true };
  }
}

export async function callGroq(
  env: Env,
  messages: GroqMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<GroqResult> {
  if (!env.GROQ_API_KEY) {
    return { text: null, error: "GROQ_API_KEY is not set" };
  }
  let last: GroqResult & { retryable?: boolean } = { text: null, error: "unreachable" };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    last = await callGroqOnce(env, messages, opts);
    if (last.text || !last.retryable) return { text: last.text, error: last.error };
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  return { text: last.text, error: last.error };
}

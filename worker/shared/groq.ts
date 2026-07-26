import type { Env } from "./env";

/* Shared Groq chat-completions client -- Groq's API is OpenAI-compatible, so
   this is a plain POST to /openai/v1/chat/completions with a Bearer token.
   Used by every AI-assisted feature (FAQ generation, group/publisher
   summary blurbs, search interpretation) so the "is the key set / did the
   call fail" handling only lives in one place. Every caller is responsible
   for its own strict grounding via the system prompt it passes in -- this
   helper doesn't add or remove any instructions, it just relays. */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

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
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 900];

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

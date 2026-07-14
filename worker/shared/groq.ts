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

export async function callGroq(
  env: Env,
  messages: GroqMessage[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<GroqResult> {
  if (!env.GROQ_API_KEY) {
    return { text: null, error: "GROQ_API_KEY is not set" };
  }
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
      return { text: null, error: `Groq returned ${r.status}${detail ? `: ${detail}` : ""}` };
    }
    const data = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { text: null, error: "empty response from Groq" };
    return { text, error: null };
  } catch (e) {
    return { text: null, error: `Groq request failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

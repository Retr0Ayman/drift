import type { Game } from "../types/game";
import { relStatus } from "./format";

const CACHE_PREFIX = "drift.faq.";

export interface FaqResult {
  faq: string | null;
  error: string | null;
}

const FLAG_LABEL: Record<string, string> = { out: "outdated", unv: "unverified", cur: "current" };

/* Cached per game in localStorage -- generated once, not regenerated every
   page view. Backed by Groq (server-side, see worker/routes/faq.ts) --
   a failure (key unset, rate limit, etc.) surfaces as a real error message,
   not a silent retry loop or a fabricated-looking fallback. */
export async function fetchFaq(game: Game): Promise<FaqResult> {
  const cacheKey = CACHE_PREFIX + game.id;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return { faq: cached, error: null };

  try {
    const r = await fetch("/api/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: game.title,
        developer: game.developer,
        publisher: game.publisher,
        genres: game.genres,
        released: game.released,
        protection: game.tags,
        releases: (game.releases || []).map((rel) => ({
          method: rel.label,
          group: rel.group,
          status: FLAG_LABEL[relStatus(game, rel)],
        })),
      }),
    });
    const data = (await r.json()) as { faq?: string; error?: string };
    if (!r.ok || !data.faq) {
      return { faq: null, error: data.error || `FAQ generation failed (${r.status})` };
    }
    try {
      localStorage.setItem(cacheKey, data.faq);
    } catch {
      // storage full/unavailable -- still return the freshly generated FAQ, just won't be cached
    }
    return { faq: data.faq, error: null };
  } catch {
    return { faq: null, error: "Could not reach the FAQ service" };
  }
}

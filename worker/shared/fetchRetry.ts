/* Generalizes the retry discipline worker/shared/groq.ts's callGroq already
   established for Groq specifically -- confirmed live, one call site at a
   time, that none of this app's OTHER external dependencies (xREL, Steam's
   appdetails/storesearch, steamcmd.net's build lookups, PCGamingWiki's
   Cargo API) had any retry either, so the exact same gap callGroq's own fix
   closed existed everywhere else too: a single transient 429/5xx/network
   blip surfaced as a hard failure (an empty catalog page, a game silently
   missing its DRM tags, a stalled cron tick) with no chance to recover on
   its own, even though the underlying dependency was fine moments later.
   Same retryable class and backoff schedule as callGroq, so the two stay
   consistent: 429/5xx and a thrown network error are worth retrying, any
   other 4xx will just fail identically again and returns immediately
   instead of wasting a retry attempt on something retrying can't fix. */
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/* Drop-in replacement for a plain fetch() call -- returns the same Response
   a caller would otherwise get (a non-retryable 4xx included, so existing
   `if (!r.ok)` handling at each call site is untouched), just with up to
   MAX_ATTEMPTS tries underneath for the retryable failure classes. Only
   ever throws once every attempt has both failed AND every attempt threw
   (never produced a Response at all) -- the same "let the caller's own
   try/catch handle a genuine network failure" contract a plain fetch()
   already has, not a new failure mode callers need to learn. */
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const r = await fetch(url, init);
      if (r.ok || !isRetryableStatus(r.status)) return r;
      lastResponse = r;
    } catch (e) {
      lastError = e;
      lastResponse = null;
    }
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
  }
  if (lastResponse) return lastResponse;
  throw lastError;
}

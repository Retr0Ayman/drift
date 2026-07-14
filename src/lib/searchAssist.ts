/* Client wrapper for the Groq-backed query-correction assist. This never
   returns something to display directly -- callers must re-run the real
   search with the suggested title and only show what comes back from
   THAT, same "verify before display" rule as everywhere else. A failure
   here (key unset, rate limit, etc.) just means no assist this time,
   never a fabricated-looking fallback. */
export async function fetchSearchAssist(query: string): Promise<string | null> {
  try {
    const r = await fetch("/api/search-assist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { suggestion?: string | null };
    return data.suggestion || null;
  } catch {
    return null;
  }
}

const STORAGE_KEY = "drift.clientId";

// Anonymous, random, per-browser id -- not an identity, just enough for the
// worker to dedupe one device's watch-toggle from another's for
// /api/trending's real-count math (migrations/0012). Generated once and
// reused forever; clearing site data resets it, same tradeoff as the
// watchlist itself already accepts.
export function getClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

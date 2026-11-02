import { useEffect, useState } from "react";
import { getClientId } from "../lib/clientId";

const STORAGE_KEY = "drift.watchlist";
const SYNC_CODE_KEY = "drift.watchlist.syncCode";

function readStored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function readSyncCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SYNC_CODE_KEY);
  } catch {
    return null;
  }
}

// Module-scoped, not per-component state: the same game's watch toggle can
// appear more than once on one page at a time (GameDetail's own toggle plus
// one on every ReleaseCard within it), and all of them need to flip together
// the instant one is clicked, not just after a remount picks up localStorage
// again. A small subscriber set keeps that in sync without pulling in an
// external state library.
let cache = readStored();
const listeners = new Set<() => void>();

// Cross-device sync (worker/routes/watchlistSync.ts): once a device has a
// code, every local change re-pushes the full list to it, debounced so a
// burst of toggles is one network call, not one per click.
let syncCode = readSyncCode();
const syncListeners = new Set<() => void>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePush() {
  if (!syncCode) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/watchlist/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: syncCode, gameIds: cache }),
    }).catch(() => {});
  }, 800);
}

function write(next: string[]) {
  cache = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
  schedulePush();
}

function setSyncCode(code: string | null) {
  syncCode = code;
  if (code) window.localStorage.setItem(SYNC_CODE_KEY, code);
  else window.localStorage.removeItem(SYNC_CODE_KEY);
  syncListeners.forEach((l) => l());
}

export function useWatchlist() {
  const [watched, setWatched] = useState<string[]>(cache);
  const [code, setCode] = useState<string | null>(syncCode);

  useEffect(() => {
    const listener = () => setWatched(cache);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const listener = () => setCode(syncCode);
    syncListeners.add(listener);
    return () => {
      syncListeners.delete(listener);
    };
  }, []);

  function toggle(id: string) {
    const adding = !cache.includes(id);
    write(adding ? [...cache, id] : cache.filter((x) => x !== id));
    // Real popularity signal for /api/trending -- only counts a genuine
    // add, not a remove, and only ever this one client's own action (see
    // src/lib/clientId.ts). Best-effort: a failed request just means this
    // toggle doesn't count toward trending, nothing else depends on it.
    if (adding) {
      const clientId = getClientId();
      if (clientId) {
        fetch("/api/watchlist/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: id, clientId }),
        }).catch(() => {});
      }
    }
  }

  function isWatched(id: string): boolean {
    return watched.includes(id);
  }

  // Publishes this device's current list under a fresh code (or reuses one
  // already set). Returns the code to show the user, or null on failure.
  async function enableSync(): Promise<string | null> {
    try {
      const res = await fetch("/api/watchlist/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: syncCode || undefined, gameIds: cache }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { code?: string };
      if (!data.code) return null;
      setSyncCode(data.code);
      return data.code;
    } catch {
      return null;
    }
  }

  // Pulls a code's list from another device and merges it into this one
  // (union, never a destructive overwrite of what's already here), then
  // adopts that code so future changes on this device push back to it too.
  async function loadFromCode(inputCode: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = inputCode.trim().toUpperCase();
    if (!trimmed) return { ok: false, error: "Enter a sync code" };
    try {
      const res = await fetch(`/api/watchlist/sync?code=${encodeURIComponent(trimmed)}`);
      const data = (await res.json()) as { gameIds?: string[]; error?: string };
      if (!res.ok || !data.gameIds) return { ok: false, error: data.error || "Could not load that code" };
      write(Array.from(new Set([...cache, ...data.gameIds])));
      setSyncCode(trimmed);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }

  return { watched, toggle, isWatched, syncCode: code, enableSync, loadFromCode };
}

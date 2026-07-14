import { useEffect, useState } from "react";

const STORAGE_KEY = "drift.watchlist";

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

// Module-scoped, not per-component state: the same game's watch toggle can
// appear more than once on one page at a time (GameDetail's own toggle plus
// one on every ReleaseCard within it), and all of them need to flip together
// the instant one is clicked, not just after a remount picks up localStorage
// again. A small subscriber set keeps that in sync without pulling in an
// external state library.
let cache = readStored();
const listeners = new Set<() => void>();

function write(next: string[]) {
  cache = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function useWatchlist() {
  const [watched, setWatched] = useState<string[]>(cache);

  useEffect(() => {
    const listener = () => setWatched(cache);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  function toggle(id: string) {
    write(cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id]);
  }

  function isWatched(id: string): boolean {
    return watched.includes(id);
  }

  return { watched, toggle, isWatched };
}

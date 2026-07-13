import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types/game";
import { useDebounce } from "./useDebounce";

export interface LocalSuggestion {
  kind: "local";
  id: string;
  title: string;
  year: number | null;
}

export interface LiveSuggestion {
  kind: "live";
  id: string;
  title: string;
  raw: { id: string; dirname: string; time?: number; group_name?: string; ext_info?: { type?: string; title?: string } };
}

export type Suggestion = LocalSuggestion | LiveSuggestion;

interface SearchReleasesResponse {
  list?: LiveSuggestion["raw"][];
}

const MAX_RESULTS = 8;

/* Instant local matches while typing (synchronous filter over whatever's
   already loaded), MERGED with a debounced live xREL search -- not gated
   off by local matches existing. Previously the live fetch only ran when
   localMatches was empty, which meant a genuinely different title (e.g.
   "Watch Dogs 2") could never surface if literally any locally-loaded game
   happened to match the in-progress query, all-or-nothing against local
   results. Now the live search always runs once the query is long enough,
   and results are local-first + live-appended, deduped by title. */
export function useAutocomplete(query: string, games: Game[]) {
  const debounced = useDebounce(query.trim(), 300);
  const [liveResults, setLiveResults] = useState<LiveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const localMatches: LocalSuggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return games
      .filter((g) => g.title.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
      .map((g) => ({ kind: "local", id: g.id, title: g.title, year: g.year }));
  }, [query, games]);

  useEffect(() => {
    if (debounced.length < 2) {
      setLiveResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/xrel?q=${encodeURIComponent(debounced)}`)
      .then((r) => r.json())
      .then((data: SearchReleasesResponse) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const suggestions: LiveSuggestion[] = [];
        for (const row of data.list || []) {
          const title = row.ext_info?.title;
          if (!title || row.ext_info?.type !== "master_game") continue;
          const key = title.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          suggestions.push({ kind: "live", id: row.id, title, raw: row });
          if (suggestions.length >= MAX_RESULTS) break;
        }
        setLiveResults(suggestions);
      })
      .catch(() => setLiveResults([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const results: Suggestion[] = useMemo(() => {
    const localTitles = new Set(localMatches.map((m) => m.title.toLowerCase()));
    const merged: Suggestion[] = [...localMatches];
    for (const live of liveResults) {
      if (merged.length >= MAX_RESULTS) break;
      if (localTitles.has(live.title.toLowerCase())) continue;
      merged.push(live);
    }
    return merged;
  }, [localMatches, liveResults]);

  // Only show a loading state when there's nothing to show yet -- local
  // matches display instantly while live results fill in quietly behind them.
  return { results, loading: loading && results.length === 0 };
}

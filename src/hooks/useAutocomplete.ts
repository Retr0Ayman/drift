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

/* Instant local matches while typing (synchronous filter over whatever's
   already loaded), falling back to a debounced live xREL search only when
   nothing local matches -- so this isn't firing a request per keystroke,
   and doesn't hit the network at all for anything already in the catalog. */
export function useAutocomplete(query: string, games: Game[]) {
  const debounced = useDebounce(query.trim(), 300);
  const [liveResults, setLiveResults] = useState<LiveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const localMatches: LocalSuggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return games
      .filter((g) => g.title.toLowerCase().includes(q))
      .slice(0, 8)
      .map((g) => ({ kind: "local", id: g.id, title: g.title, year: g.year }));
  }, [query, games]);

  useEffect(() => {
    if (debounced.length < 2 || localMatches.length > 0) {
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
          if (suggestions.length >= 8) break;
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
  }, [debounced, localMatches.length]);

  const results: Suggestion[] = localMatches.length ? localMatches : liveResults;
  return { results, loading: loading && localMatches.length === 0 };
}

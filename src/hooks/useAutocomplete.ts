import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types/game";
import { useDebounce } from "./useDebounce";
import { fetchSearchAssist } from "../lib/searchAssist";
import { fuzzyIncludes } from "../lib/fuzzyMatch";
import { groupsIndex } from "../lib/groups";
import { publishersIndex } from "../lib/companies";

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

export interface GroupSuggestion {
  kind: "group";
  key: string;
  name: string;
  count: number;
}

export interface PublisherSuggestion {
  kind: "publisher";
  key: string;
  name: string;
  count: number;
}

export type Suggestion = LocalSuggestion | LiveSuggestion | GroupSuggestion | PublisherSuggestion;

interface SearchReleasesResponse {
  list?: LiveSuggestion["raw"][];
}

const MAX_RESULTS = 8;

async function searchLive(term: string): Promise<LiveSuggestion[]> {
  const r = await fetch(`/api/xrel?q=${encodeURIComponent(term)}`);
  const data = (await r.json()) as SearchReleasesResponse;
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
  return suggestions;
}

/* Instant local matches while typing (synchronous filter over whatever's
   already loaded), MERGED with a debounced live xREL search -- not gated
   off by local matches existing. Previously the live fetch only ran when
   localMatches was empty, which meant a genuinely different title (e.g.
   "Watch Dogs 2") could never surface if literally any locally-loaded game
   happened to match the in-progress query, all-or-nothing against local
   results. Now the live search always runs once the query is long enough,
   and results are local-first + live-appended, deduped by title.

   A third stage kicks in only when the real search comes back completely
   empty: Groq is asked to guess the correctly-spelled title (e.g. "wicher
   3" -> "The Witcher 3: Wild Hunt"), and that guess is immediately re-run
   through the SAME real search -- the guess itself is never shown, only
   whatever genuinely real results come back from re-searching it. A wrong
   guess just produces zero results and gets silently discarded, so this
   can never surface a fabricated "did you mean" for a game that doesn't
   exist. */
export function useAutocomplete(query: string, games: Game[]) {
  const debounced = useDebounce(query.trim(), 300);
  const [liveResults, setLiveResults] = useState<LiveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [assisted, setAssisted] = useState<{ label: string; results: LiveSuggestion[] } | null>(null);
  const [assisting, setAssisting] = useState(false);

  const localMatches: LocalSuggestion[] = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return games
      .filter((g) => fuzzyIncludes(g.title, q))
      .slice(0, MAX_RESULTS)
      .map((g) => ({ kind: "local", id: g.id, title: g.title, year: g.year }));
  }, [query, games]);

  /* Groups/publishers, matched the same fuzzy way as titles above --
     previously this box's own placeholder ("Search titles, groups,
     publishers…") was aspirational only: nothing here ever matched a group
     or publisher name, so typing e.g. "denuvowo" or "bandai namco" surfaced
     nothing at all, no path from the search box to /group/:key or
     /publisher/:key existed. Derived from the same client-side `games`
     already loaded -- same "only as good as what's loaded so far" honesty
     the title/live split above already documents, and the same reason
     groupsIndex is called without the starred-group `extra` param
     GroupsDirectory passes: that's a real full-history fetch this
     lightweight per-keystroke hook has no business making. */
  const groupMatches: GroupSuggestion[] = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return groupsIndex(games)
      .filter((g) => fuzzyIncludes(g.name, q))
      .slice(0, 4)
      .map((g) => ({ kind: "group" as const, key: g.key, name: g.name, count: g.count }));
  }, [query, games]);

  const publisherMatches: PublisherSuggestion[] = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return publishersIndex(games)
      .filter((p) => fuzzyIncludes(p.name, q))
      .slice(0, 4)
      .map((p) => ({ kind: "publisher" as const, key: p.key, name: p.name, count: p.count }));
  }, [query, games]);

  useEffect(() => {
    setAssisted(null);
    if (debounced.length < 2) {
      setLiveResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchLive(debounced)
      .then((suggestions) => {
        if (cancelled) return;
        setLiveResults(suggestions);
      })
      .catch(() => {
        if (!cancelled) setLiveResults([]);
      })
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
    // Groups/publishers are a different result kind entirely (never a
    // near-duplicate of a title match), so these are appended rather than
    // dedup-checked against localTitles above.
    merged.push(...groupMatches, ...publisherMatches);
    return merged;
  }, [localMatches, liveResults, groupMatches, publisherMatches]);

  useEffect(() => {
    if (loading || results.length > 0 || debounced.length < 4) return;
    let cancelled = false;
    setAssisting(true);
    fetchSearchAssist(debounced)
      .then(async (suggestion) => {
        if (cancelled || !suggestion) return;
        const reSearched = await searchLive(suggestion).catch(() => []);
        if (cancelled || !reSearched.length) return;
        setAssisted({ label: suggestion, results: reSearched });
      })
      .finally(() => {
        if (!cancelled) setAssisting(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, loading, results.length]);

  // Only show a loading state when there's nothing to show yet -- local
  // matches display instantly while live results fill in quietly behind them.
  return { results, loading: loading && results.length === 0, assisted, assisting: assisting && !assisted };
}

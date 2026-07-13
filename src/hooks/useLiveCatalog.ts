import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_GAMES } from "../data/seedGames";
import type { Game } from "../types/game";
import { parseReleaseRows, resolveAndEnrich, type PartialGame } from "../lib/catalog";

const PER_PAGE = 60;

export type CatalogStatus = "seeded" | "syncing" | "live";

export interface LiveCatalog {
  games: Game[];
  status: CatalogStatus;
  loading: boolean;
  hasMore: boolean;
  totalPages: number | null;
  loadMore: () => Promise<void>;
  mergeOne: (game: Game) => void;
}

/* No file is the source of truth: on mount this pulls page 1 of the live
   Windows-category feed, resolves+enriches every candidate via Steam, and
   replaces the seed catalog with whatever actually resolved a real appid
   (the seed array is a fallback for total failure, not primary data --
   matches the original drift.html design). Further pages load on demand
   (loadMore), driven by pagination reaching the end of what's loaded so
   far, not an infinite-scroll sentinel. */
export function useLiveCatalog(): LiveCatalog {
  const [games, setGames] = useState<Game[]>(SEED_GAMES);
  const [status, setStatus] = useState<CatalogStatus>("seeded");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalPages, setTotalPages] = useState<number | null>(null);

  const gamesRef = useRef<Game[]>(SEED_GAMES);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const seenKeys = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  const loadingRef = useRef(false);

  const commit = useCallback((next: Game[]) => {
    gamesRef.current = next;
    setGames(next);
  }, []);

  const mergePage = useCallback(async (page: number, replaceSeed: boolean) => {
    const r = await fetch(`/api/xrel/browse?page=${page}&per_page=${PER_PAGE}`);
    const data = (await r.json()) as {
      list?: unknown[];
      pagination?: { total_pages?: number; total_count?: number; per_page?: number };
    };
    const list = (data.list || []) as Parameters<typeof parseReleaseRows>[0];
    const pag = data.pagination;
    if (pag?.total_pages != null) {
      setTotalPages(pag.total_pages);
    }
    if (!list.length) {
      hasMoreRef.current = false;
      setHasMore(false);
      return;
    }

    const byGame = parseReleaseRows(list);
    const candidates = Object.values(byGame).filter((g) => !seenKeys.current.has(g.xrelKey));
    candidates.forEach((g) => seenKeys.current.add(g.xrelKey));
    await Promise.all(candidates.map(resolveAndEnrich));
    // Windows/Steam-only: a game only ever renders if a Steam appid actually
    // resolved -- that's the real signal for "this has a PC release," not
    // the xREL dirname text.
    const resolved = candidates.filter((g): g is PartialGame & { appid: number } => g.appid != null);

    if (replaceSeed) {
      if (resolved.length) commit(resolved);
    } else if (resolved.length) {
      commit([...gamesRef.current, ...resolved]);
    }

    const more = pag?.total_pages != null ? page < pag.total_pages : list.length >= PER_PAGE;
    hasMoreRef.current = more;
    setHasMore(more);
  }, [commit]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = pageRef.current;
      await mergePage(page, false);
      pageRef.current = page + 1;
    } catch {
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [mergePage]);

  const mergeOne = useCallback(
    (game: Game) => {
      const exists = gamesRef.current.some((g) => g.id === game.id);
      commit(exists ? gamesRef.current.map((g) => (g.id === game.id ? game : g)) : [...gamesRef.current, game]);
    },
    [commit],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      setStatus("syncing");
      loadingRef.current = true;
      setLoading(true);
      try {
        await mergePage(1, true);
        pageRef.current = 2;
        setStatus("live");
      } catch {
        setStatus("seeded");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    })();
  }, [mergePage]);

  return { games, status, loading, hasMore, totalPages, loadMore, mergeOne };
}

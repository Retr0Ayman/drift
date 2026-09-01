import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_GAMES } from "../data/seedGames";
import type { Game } from "../types/game";

// D1 reads are cheap -- no need for the small per-page sizes the old
// client-side xREL crawl used to keep Steam-resolve costs down (that cost
// no longer exists at read time, it's already paid once during backfill).
const PER_PAGE = 200;

export type CatalogStatus = "seeded" | "syncing" | "live";

export interface LiveCatalog {
  games: Game[];
  status: CatalogStatus;
  loading: boolean;
  hasMore: boolean;
  totalPages: number | null;
  loadMore: () => Promise<void>;
  mergeOne: (game: Game) => void;
  archiveMonth: string | null;
  archiveDepthMonths: number;
}

interface CatalogResponse {
  games?: Game[];
  total?: number;
  hasMore?: boolean;
}

/* orlaz Phase 3: reads the real catalog from D1 (worker/routes/catalog.ts)
   instead of crawling live /api/xrel/browse pages + resolving each title
   against Steam in the browser -- that approach only ever reflected
   whatever had been paginated in-browser so far (page 1 by default), which
   was the actual root cause behind "88+ publishers" / undercounted
   directories and, less obviously, the Pragmata-class P2P accuracy bug
   (D1 already has scene AND P2P releases merged at write-time, no more
   client-side cross-reference needed for that).

   Same public interface as the old client-crawl version (games/status/
   loading/hasMore/totalPages/loadMore/mergeOne/archiveMonth/
   archiveDepthMonths) so useCatalog() consumers elsewhere didn't need
   touching -- archiveMonth/archiveDepthMonths existed only to report the
   old background archive-walker's depth, which no longer exists (D1
   already has full history), so those are now just static values kept for
   interface compatibility, not real state. */
export function useLiveCatalog(): LiveCatalog {
  const [games, setGames] = useState<Game[]>(SEED_GAMES);
  const [status, setStatus] = useState<CatalogStatus>("seeded");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | null>(null);

  const gamesRef = useRef<Game[]>(SEED_GAMES);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const startedRef = useRef(false);

  const commit = useCallback((next: Game[]) => {
    gamesRef.current = next;
    setGames(next);
  }, []);

  // Returns whether D1 actually had anything -- an empty first page (no
  // migrations applied against the remote database yet, or a genuinely
  // fresh deploy before backfill has written anything) keeps the bundled
  // seed catalog in place instead of replacing it with nothing.
  const fetchPage = useCallback(
    async (page: number, replace: boolean): Promise<boolean> => {
      const r = await fetch(`/api/catalog?page=${page}&per_page=${PER_PAGE}`);
      const data = (await r.json()) as CatalogResponse;
      const list = data.games || [];
      setTotal(data.total ?? null);
      if (!list.length) {
        hasMoreRef.current = false;
        setHasMore(false);
        return !replace; // a later empty page just means "no more," not "nothing ever loaded"
      }
      commit(replace ? list : [...gamesRef.current, ...list]);
      const more = !!data.hasMore;
      hasMoreRef.current = more;
      setHasMore(more);
      return true;
    },
    [commit],
  );

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = pageRef.current;
      await fetchPage(page, false);
      pageRef.current = page + 1;
    } catch {
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchPage]);

  /* FIX (confirmed live via a getComputedStyle/console trace on a real
     client-side game-to-game navigation): CommandPalette's "live" search
     path (a game xREL has but this catalog page hasn't loaded/synced yet)
     resolves a PartialGame via buildLiveGameFromRows (src/lib/catalog.ts)
     -- built straight from a live xREL search + Steam enrichment, it has no
     way to know D1-only precomputed fields like accentColorPrimary/
     accentColorSecondary (worker/backfill/resolve.ts's own accent-color
     extraction), so those keys are simply absent from it, not null. A
     wholesale REPLACE here meant navigating to an already-loaded game via
     that live-search path silently deleted its real accent colors (and any
     other D1-only field) from the in-memory catalog -- GameDetail would
     re-render with mergedGame.accentColorPrimary now undefined, so
     useAmbientAccent's background-color sync would go dark for that game
     for the rest of the session (until a hard reload re-fetched it from
     D1), reading exactly like "sometimes doesn't react." A shallow merge
     keeps every field the incoming partial game genuinely has fresher data
     for (title, releases, appid, ...) while leaving whatever it doesn't
     carry (D1-only enrichment) exactly as the fuller existing record had
     it -- same in the `!exists` branch below there's nothing to preserve. */
  const mergeOne = useCallback(
    (game: Game) => {
      const exists = gamesRef.current.some((g) => g.id === game.id);
      commit(
        exists ? gamesRef.current.map((g) => (g.id === game.id ? { ...g, ...game } : g)) : [...gamesRef.current, game],
      );
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
        const ok = await fetchPage(1, true);
        pageRef.current = 2;
        setStatus(ok ? "live" : "seeded");
      } catch {
        setStatus("seeded");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }

      // Eagerly keep loading the rest of the catalog in the background,
      // not gated behind a UI action -- D1 reads are cheap and fast
      // (unlike the per-title Steam-resolve crawl this replaces), so this
      // typically finishes in a couple of seconds rather than the old
      // archive-walker's session-long trickle. Directory pages (Groups,
      // Publishers) depend on `games` genuinely reflecting the whole
      // catalog to show real counts instead of the old "+"-suffixed
      // provisional ones.
      //
      // FIX (perf sweep): this used to call fetchPage (a full commit/
      // setGames on every single page) in the loop body -- a ~2000-game
      // catalog at PER_PAGE=200 is ~10 pages, so page 1's render was
      // immediately followed by 9 more full top-level re-renders in quick
      // succession, each one cascading through every useMemo'd derived list
      // (Home's filtered/genres/years, GroupsDirectory's/PublishersDirectory's
      // index builds) for no visible benefit -- nothing was watching this
      // background drain closely enough to need page-by-page granularity.
      // Buffers a few pages' worth of games and flushes them as one commit
      // instead, so the same eager full-catalog load finishes in ~3 renders
      // instead of ~10.
      const FLUSH_EVERY = 3;
      let buffer: Game[] = [];
      while (hasMoreRef.current) {
        try {
          const page = pageRef.current;
          const r = await fetch(`/api/catalog?page=${page}&per_page=${PER_PAGE}`);
          const data = (await r.json()) as CatalogResponse;
          const list = data.games || [];
          setTotal(data.total ?? null);
          const more = !!data.hasMore && list.length > 0;
          hasMoreRef.current = more;
          setHasMore(more);
          pageRef.current = page + 1;
          if (!list.length) break;
          buffer.push(...list);
          if (buffer.length >= PER_PAGE * FLUSH_EVERY || !more) {
            commit([...gamesRef.current, ...buffer]);
            buffer = [];
          }
        } catch {
          break;
        }
      }
      if (buffer.length) commit([...gamesRef.current, ...buffer]);
    })();
  }, [fetchPage, commit]);

  return {
    games,
    status,
    loading,
    hasMore,
    totalPages: total != null ? Math.ceil(total / PER_PAGE) : null,
    loadMore,
    mergeOne,
    archiveMonth: null,
    archiveDepthMonths: 0,
  };
}

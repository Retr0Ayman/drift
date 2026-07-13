import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_GAMES } from "../data/seedGames";
import type { Game } from "../types/game";
import { parseReleaseRows, resolveAndEnrich, type PartialGame } from "../lib/catalog";

const PER_PAGE = 60;

/* Deep-history archive walk (widens catalog depth beyond the ~5000-most-
   recent-release window the Windows browse feed is capped at) -- confirmed
   live before building this that release/latest.json?archive=YYYY-MM has no
   p2p_results field at all (same limitation as every other endpoint), so
   this genuinely deepens scene-group/general-catalog coverage but cannot
   move P2P groups (DenuvOwO/voices38) past their search-endpoint ceiling;
   those are a separate, already-confirmed hard cap. Session-scoped: there's
   no persistence layer (no KV/D1), so depth resets each page load and only
   grows for as long as that tab stays open -- not a permanent crawl. */
const ARCHIVE_TICK_MS = 12000;
const ARCHIVE_FLOOR = "2016-01";
const ARCHIVE_EMPTY_STREAK_STOP = 12;
const ARCHIVE_PER_PAGE = 100;

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

function prevYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* No file is the source of truth: on mount this pulls page 1 of the live
   Windows-category feed, resolves+enriches every candidate via Steam, and
   replaces the seed catalog with whatever actually resolved a real appid
   (the seed array is a fallback for total failure, not primary data --
   matches the original drift.html design). Further pages load on demand
   (loadMore), driven by pagination reaching the end of what's loaded so
   far, not an infinite-scroll sentinel. A slow background archive walk
   (startArchiveWalk) trickles in deeper history behind that. */
export function useLiveCatalog(): LiveCatalog {
  const [games, setGames] = useState<Game[]>(SEED_GAMES);
  const [status, setStatus] = useState<CatalogStatus>("seeded");
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [archiveMonth, setArchiveMonth] = useState<string | null>(null);
  const [archiveDepthMonths, setArchiveDepthMonths] = useState(0);

  const gamesRef = useRef<Game[]>(SEED_GAMES);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const seenKeys = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  const loadingRef = useRef(false);

  const archiveMonthRef = useRef<string | null>(null);
  const archiveStoppedRef = useRef(false);
  const archiveEmptyStreakRef = useRef(0);
  const archiveTickingRef = useRef(false);

  const commit = useCallback((next: Game[]) => {
    gamesRef.current = next;
    setGames(next);
  }, []);

  const resolveNewCandidates = useCallback(async (byGame: Record<string, PartialGame>) => {
    const candidates = Object.values(byGame).filter((g) => !seenKeys.current.has(g.xrelKey));
    candidates.forEach((g) => seenKeys.current.add(g.xrelKey));
    await Promise.all(candidates.map(resolveAndEnrich));
    // Windows/Steam-only: a game only ever renders if a Steam appid actually
    // resolved -- that's the real signal for "this has a PC release," not
    // the xREL dirname text.
    return candidates.filter((g): g is PartialGame & { appid: number } => g.appid != null);
  }, []);

  const mergePage = useCallback(
    async (page: number, replaceSeed: boolean) => {
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
      const resolved = await resolveNewCandidates(byGame);

      if (replaceSeed) {
        if (resolved.length) commit(resolved);
      } else if (resolved.length) {
        commit([...gamesRef.current, ...resolved]);
      }

      const more = pag?.total_pages != null ? page < pag.total_pages : list.length >= PER_PAGE;
      hasMoreRef.current = more;
      setHasMore(more);
    },
    [commit, resolveNewCandidates],
  );

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

  /* One month per tick, oldest-first from "now" -- a genuine trickle, not a
     crawl, so it never competes with foreground pagination/search for rate
     limit. Guarded against overlap (archiveTickingRef) the same way the
     original design was, since a tick occasionally runs long enough for
     setInterval to fire the next one before this one finishes. */
  const archiveTick = useCallback(async () => {
    if (archiveStoppedRef.current || archiveTickingRef.current) return;
    archiveTickingRef.current = true;
    try {
      if (archiveMonthRef.current == null) {
        const now = new Date();
        archiveMonthRef.current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      }
      if (archiveMonthRef.current < ARCHIVE_FLOOR) {
        archiveStoppedRef.current = true;
        return;
      }
      try {
        const r = await fetch(`/api/xrel/archive?month=${archiveMonthRef.current}&page=1&per_page=${ARCHIVE_PER_PAGE}`);
        const data = (await r.json()) as { list?: unknown[] };
        const list = (data.list || []) as Parameters<typeof parseReleaseRows>[0];
        const byGame = parseReleaseRows(list); // already filters to master_game
        if (Object.keys(byGame).length) {
          const resolved = await resolveNewCandidates(byGame);
          archiveEmptyStreakRef.current = 0;
          if (resolved.length) commit([...gamesRef.current, ...resolved]);
        } else {
          archiveEmptyStreakRef.current++;
          if (archiveEmptyStreakRef.current >= ARCHIVE_EMPTY_STREAK_STOP) archiveStoppedRef.current = true;
        }
      } catch {
        return; // transient failure -- retry this same month next tick
      }
      archiveMonthRef.current = prevYearMonth(archiveMonthRef.current);
      setArchiveMonth(archiveMonthRef.current);
      setArchiveDepthMonths((n) => n + 1);
    } finally {
      archiveTickingRef.current = false;
    }
  }, [commit, resolveNewCandidates]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let intervalId: ReturnType<typeof setInterval> | undefined;
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
      intervalId = setInterval(archiveTick, ARCHIVE_TICK_MS);
    })();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [mergePage, archiveTick]);

  return { games, status, loading, hasMore, totalPages, loadMore, mergeOne, archiveMonth, archiveDepthMonths };
}

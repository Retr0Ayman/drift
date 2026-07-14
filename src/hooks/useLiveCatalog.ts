import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_GAMES } from "../data/seedGames";
import type { Game } from "../types/game";
import { parseReleaseRows, resolveAndEnrich, dedupeReleasesByGroup, type PartialGame } from "../lib/catalog";

/* Starred P2P groups whose releases never appear in the browse/archive feeds
   (confirmed live: those endpoints have no p2p_results field at all) get
   merged in explicitly via the dedicated group route instead, once per
   session. This is the real fix for "Hypervisor filter always returns 0
   results" -- structurally, no game could ever reach the catalog with an
   "hv" release before this, since DenuvOwO (the only hv-tagged group) never
   showed up through the normal crawl.

   Originally just DenuvOwO (fixing the hv filter specifically) -- voices38
   had the identical structural gap (also P2P-only, also invisible to
   browse/archive) but was left out, so its releases only ever reached the
   catalog if a user happened to search up that exact title first. Both
   starred groups get the same proactive treatment now. */
const SEED_GROUPS = ["DenuvOwO", "voices38"];

const PER_PAGE = 60;
const RESOLVE_BATCH_SIZE = 6;

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
    // Batched, not Promise.all(candidates.map(...)) -- confirmed live: a
    // starred group like DenuvOwO can hand back ~30 titles in one response,
    // and firing 30 concurrent /api/resolve calls (each hitting Steam's
    // storesearch) at once measurably caused some of them to fail to
    // resolve under real load. RESOLVE_BATCH_SIZE keeps this to a handful
    // of in-flight requests at a time.
    for (let i = 0; i < candidates.length; i += RESOLVE_BATCH_SIZE) {
      await Promise.all(candidates.slice(i, i + RESOLVE_BATCH_SIZE).map(resolveAndEnrich));
    }
    // Windows/Steam-only: a game only ever renders if a Steam appid actually
    // resolved -- that's the real signal for "this has a PC release," not
    // the xREL dirname text.
    const resolved = candidates.filter((g): g is PartialGame & { appid: number } => g.appid != null);
    // Only the ones that actually resolved get permanently marked "seen" --
    // confirmed live root cause of a real bug: 007 First Light's DenuvOwO
    // release never appeared in the catalog because an earlier pass (browse
    // or archive) had already tried and failed to resolve the same xrelKey
    // (title-string mismatch or a transient Steam hiccup) and marked it seen
    // regardless of outcome, permanently blocking every later, otherwise-
    // successful attempt for the rest of the session. A failed candidate is
    // left off seenKeys so the next pass that encounters the same xrelKey
    // gets a genuine retry instead of being silently skipped forever.
    resolved.forEach((g) => seenKeys.current.add(g.xrelKey));
    return resolved;
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

  /* Runs once per session, shortly after the initial catalog load. Pulls
     every real release for each starred P2P group via the dedicated group
     route (search/releases.json?p2p=1, hard-filtered to an exact group-name
     match server-side), groups by title, resolves Steam appids the same way
     the browse/archive path does, and merges in whatever actually resolved.
     Titles the browse crawl (or an earlier search-driven merge) already
     picked up just get this group's release folded in via id match (Game.id
     is a deterministic slug of the title) and re-deduped, so this adds real
     releases without ever duplicating a row that's already there. */
  const mergeSeedGroups = useCallback(async () => {
    for (const name of SEED_GROUPS) {
      try {
        const r = await fetch(`/api/xrel/group?name=${encodeURIComponent(name)}`);
        const data = (await r.json()) as { list?: unknown[] };
        const list = (data.list || []) as Parameters<typeof parseReleaseRows>[0];
        if (!list.length) continue;
        const byGame = parseReleaseRows(list);
        const resolved = await resolveNewCandidates(byGame);
        if (!resolved.length) continue;
        const byId = new Map(resolved.map((g) => [g.id, g]));
        const merged = gamesRef.current.map((g) => {
          const hit = byId.get(g.id);
          if (!hit) return g;
          byId.delete(g.id);
          return { ...g, releases: dedupeReleasesByGroup([...g.releases, ...hit.releases]) };
        });
        commit([...merged, ...byId.values()]);
      } catch {
        // one starred group failing to fetch shouldn't block the others or the rest of the catalog
      }
    }
  }, [commit, resolveNewCandidates]);

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
      mergeSeedGroups();
      intervalId = setInterval(archiveTick, ARCHIVE_TICK_MS);
    })();
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [mergePage, archiveTick, mergeSeedGroups]);

  return { games, status, loading, hasMore, totalPages, loadMore, mergeOne, archiveMonth, archiveDepthMonths };
}

import { useEffect, useMemo, useState } from "react";
import Hero from "./Hero";
import GameGrid from "./GameGrid";
import FilterBar from "./FilterBar";
import Pagination from "../ui/Pagination";
import { useCatalog } from "../../hooks/useCatalog";
import { usePageSize } from "../../hooks/usePageSize";
import { availableGenres, availableYears, passesFilters, sortGames, type SortKey, type StatusFilter } from "../../lib/filters";

export default function Home() {
  const { games, hasMore, loading, loadMore } = useCatalog();
  const [pageSize, setPageSize] = usePageSize(24);
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [genre, setGenre] = useState("all");
  const [year, setYear] = useState("all");
  const [sort, setSort] = useState<SortKey>("date-desc");

  const genres = useMemo(() => availableGenres(games), [games]);
  const years = useMemo(() => availableYears(games), [games]);

  // A genre/year that no longer appears in the live-growing catalog (e.g.
  // the archive walker hasn't reached it yet) falls back to "all" instead
  // of silently filtering to zero results forever.
  useEffect(() => {
    if (genre !== "all" && !genres.includes(genre)) setGenre("all");
  }, [genre, genres]);
  useEffect(() => {
    if (year !== "all" && !years.some((y) => String(y) === year)) setYear("all");
  }, [year, years]);

  const filtered = useMemo(
    () => sortGames(games.filter((g) => passesFilters(g, { status, genre, year })), sort),
    [games, status, genre, year, sort],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [pageSize, status, genre, year, sort]);

  // Real pagination over the live-growing catalog: jumping to a page beyond
  // what's currently loaded fetches more xREL pages first, then lands on
  // it -- not an infinite-scroll sentinel, just pagination that's willing to
  // fetch ahead of itself when asked to. Only chases more data for the
  // default unfiltered/date-sorted view -- a filtered view can't assume the
  // next live page will contain matches, so it just paginates over what's
  // already loaded.
  const canChaseMore = status === "all" && genre === "all" && year === "all" && sort === "date-desc";
  useEffect(() => {
    if (pendingPage == null) return;
    if (!canChaseMore || filtered.length >= pendingPage * pageSize || !hasMore) {
      setPage(Math.min(pendingPage, Math.max(1, Math.ceil(filtered.length / pageSize))));
      setPendingPage(null);
    } else if (!loading) {
      loadMore();
    }
  }, [pendingPage, filtered.length, hasMore, loading, pageSize, loadMore, canChaseMore]);

  function goToPage(n: number) {
    if (n <= clampedPage || filtered.length >= n * pageSize || !hasMore || !canChaseMore) {
      setPage(n);
    } else {
      setPendingPage(n);
    }
  }

  return (
    <>
      <Hero />
      <GameGrid
        games={pageItems}
        filters={
          <FilterBar
            status={status}
            onStatusChange={setStatus}
            genre={genre}
            onGenreChange={setGenre}
            genres={genres}
            year={year}
            onYearChange={setYear}
            years={years}
            sort={sort}
            onSortChange={setSort}
          />
        }
      />
      <div className="wrap">
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          onChange={goToPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          count={filtered.length}
        />
        {pendingPage != null ? <p className="catalogue-loading">Loading more titles…</p> : null}
      </div>
    </>
  );
}

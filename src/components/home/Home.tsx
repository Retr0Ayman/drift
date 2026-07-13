import { useEffect, useMemo, useState } from "react";
import Hero from "./Hero";
import GameGrid from "./GameGrid";
import Pagination from "../ui/Pagination";
import { useCatalog } from "../../hooks/useCatalog";
import { usePageSize } from "../../hooks/usePageSize";
import { gTimestamp } from "../../lib/catalog";

export default function Home() {
  const { games, hasMore, loading, loadMore } = useCatalog();
  const [pageSize, setPageSize] = usePageSize(24);
  const [page, setPage] = useState(1);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  const sorted = useMemo(() => [...games].sort((a, b) => gTimestamp(b) - gTimestamp(a)), [games]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((clampedPage - 1) * pageSize, clampedPage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  // Real pagination over the live-growing catalog: jumping to a page beyond
  // what's currently loaded fetches more xREL pages first, then lands on
  // it -- not an infinite-scroll sentinel, just pagination that's willing to
  // fetch ahead of itself when asked to.
  useEffect(() => {
    if (pendingPage == null) return;
    if (sorted.length >= pendingPage * pageSize || !hasMore) {
      setPage(Math.min(pendingPage, Math.max(1, Math.ceil(sorted.length / pageSize))));
      setPendingPage(null);
    } else if (!loading) {
      loadMore();
    }
  }, [pendingPage, sorted.length, hasMore, loading, pageSize, loadMore]);

  function goToPage(n: number) {
    if (n <= clampedPage || sorted.length >= n * pageSize || !hasMore) {
      setPage(n);
    } else {
      setPendingPage(n);
    }
  }

  return (
    <>
      <Hero />
      <GameGrid games={pageItems} />
      <div className="wrap">
        <Pagination
          page={clampedPage}
          totalPages={totalPages}
          onChange={goToPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          count={sorted.length}
        />
        {pendingPage != null ? <p className="catalogue-loading">Loading more titles…</p> : null}
      </div>
    </>
  );
}

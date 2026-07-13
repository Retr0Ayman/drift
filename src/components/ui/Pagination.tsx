import Select from "./Select";
import { PAGE_SIZES, type PageSize } from "../../hooks/usePageSize";
import "./Pagination.css";

const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }));

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  count: number;
}

/* Real pagination, not infinite scroll: a bounded window of page numbers
   (first/last + a few around the current page), same shape regardless of
   how many pages the live catalog eventually grows to. */
export default function Pagination({ page, totalPages, onChange, pageSize, onPageSizeChange, count }: PaginationProps) {
  const nums = new Set([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
  const sorted = [...nums].sort((a, b) => a - b);
  let prev = 0;
  const items: React.ReactNode[] = [];
  for (const n of sorted) {
    if (prev && n - prev > 1) items.push(<span className="pager-gap" key={`gap-${n}`}>…</span>);
    items.push(
      <button
        key={n}
        className={`pager-btn${n === page ? " pager-btn--on" : ""}`}
        onClick={() => onChange(n)}
        aria-current={n === page ? "page" : undefined}
      >
        {n}
      </button>,
    );
    prev = n;
  }

  return (
    <div className="pagination">
      <span className="pagination-count">{count} titles</span>
      {totalPages > 1 ? (
        <div className="pager">
          <button className="pager-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
            ‹
          </button>
          {items}
          <button className="pager-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
            ›
          </button>
        </div>
      ) : null}
      <Select
        ariaLabel="Titles per page"
        value={String(pageSize)}
        onChange={(v) => onPageSizeChange(Number(v) as PageSize)}
        options={PAGE_SIZE_OPTIONS}
      />
    </div>
  );
}

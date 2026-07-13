import { useEffect, useState } from "react";

const STORAGE_KEY = "drift.pageSize";
export const PAGE_SIZES = [10, 24, 48] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

function readStored(defaultSize: PageSize): PageSize {
  if (typeof window === "undefined") return defaultSize;
  const stored = Number(window.localStorage.getItem(STORAGE_KEY));
  return (PAGE_SIZES as readonly number[]).includes(stored) ? (stored as PageSize) : defaultSize;
}

export function usePageSize(defaultSize: PageSize = 24) {
  const [pageSize, setPageSize] = useState<PageSize>(() => readStored(defaultSize));

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(pageSize));
  }, [pageSize]);

  return [pageSize, setPageSize] as const;
}

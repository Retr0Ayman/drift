import { useEffect, useState } from "react";
import { fetchGroupReleases, type XrelReleaseRow } from "../lib/xrel";

export function useGroupReleases(name: string | null): { rows: XrelReleaseRow[]; loading: boolean } {
  const [rows, setRows] = useState<XrelReleaseRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!name) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGroupReleases(name).then((data) => {
      if (cancelled) return;
      setRows(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return { rows, loading };
}

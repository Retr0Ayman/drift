import { useEffect, useState } from "react";
import { fetchGroupHistory, type XrelReleaseRow } from "../lib/xrel";

export function useGroupReleases(name: string | null): { rows: XrelReleaseRow[]; loading: boolean; complete: boolean } {
  const [rows, setRows] = useState<XrelReleaseRow[]>([]);
  // Starts true (whenever there's a name to fetch), not false -- confirmed
  // live bug: a `false` default here meant `ready={!loading}` in
  // GroupProfile's AiSummary was briefly true on the very first render,
  // before this hook's own effect had even called setLoading(true), so the
  // AI summary generated from whatever sparse data existed on mount and
  // then never regenerated once the real data arrived.
  const [loading, setLoading] = useState(!!name);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!name) {
      setRows([]);
      setComplete(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchGroupHistory(name).then(({ rows: data, complete: isComplete }) => {
      if (cancelled) return;
      setRows(data);
      setComplete(isComplete);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return { rows, loading, complete };
}

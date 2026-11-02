import { useEffect, useState } from "react";

interface TrendingRow {
  game_id: string;
  watchers: number;
}

interface TrendingResponse {
  games: TrendingRow[];
  windowDays: number;
}

// Real, computed popularity from worker/routes/trending.ts -- how many
// distinct anonymous devices watch-toggled a game on in the last window,
// never an AI-guessed ranking. Returns raw {game_id, watchers} rows; the
// page resolving them against the already-loaded catalog is the caller's
// job (Trending.tsx), same separation useGroupReliability-style hooks use.
export function useTrending() {
  const [rows, setRows] = useState<TrendingRow[]>([]);
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trending")
      .then((r) => r.json())
      .then((data: TrendingResponse) => {
        if (cancelled) return;
        setRows(Array.isArray(data.games) ? data.games : []);
        if (data.windowDays) setWindowDays(data.windowDays);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { rows, windowDays, loading };
}

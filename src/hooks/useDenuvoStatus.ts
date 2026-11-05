import { useEffect, useState } from "react";

export interface SourceHealth {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  failingSince: number | null;
  consecutiveFailures: number;
  lastStatus: number | null;
  lastError: string | null;
}

export interface DenuvoStatus {
  now: number;
  sources: { pcgamingwiki?: SourceHealth; steam?: SourceHealth };
}

/* Source health for the tracker's status line. null until loaded (or if the
   endpoint is unreachable) -- the page then says nothing rather than
   claiming the feeds are fine. */
export function useDenuvoStatus(): DenuvoStatus | null {
  const [status, setStatus] = useState<DenuvoStatus | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/denuvo-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!cancelled && b && b.sources) setStatus(b as DenuvoStatus);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}

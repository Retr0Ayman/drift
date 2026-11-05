import { useEffect, useState } from "react";
import type { CatalogStatus } from "../../hooks/useLiveCatalog";
import "./SyncStatus.css";

const LABEL: Record<CatalogStatus, string> = {
  live: "Live",
  syncing: "Syncing",
  seeded: "Offline snapshot",
};

function ago(ts: number, now: number): string | null {
  const s = Math.floor((now - ts) / 1000);
  if (!Number.isFinite(s) || s < 0) return null;
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/* The orlaz mark as a status light. Two rings: concentric = in sync (live,
   static), ghost ring drifting off-centre and easing back = syncing (only
   while actually syncing), offset and grey = seeded snapshot. */
export default function SyncStatus({ status, latestTs }: { status: CatalogStatus; latestTs: number | null }) {
  // Re-read the clock once a minute so "N min ago" stays honest.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Only the real timestamp of the newest crack in the loaded catalog --
  // omitted (not faked) when there isn't one or the catalog isn't live.
  const rel = status === "live" && latestTs ? ago(latestTs, now) : null;

  return (
    <span className={`sync-status sync-status--${status}`} title={rel ? `Latest crack ${rel}` : LABEL[status]}>
      <svg className="sync-status-glyph" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="sync-status-ghost" cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="2" />
      </svg>
      <span>
        {LABEL[status]}
        {rel ? <span className="sync-status-time"> · latest crack {rel}</span> : null}
      </span>
    </span>
  );
}

import type { DenuvoStatus, SourceHealth } from "../hooks/useDenuvoStatus";

const NAMES = { pcgamingwiki: "PCGamingWiki", steam: "Steam" } as const;

export function agoLabel(ts: number, now: number): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function sinceLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export interface StatusLine {
  text: string;
  /* Every source that has ever been checked is failing right now: the lists
     are stale, and the page must say so instead of looking confident. */
  allFailing: boolean;
}

/* Honest one-liner for the tracker header, built only from recorded source
   health. A source that hasn't been checked yet says so; a failing one says
   since when. Returns null when there is no health data at all. */
export function describeSources(status: DenuvoStatus | null): StatusLine | null {
  if (!status) return null;
  const now = status.now;
  const order = ["steam", "pcgamingwiki"] as const;
  const known = order.map((k) => [k, status.sources[k]] as const).filter((e): e is [(typeof order)[number], SourceHealth] => !!e[1]);
  if (!known.length) return null;

  const ok: string[] = [];
  const bad: string[] = [];
  let attempted = 0;
  let failing = 0;
  for (const [k, h] of known) {
    if (h.lastAttemptAt == null) continue;
    attempted++;
    if (h.failingSince != null) {
      failing++;
      bad.push(`${NAMES[k]} unavailable since ${sinceLabel(h.failingSince)}`);
    } else if (h.lastSuccessAt != null) {
      ok.push(`${agoLabel(h.lastSuccessAt, now)} (${NAMES[k]})`);
    }
  }
  if (!attempted) return { text: "DRM data not refreshed yet", allFailing: false };
  const parts: string[] = [];
  if (ok.length) parts.push(`DRM data last refreshed ${ok.join(", ")}`);
  parts.push(...bad);
  const allFailing = failing === attempted;
  if (allFailing) parts.unshift("No DRM source is answering — the lists below may be out of date");
  return { text: parts.join(" · "), allFailing };
}

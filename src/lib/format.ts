import type { Game, Release } from "../types/game";

export type GameStatus = "hv" | "cracked" | "uncracked" | "unreleased";

export function gStatus(g: Game): GameStatus {
  if (g.releases && g.releases.length) {
    return g.releases.some((r) => r.method === "hv") ? "hv" : "cracked";
  }
  return g.currentBuild && g.currentBuild > 0 ? "uncracked" : "unreleased";
}

export interface StatusMeta {
  cls: "hv" | "dead" | "unc" | "unr";
  label: string;
}

export function statusMeta(g: Game): StatusMeta {
  const s = gStatus(g);
  if (s === "unreleased") return { cls: "unr", label: "UNRELEASED" };
  if (s === "uncracked") return { cls: "unc", label: "UNCRACKED" };
  if (s === "hv") return { cls: "hv", label: "HYPERVISOR" };
  return { cls: "dead", label: "CRACKED" };
}

/* Three states, not two: a live xREL release always has build:null (no clean
   crack<->build mapping exists), and that must never render as "Current" --
   that's a false claim. "Unverified" means exactly what it says. */
export function relStatus(g: Game, r: Release): "out" | "cur" | "unv" {
  if (r.build == null) return "unv";
  return g.currentBuild && r.build < g.currentBuild ? "out" : "cur";
}

export function relOutdated(g: Game, r: Release): boolean {
  return relStatus(g, r) === "out";
}

export function anyOutdated(g: Game): boolean {
  return !!g.releases && g.releases.some((r) => relOutdated(g, r));
}

export function bestBuild(g: Game): number | null {
  if (!g.releases || !g.releases.length) return null;
  return Math.max(...g.releases.map((r) => r.build || 0));
}

export function driftDelta(g: Game): number {
  const b = bestBuild(g);
  return b && g.currentBuild && b < g.currentBuild ? g.currentBuild - b : -1;
}

export const fmtBuild = (n: number | null | undefined): string => (n ? "#" + n.toLocaleString("en-US") : "—");

const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps/";
export const steamImg = (appid: number, file: string): string => `${STEAM_CDN}${appid}/${file}`;
export const coverImg = (g: Game): string | null => (g.appid ? steamImg(g.appid, "header.jpg") : null);

export const steamLink = (g: Game): string =>
  g.appid
    ? `https://store.steampowered.com/app/${g.appid}`
    : `https://store.steampowered.com/search/?term=${encodeURIComponent(g.title)}`;

export const steamdbLink = (g: Game): string =>
  g.appid
    ? `https://steamdb.info/app/${g.appid}/patchnotes/`
    : `https://steamdb.info/search/?a=app&q=${encodeURIComponent(g.title)}`;

export const slugify = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

/* Deterministic name -> hue, so a group's initials badge stays the same
   color everywhere it appears without a lookup table. */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 60%, 55%)`;
}

export function fmtDateMs(ms: number | null | undefined): string {
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

/* Prefers the release's raw xREL timestamp (r.ts, seconds); seed data has no
   raw timestamp, so falls back to parsing its display date string. Returns
   null (never a fabricated guess) if either side is unparseable. */
export function releaseTs(r: Release): number | null {
  if (r.ts) return r.ts * 1000;
  const t = Date.parse(r.date || "");
  return isNaN(t) ? null : t;
}

/* "Cracked in N day(s)" / "Leaked N day(s) early" -- a release's own timing
   relative to the game's Steam release date, distinct from relStatus (which
   compares crack BUILD number to current build, not release DATE to release
   date). */
export function crackTimingLabel(g: Game, r: Release): string | null {
  const releaseTsVal = g.released ? Date.parse(g.released) : NaN;
  const crackTsVal = releaseTs(r);
  if (isNaN(releaseTsVal) || crackTsVal == null) return null;
  const days = Math.round((crackTsVal - releaseTsVal) / 86400000);
  if (days === 0) return "Cracked on release day";
  if (days > 0) return `Cracked in ${days} day${days === 1 ? "" : "s"}`;
  return `Leaked ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} early`;
}

/* Same underlying comparison as crackTimingLabel, terser "D+N"/"D-N" form for
   the group release list where every row needs to stay scannable. */
export function dPlusNLabel(g: Game, r: Release): string | null {
  const releaseTsVal = g.released ? Date.parse(g.released) : NaN;
  const crackTsVal = releaseTs(r);
  if (isNaN(releaseTsVal) || crackTsVal == null) return null;
  const days = Math.round((crackTsVal - releaseTsVal) / 86400000);
  return (days >= 0 ? "D+" : "D") + days;
}

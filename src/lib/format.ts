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

export type RecencyStatus = "likely-current" | "likely-outdated" | null;

/* Secondary, honest signal for releases with no real Steam build ID (P2P
   groups don't produce one -- relStatus above already refuses to claim
   Current/Outdated without one). Compares the release's own timestamp
   against every other tracked release for the same game: the most recent
   one is "likely current," anything with a strictly newer release after it
   is "likely outdated." Returns null (no directional claim) whenever there
   isn't a real build-less timestamp to compare, or nothing to compare it
   against -- this is a recency heuristic, not a confirmed match, so it
   must never fire for a release that already has a real build number. */
export function recencyStatusFor(release: Release, allReleases: Release[]): RecencyStatus {
  if (release.build != null) return null;
  const ts = release.ts || 0;
  if (!ts) return null;
  const comparable = allReleases.filter((r) => (r.ts || 0) > 0);
  if (comparable.length < 2) return null;
  const maxTs = Math.max(...comparable.map((r) => r.ts || 0));
  return ts >= maxTs ? "likely-current" : "likely-outdated";
}

/* Which crack to lead with when a game has more than one: higher build
   (closer to/matching the current Steam build) wins outright regardless of
   method -- a hypervisor bypass that's still current beats a traditional
   crack that's drifted outdated, and vice versa. On an exact tie (same
   build, including both unverified/build:null), traditional wins -- it
   doesn't need a kernel-level driver, so it's the more usable option when
   currency is equal. */
export function sortReleasesByPriority(releases: Release[]): Release[] {
  return [...releases].sort((a, b) => {
    const ab = a.build ?? -Infinity;
    const bb = b.build ?? -Infinity;
    if (bb !== ab) return bb - ab;
    if (a.method !== b.method) return a.method === "trad" ? -1 : 1;
    return 0;
  });
}

/* SteamDB/Cirno-style version label: bare numbers get a "v" prefix ("3" ->
   "v3"); anything already starting with a version-like token ("v1.05",
   "HVB v3") or free text ("BETA 5.0", "launch") is shown verbatim -- never
   fabricate a version format the source dirname didn't actually have. */
export function versionLabel(v?: string | null): string {
  if (!v) return "—";
  if (/^v\d/i.test(v)) return v;
  if (/^\d/.test(v)) return "v" + v;
  return v;
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

/* Shared math behind crackTimingLabel/dPlusNLabel/the leaderboard: how many
   days after (positive) or before (negative, an early leak) a game's Steam
   release date a given release actually landed. Returns null (never a
   fabricated 0) when either side can't be parsed. */
export function crackTimingDays(g: Game, r: Release): number | null {
  const releaseTsVal = g.released ? Date.parse(g.released) : NaN;
  const crackTsVal = releaseTs(r);
  if (isNaN(releaseTsVal) || crackTsVal == null) return null;
  return Math.round((crackTsVal - releaseTsVal) / 86400000);
}

/* "Cracked in N day(s)" / "Leaked N day(s) early" -- a release's own timing
   relative to the game's Steam release date, distinct from relStatus (which
   compares crack BUILD number to current build, not release DATE to release
   date). */
export function crackTimingLabel(g: Game, r: Release): string | null {
  const days = crackTimingDays(g, r);
  if (days == null) return null;
  if (days === 0) return "Cracked on release day";
  if (days > 0) return `Cracked in ${days} day${days === 1 ? "" : "s"}`;
  return `Leaked ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} early`;
}

/* Same underlying comparison as crackTimingLabel, terser "D+N"/"D-N" form for
   the group release list where every row needs to stay scannable. */
export function dPlusNLabel(g: Game, r: Release): string | null {
  const days = crackTimingDays(g, r);
  if (days == null) return null;
  return (days >= 0 ? "D+" : "D") + days;
}

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

/* Chronological view for the Crack Timeline (GameDetail's "Crack options"
   tab) -- real first_seen_ts/firstSeenTs() below, never the mutable ts/date
   fields an ongoing crack's own updates keep advancing. Unresolved rows
   (firstSeenTs returns null -- no ts, no parseable date at all) sort last:
   we can't honestly place something on a timeline when we don't know when
   it happened. */
export function sortReleasesByFirstSeen(releases: Release[]): Release[] {
  return [...releases].sort((a, b) => {
    const at = firstSeenTs(a);
    const bt = firstSeenTs(b);
    if (at == null && bt == null) return 0;
    if (at == null) return 1;
    if (bt == null) return -1;
    return at - bt;
  });
}

/* The one release the timeline marks as the genuine first crack -- the
   EARLIEST release that is NOT a repack/anonymous upload, never simply
   "whichever row's timestamp happens to sort first." A repack rebundles
   someone else's DRM bypass and xREL's "P2P" group_name is an
   unattributed placeholder, not a real group -- if either's recorded
   first_seen_ts happens to predate the actual original crack (bad/partial
   upstream data), crediting it as "first crack" would be exactly the kind
   of fabricated-sounding claim this project's other AI-grounding fixes
   have been about avoiding, just for structured data instead of prose.
   Returns null when every tracked release is a repack/anonymous upload --
   there's no genuine crack to credit as first. */
export function earliestGenuineRelease(releases: Release[]): Release | null {
  const genuine = releases.filter((r) => !r.isRepack && !r.isAnonymous);
  const dated = genuine.filter((r) => firstSeenTs(r) != null);
  if (!dated.length) return null;
  return dated.reduce((a, b) => (firstSeenTs(b)! < firstSeenTs(a)! ? b : a));
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

/* FIX (confirmed live): this used to fold every release's build through
   `|| 0` and take the max, so "no release has a confirmed build" (a real,
   common case -- most traditional scene dirnames never embed a Steam build
   id at all, see parseBuildFromDirname's own comment) came back as the
   number 0 instead of null. fmtBuild(0) happens to render the same "—" as
   fmtBuild(null) today, but it silently conflated two different states
   ("we have releases, none with a known build" vs "no releases exist") --
   callers that need to tell those apart (see GameDetail's "Best crack
   build" row) couldn't, from this return value alone. */
export function bestBuild(g: Game): number | null {
  if (!g.releases || !g.releases.length) return null;
  const known = g.releases.map((r) => r.build).filter((b): b is number => b != null);
  return known.length ? Math.max(...known) : null;
}

export function driftDelta(g: Game): number {
  const b = bestBuild(g);
  return b && g.currentBuild && b < g.currentBuild ? g.currentBuild - b : -1;
}

export const fmtBuild = (n: number | null | undefined): string => (n ? "#" + n.toLocaleString("en-US") : "—");

const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/steam/apps/";
export const steamImg = (appid: number, file: string): string => `${STEAM_CDN}${appid}/${file}`;
/* Prefers Steam's own real header_image URL (D1's `header` column, backfilled
   via worker/backfill/resolve.ts) -- confirmed live that Steam has moved many
   titles' header.jpg to a per-app hashed path under shared.akamai.steamstatic.com,
   so the flat cdn.cloudflare.steamstatic.com guess below 404s for most
   recently-added games. Only falls back to that guess for rows D1 hasn't
   re-enriched with the real URL yet. */
export const coverImg = (g: Game): string | null => g.header || (g.appid ? steamImg(g.appid, "header.jpg") : null);

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

/* Same shape as releaseTs, but for the release's real FIRST-ever detected
   moment (r.firstSeenTs/firstSeenDate) rather than its latest known state
   (r.ts/date, which an ongoing crack's updates keep advancing). Falls back
   to releaseTs itself when firstSeen* isn't populated -- older rows from
   before the backfill, or a release that's never been updated, where
   they're identical anyway. */
export function firstSeenTs(r: Release): number | null {
  if (r.firstSeenTs) return r.firstSeenTs * 1000;
  const t = Date.parse(r.firstSeenDate || "");
  if (!isNaN(t)) return t;
  return releaseTs(r);
}

/* Shared math behind crackTimingLabel/dPlusNLabel/the leaderboard: how many
   days after (positive) or before (negative, an early leak) a game's Steam
   release date a given release actually landed. Uses the release's real
   FIRST-seen moment, not its latest updated state -- otherwise a routine
   patch-update's timing gets mislabeled as if it were the original crack
   speed (confirmed live: this was measuring against the mutable `date`
   field, which an ongoing crack's every subsequent update overwrites).
   Returns null (never a fabricated 0) when either side can't be parsed, and
   also when r.firstSeenVerified is explicitly false -- that means this
   release's first-seen moment is a known-flawed placeholder (a pre-
   migrations/0005 row the reconciliation pass couldn't recover a real
   original date for, see that migration's own comment), not a genuine
   measurement, and showing a specific day-count built on it would read as
   a confident fact when it's actually just noise. */
export function crackTimingDays(g: Game, r: Release): number | null {
  if (r.firstSeenVerified === false) return null;
  const releaseTsVal = g.released ? Date.parse(g.released) : NaN;
  const crackTsVal = firstSeenTs(r);
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

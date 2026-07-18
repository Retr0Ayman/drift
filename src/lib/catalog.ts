import type { Game, Release } from "../types/game";
import { slugify } from "./format";
import { methodForGroup, isRepackGroup, isAnonymousUpload, isWindowsRelease } from "./constants";
import { normalizeTitle } from "./companies";
import type { XrelReleaseRow } from "./xrel";

interface RawRelease {
  id: string;
  dirname: string;
  time?: number;
  group_name?: string;
  link_href?: string;
  ext_info?: { type?: string; id?: string; title?: string };
}

export interface PartialGame extends Game {
  xrelKey: string;
  xrelTime: number;
}

const yearFromTs = (t?: number): number | null => (t ? new Date(t * 1000).getFullYear() : null);
const dateFromTs = (t?: number): string =>
  t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/* Best-effort, non-invented version token pulled from the scene dirname,
   e.g. "...-Update.3-CODEX" -> "Update 3", "...v1.05-RUNE" -> "v1.05". When
   nothing matches this returns "" -- the raw dirname is still shown once,
   via the note field, never duplicated into both fields (the previous
   `|| dn` fallback here made VERSION and the note paragraph show the exact
   same text underneath each other -- confirmed live on 007 First Light's
   ElAmigos and voices38 entries). */
function parseVersionFromDirname(dn?: string): string {
  if (!dn) return "";
  // FIX (confirmed live): the update/build/hotfix/patch branches only
  // captured a single \d+ run, so "UPDATE.1.17.REAL.REPACK-CPY" (Watch Dogs
  // 2's actual latest CPY dirname) matched just "UPDATE.1" and silently
  // dropped the ".17" -- reading as a placeholder-looking "Update 1" on a
  // release that really is v1.17. Every branch now allows repeated
  // `.digits` groups, same as the v\d branch already did.
  const m = dn.match(
    /\b(v\d+(?:\.\d+)+|update\.?\d+(?:\.\d+)*|build\.?\d+(?:\.\d+)*|hotfix\.?\d+(?:\.\d+)*|patch\.?\d+(?:\.\d+)*)\b/i,
  );
  return m ? m[0].replace(/\./g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
}

/* Real Steam build id, when a group's dirname convention embeds one --
   confirmed live, not a guess: 007 First Light's DenuvOwO release is
   "007.First.Light.Build.23909702-DenuvOwO", and /api/build for its real
   appid (3768760) returns buildid: 23909702 -- an exact match, not a
   coincidence. This was being parsed into the *display* version text
   ("Build 23909702") the whole time but never into the structured `build`
   field the Current/Outdated/Unverified status logic actually compares
   against, so a release with a real, verifiable current build number sat
   there permanently reading "Unverified". Requires the literal word
   "build" immediately before the digits and at least 5 digits, so this
   never fires on an unrelated "Update.4" or "v1.05" token. */
function parseBuildFromDirname(dn?: string): number | null {
  if (!dn) return null;
  const m = dn.match(/\bbuild[.\s]?(\d{5,9})\b/i);
  return m ? Number(m[1]) : null;
}

/* Builds one Release from a raw xREL row -- shared by every path that turns
   search/browse/archive rows into display data, so platform filtering,
   repack/anonymous tagging, and version/build parsing only live in one
   place. */
export function releaseFromRow(rel: RawRelease): Release {
  const group = rel.group_name || "scene";
  const m = methodForGroup(group);
  const build = parseBuildFromDirname(rel.dirname);
  const date = dateFromTs(rel.time);
  const ts = rel.time || 0;
  return {
    method: m,
    label: m === "hv" ? "Hypervisor" : "Traditional",
    group,
    build,
    version: parseVersionFromDirname(rel.dirname),
    date,
    ts,
    note: rel.dirname || "",
    xrelId: rel.id,
    link_href: rel.link_href,
    isRepack: isRepackGroup(group),
    isAnonymous: isAnonymousUpload(group),
    // Correct default for a single row in isolation -- dedupeReleasesByGroup
    // below overwrites these with the group's real earliest row when more
    // than one raw row for the same group is present in this batch.
    firstSeenDate: date,
    firstSeenBuild: build,
    firstSeenTs: ts,
  };
}

/* Cross-references a game's title against the starred-P2P-groups index
   (see hooks/usePlatformP2PIndex.ts) and merges in any release those groups
   have for it that isn't already covered by `baseReleases` -- P2P groups
   never show up in the browse feed baseReleases is normally built from (see
   worker/routes/xrel/browse.ts), so without this, a P2P-only crack (e.g.
   Pragmata's voices38 release) silently never appears on that game's own
   page. Reuses releaseFromRow, same version/build parsing as any other
   release -- a P2P dirname that genuinely embeds a real build number (the
   007 First Light/DenuvOwO case cited above) earns the same exact-match
   Current/Outdated status as a scene release with the same evidence, not
   an artificially suppressed "unverified." Deduped by group name so a
   release that's already present (e.g. already resolved via the browse
   feed under the same group) isn't shown twice. */
export function mergeP2PReleases(
  baseReleases: Release[],
  title: string,
  p2pIndex: Map<string, XrelReleaseRow[]>,
): Release[] {
  const rows = p2pIndex.get(normalizeTitle(title)) || [];
  if (!rows.length) return baseReleases;
  const existingGroups = new Set(baseReleases.map((r) => r.group.toLowerCase()));
  const extra = rows
    .filter((row) => !existingGroups.has((row.group_name || "").toLowerCase()))
    .map(releaseFromRow);
  return extra.length ? [...baseReleases, ...extra] : baseReleases;
}

/* Collapses repeat releases from the same group (e.g. a group's "Update
   v1.4", "Update v1.4.1", "Update v1.4.1.1" all showing up as separate raw
   xREL rows for the same game) down to one entry -- the latest by
   timestamp -- carrying updateCount so the UI can still say "updated Nx"
   instead of silently dropping the history. Confirmed live need: Sid
   Meier's Civilization VII alone had 3 separate DenuvOwO rows and 3
   separate ElAmigos rows for what a user experiences as one ongoing crack
   per group, not six unrelated releases. */
export function dedupeReleasesByGroup(releases: Release[]): Release[] {
  const byGroup = new Map<string, Release[]>();
  for (const r of releases) {
    const key = r.group.toLowerCase();
    (byGroup.get(key) || byGroup.set(key, []).get(key)!).push(r);
  }
  const out: Release[] = [];
  for (const group of byGroup.values()) {
    group.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    // group[0] (latest) supplies the represented build/date/etc as before;
    // the group's real EARLIEST row (last after the sort above) supplies
    // firstSeen* -- this call's own best-effort read of the original crack,
    // same reasoning as releaseFromRow's own comment.
    const earliest = group[group.length - 1];
    out.push({
      ...group[0],
      updateCount: group.length,
      firstSeenDate: earliest.firstSeenDate,
      firstSeenBuild: earliest.firstSeenBuild,
      firstSeenTs: earliest.firstSeenTs,
    });
  }
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/* Turns a page of raw xREL release rows into {xrelKey: gamePartial}. Games-
   only: ext_info.type for a real game is "master_game" (confirmed live),
   not "game". Non-Windows releases (NSW/PS4/PS5/Linux/MacOS -- confirmed
   live need: a VENOM Nintendo Switch update was the only release showing
   for Civilization VII, credited as if it were a Windows crack) are
   dropped before grouping, and repeat releases from the same group are
   collapsed to their latest via dedupeReleasesByGroup. */
export function parseReleaseRows(list: RawRelease[]): Record<string, PartialGame> {
  const byGame: Record<string, PartialGame> = {};
  for (const rel of list) {
    const ext = rel.ext_info || {};
    if (ext.type && ext.type !== "master_game") continue;
    if (!isWindowsRelease(rel.dirname || "")) continue;
    const title = ext.title;
    if (!title) continue;
    const key = ext.id || title;
    if (!byGame[key]) {
      byGame[key] = {
        id: slugify(title),
        xrelKey: key,
        title,
        appid: null,
        year: yearFromTs(rel.time),
        released: "",
        developer: "",
        publisher: "",
        genres: [],
        tags: ["Denuvo"],
        currentBuild: 0,
        releases: [],
        desc: "",
        fact: "",
        dlc: [],
        xrelTime: 0,
        source: { name: "xREL", url: "https://www.xrel.to/" },
      };
    }
    byGame[key].releases.push(releaseFromRow(rel));
    byGame[key].xrelTime = Math.max(byGame[key].xrelTime || 0, rel.time || 0);
  }
  for (const game of Object.values(byGame)) {
    game.releases = dedupeReleasesByGroup(game.releases);
  }
  return byGame;
}

/* Title -> appid via the Worker's /resolve route (Steam storesearch, small
   and targeted). Memoized per title so re-polling the same page, or
   re-resolving the same seed titles, doesn't refetch. */
const RESOLVE_CACHE = new Map<string, number | null>();
export async function resolveTitle(title: string): Promise<number | null> {
  const key = title.toLowerCase();
  if (RESOLVE_CACHE.has(key)) return RESOLVE_CACHE.get(key) ?? null;
  try {
    const r = await fetch(`/api/resolve?title=${encodeURIComponent(title)}`);
    const d = (await r.json()) as { appid?: number | null };
    const appid = d.appid ?? null;
    RESOLVE_CACHE.set(key, appid);
    return appid;
  } catch {
    RESOLVE_CACHE.set(key, null);
    return null;
  }
}

interface AppDetailsResponse {
  appid?: number;
  desc?: string;
  about?: string;
  developers?: string[];
  publishers?: string[];
  genres?: string[];
  year?: number | null;
  released?: string;
  currentBuild?: number | null;
  metacritic?: number | null;
  dlc?: number[];
}

export async function enrichFromSteam(game: PartialGame): Promise<void> {
  if (game.appid == null) return;
  try {
    const r = await fetch(`/api/appdetails?appid=${game.appid}`);
    const d = (await r.json()) as AppDetailsResponse;
    if (!d.appid) return;
    game.desc = d.about || d.desc || game.desc;
    game.developer = d.developers?.[0] || game.developer;
    game.publisher = d.publishers?.[0] || game.publisher;
    if (d.genres?.length) game.genres = d.genres;
    game.year = d.year ?? game.year;
    game.released = d.released || game.released;
    game.currentBuild = d.currentBuild ?? game.currentBuild;
    game.metacritic = d.metacritic ?? game.metacritic;
    if (Array.isArray(d.dlc) && d.dlc.length) {
      game.dlc = d.dlc.map((appid) => ({ n: "DLC", p: "—", appid }));
    }
  } catch {
    // leave whatever xREL-derived fields already exist
  }
}

export async function resolveAndEnrich(game: PartialGame): Promise<void> {
  game.appid = await resolveTitle(game.title);
  await enrichFromSteam(game);
}

interface XrelSearchResponse {
  list?: RawRelease[];
}

/* Builds a full, appid-resolved Game from EVERY real release xREL has for
   this exact title, not just the one row the user happened to click in the
   autocomplete dropdown. The old single-row version was the direct cause of
   a real bug: clicking a search result only ever attached whatever one row
   xREL's search ranked first, which for Civilization VII was a Nintendo
   Switch update from VENOM -- the real Windows releases (DenuvOwO,
   ElAmigos) existed in xREL's data the whole time but the client never
   asked for them. This re-queries the same search the dropdown already used
   (cached at the edge, so cheap) and pulls every row whose title matches
   exactly, reusing the same platform-filter + repack/anonymous-tagging +
   per-group dedupe as the browse/archive path so a searched-up game gets
   the same data quality as one that arrived via the catalog crawl. */
export async function buildLiveGameFromRows(title: string): Promise<Game | null> {
  if (!title) return null;
  const appid = await resolveTitle(title);
  if (appid == null) return null;

  let rows: RawRelease[] = [];
  try {
    const r = await fetch(`/api/xrel?q=${encodeURIComponent(title)}`);
    const data = (await r.json()) as XrelSearchResponse;
    const target = title.toLowerCase();
    rows = (data.list || []).filter(
      (row) => (row.ext_info?.title || "").toLowerCase() === target && isWindowsRelease(row.dirname || ""),
    );
  } catch {
    rows = [];
  }

  const releases = dedupeReleasesByGroup(rows.map(releaseFromRow));
  const newestTs = releases.reduce((mx, r) => Math.max(mx, r.ts || 0), 0);

  const game: PartialGame = {
    id: slugify(title),
    xrelKey: title,
    title,
    appid,
    year: yearFromTs(newestTs),
    released: "",
    developer: "",
    publisher: "",
    genres: [],
    tags: ["Denuvo"],
    currentBuild: 0,
    releases,
    desc: "",
    fact: "",
    dlc: [],
    xrelTime: newestTs,
    source: { name: "xREL", url: "https://www.xrel.to/" },
  };
  await enrichFromSteam(game);
  return game;
}

/* Newest-first needs a real point in time, not just a bucket year. Prefers
   the Steam release date; falls back to the xREL scene-release timestamp;
   falls back to Jan 1 of the year so seed-only entries with neither still
   sort sanely. */
export function gTimestamp(g: Game): number {
  if (g.released) {
    const t = Date.parse(g.released);
    if (!isNaN(t)) return t;
  }
  if (g.xrelTime) return g.xrelTime * 1000;
  if (g.year) return new Date(g.year, 0, 1).getTime();
  return 0;
}

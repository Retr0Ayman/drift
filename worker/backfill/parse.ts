import type { RawXrelRelease } from "../shared/xrel";
import { methodForGroup, isRepackGroup, isAnonymousUpload, isWindowsRelease } from "../shared/constants";

/* Hand-synced port of src/lib/catalog.ts's title/version/build parsing and
   src/lib/format.ts's slugify -- the worker and frontend bundle
   independently (see worker/shared/constants.ts's own comment on why),
   so this is a deliberate small copy, not a cross-directory import. Kept
   in sync by hand if either changes. This only needs the subset the D1
   schema actually persists (no dlc/tags/survivalHrs/fact parsing --
   those stay resolved live per-game-page-view, see the migration's own
   comment). */

export const slugify = (s: string): string =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

function parseVersionFromDirname(dn?: string): string {
  if (!dn) return "";
  const m = dn.match(
    /\b(v\d+(?:\.\d+)+|update\.?\d+(?:\.\d+)*|build\.?\d+(?:\.\d+)*|hotfix\.?\d+(?:\.\d+)*|patch\.?\d+(?:\.\d+)*)\b/i,
  );
  return m ? m[0].replace(/\./g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "";
}

export function parseBuildFromDirname(dn?: string): number | null {
  if (!dn) return null;
  const m = dn.match(/\bbuild[.\s]?(\d{5,9})\b/i);
  return m ? Number(m[1]) : null;
}

export interface ParsedRelease {
  method: "hv" | "trad";
  group_name: string;
  build: number | null;
  version: string;
  date: string;
  ts: number;
  note: string;
  xrel_id: string;
  link_href: string | null;
  is_repack: boolean;
  is_anonymous: boolean;
  update_count: number;
  /* Best-effort within THIS tick's batch -- the SQL upsert (db.ts's
     UPSERT_RELEASE_SQL) only ever applies these on a group's true
     first-ever insert and never touches them again, so a later tick
     computing a "first seen" that's actually just this tick's earliest
     row is harmless: it's discarded unless this is genuinely the first
     time D1 has seen this (game_id, group_name) pair. */
  first_seen_date: string;
  first_seen_build: number | null;
  first_seen_ts: number;
}

export interface ParsedGame {
  id: string;
  xrel_key: string;
  title: string;
  year: number | null;
  releases: ParsedRelease[];
}

export const dateFromTs = (t?: number): string =>
  t ? new Date(t * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const yearFromTs = (t?: number): number | null => (t ? new Date(t * 1000).getFullYear() : null);

function releaseFromRow(rel: RawXrelRelease): ParsedRelease {
  const group = rel.group_name || "scene";
  const build = parseBuildFromDirname(rel.dirname);
  const date = dateFromTs(rel.time);
  const ts = rel.time || 0;
  return {
    method: methodForGroup(group),
    group_name: group,
    build,
    version: parseVersionFromDirname(rel.dirname),
    date,
    ts,
    note: rel.dirname || "",
    xrel_id: rel.id,
    link_href: (rel.link_href as string) || null,
    is_repack: isRepackGroup(group),
    is_anonymous: isAnonymousUpload(group),
    update_count: 1,
    // Correct default for a single row taken in isolation -- dedupeByGroup
    // below overwrites these with the group's real earliest row when a
    // tick's batch has more than one for the same group.
    first_seen_date: date,
    first_seen_build: build,
    first_seen_ts: ts,
  };
}

/* Same "collapse repeat releases from the same group down to their latest,
   carry an update count" rule dedupeReleasesByGroup applies client-side --
   duplicated here (not called via HTTP) since this runs inside the worker,
   not the browser. */
function dedupeByGroup(releases: ParsedRelease[]): ParsedRelease[] {
  const byGroup = new Map<string, ParsedRelease[]>();
  for (const r of releases) {
    const key = r.group_name.toLowerCase();
    (byGroup.get(key) || byGroup.set(key, []).get(key)!).push(r);
  }
  const out: ParsedRelease[] = [];
  for (const group of byGroup.values()) {
    group.sort((a, b) => b.ts - a.ts);
    // The latest row (group[0]) carries the represented build/date/etc as
    // before; the group's real EARLIEST row (last after the sort above)
    // supplies first_seen_* -- this tick's best-effort approximation of
    // the original crack, same reasoning as releaseFromRow's own comment.
    const earliest = group[group.length - 1];
    out.push({
      ...group[0],
      update_count: group.length,
      first_seen_date: earliest.first_seen_date,
      first_seen_build: earliest.first_seen_build,
      first_seen_ts: earliest.first_seen_ts,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/* Same "games-only, Windows-only" bar parseReleaseRows applies client-side
   -- ext_info.type for a real game is "master_game" (confirmed live), not
   "game"; non-Windows platform releases are dropped before grouping. */
export function groupRowsByTitle(rows: RawXrelRelease[]): Map<string, ParsedGame> {
  const byGame = new Map<string, ParsedGame>();
  for (const rel of rows) {
    const ext = rel.ext_info || {};
    if (ext.type && ext.type !== "master_game") continue;
    if (!isWindowsRelease(rel.dirname || "")) continue;
    const title = ext.title;
    if (!title) continue;
    const key = ext.id || title;
    let game = byGame.get(key);
    if (!game) {
      game = { id: slugify(title), xrel_key: key, title, year: yearFromTs(rel.time), releases: [] };
      byGame.set(key, game);
    }
    game.releases.push(releaseFromRow(rel));
  }
  for (const game of byGame.values()) {
    game.releases = dedupeByGroup(game.releases);
  }
  return byGame;
}

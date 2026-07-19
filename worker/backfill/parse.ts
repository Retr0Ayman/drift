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

/* CONFIRMED live (Welcome to the Game III / xREL master_game id
   3f9b50f028ab9): xREL sometimes files an entire numbered franchise's
   Windows releases -- the 2016 original AND "Welcome.to.the.Game.II-HI2U"
   AND "Welcome.to.the.Game.III-TENOKE" -- under ONE shared master_game
   entry whose own ext_info.title is just "Welcome to the Game", no numeral
   at all. Since groupRowsByTitle used to key/resolve purely off ext.title,
   every sequel's release silently got written onto the ORIGINAL game's D1
   row (real appid 485380, released 2016) -- producing a nonsense multi-
   thousand-day "Cracked in" claim measured against the wrong game's
   release date entirely. This is upstream xREL grouping, not a
   normalization gap resolve.ts's norm() could ever bridge (that matches a
   title against Steam's own listing; this is xREL mislabeling which
   release belongs to which title before resolution is ever reached).

   Deliberately narrow, same "wrong guess is worse than unresolved"
   discipline resolve.ts's XREL_TITLE_ALIASES documents: only a STANDALONE
   roman-numeral token (II-IX; I is excluded since a bare "I" is common
   filler noise and a first entry never needs disambiguating from itself,
   X is excluded too -- confirmed live audit of the real catalog: BlazBlue
   Entropy Effect's own RUNE releases use a bare "X" as a release-tag
   token ("BlazBlue.Entropy.Effect.X.Update.v1.0.9.142185-RUNE"), with no
   "BlazBlue Entropy Effect X" game ever existing -- a single ambiguous
   letter is a worse false-positive risk here than the rest of this list,
   whose multi-character tokens have never collided with a real scene-tag
   convention this catalog has actually shown) sitting immediately after
   the master_game's own title words and immediately before the release
   group suffix is treated as a real sequel marker.

   Bare arabic digits are NOT handled by this same general rule -- scene
   dirnames routinely append an unprefixed decimal version directly after
   a title (confirmed live elsewhere in this codebase), and "Title.2.0
   -GROUP" is genuinely ambiguous between "sequel numbered 2" and "version
   2.0" in a way a roman numeral never is (versions are always arabic).
   Instead, ARABIC_SEQUEL_FRANCHISES below is a small, confirmed allowlist
   of base titles where this exact collapse has been verified live --
   arabic digits only trigger a correction for a title on that list, and
   even then only when the digit isn't itself immediately followed by
   another bare digit (the "2.0"-style decimal-version shape). Add a title
   here only after confirming its numbered releases resolve to real,
   distinct Steam appids individually via /api/resolve, same "confirmed,
   not guessed" bar XREL_TITLE_ALIASES already holds itself to -- don't
   guess ahead of a confirmed case. */
const SEQUEL_ROMAN_NUMERAL_RE = /^(ii|iii|iv|v|vi|vii|viii|ix)$/i;
const SEQUEL_ARABIC_DIGIT_RE = /^[2-9]$/;

/* CONFIRMED live via a full-catalog audit (every release's dirname checked
   against its game's own title for exactly this "extra numeral xREL's
   title doesn't carry" shape): each of these base titles' xREL master_game
   bucket mixes in numbered-sequel releases whose own Steam listings are
   real and distinct. Garten of Banban is the largest confirmed case --
   xREL's single "Garten of Banban" master_game entry (ext_info.id
   9c0906c737ed7) mixes releases for chapters 2, 3, 4, 6, 7, 8 in with the
   original chapter 1, and chapters 2/3/7 each confirmed live to resolve
   to their own real, distinct Steam appid (2262770/2311190/2693060) once
   queried with the numeral Steam actually lists them under. Monument
   Valley 3 (appid 3132930), Dark Quest 3 (appid 1185490), and The Lust
   City 2 (appid 2832400) are the other three confirmed live. */
const ARABIC_SEQUEL_FRANCHISES = new Set(["garten of banban", "monument valley", "dark quest", "the lust city"]);

function correctedTitleFromDirname(extTitle: string, dirname: string): string {
  const words = dirname.replace(/-[A-Za-z0-9]+$/, "").split(/[._]+/).filter(Boolean);
  const titleWords = extTitle.split(/\s+/).filter(Boolean);
  if (!titleWords.length || words.length <= titleWords.length) return extTitle;
  for (let i = 0; i < titleWords.length; i++) {
    if (words[i].toLowerCase() !== titleWords[i].toLowerCase()) return extTitle;
  }
  const next = words[titleWords.length];
  if (!next) return extTitle;
  if (SEQUEL_ROMAN_NUMERAL_RE.test(next)) return `${extTitle} ${next.toUpperCase()}`;
  if (
    ARABIC_SEQUEL_FRANCHISES.has(extTitle.toLowerCase()) &&
    SEQUEL_ARABIC_DIGIT_RE.test(next) &&
    // Disambiguates "Title.2-GROUP" (real sequel 2) from "Title.2.0-GROUP"
    // (an unprefixed decimal version, "2.0") -- a decimal's second part is
    // any digit 0-9, not just the [2-9] a sequel NUMBER itself is
    // restricted to (a game is never "sequel 0" or "sequel 1"), so this
    // check deliberately covers the full 0-9 range, not SEQUEL_ARABIC_DIGIT_RE.
    !/^[0-9]$/.test(words[titleWords.length + 1] || "")
  ) {
    return `${extTitle} ${next}`;
  }
  return extTitle;
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
    const extTitle = ext.title;
    if (!extTitle) continue;
    const title = correctedTitleFromDirname(extTitle, rel.dirname || "");
    // A dirname-corrected title bypasses xREL's own (misleading, in this
    // case) ext.id grouping key entirely -- that id is exactly what's
    // shared across the whole mis-filed franchise, so keying off it here
    // would just re-collapse the sequel right back into the base game's
    // bucket the correction was meant to split it out of.
    const key = title !== extTitle ? title : ext.id || extTitle;
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

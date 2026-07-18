import type { ParsedGame } from "./parse";
import type { Enrichment } from "./resolve";
import { FALLBACK_PRIMARY, FALLBACK_SECONDARY } from "../shared/colorExtract";

export async function getBackfillState(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM backfill_state WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setBackfillState(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO backfill_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

const UPSERT_GAME_SQL = `
  INSERT INTO games (id, xrel_key, title, appid, year, released, developer, publisher, genres, tags, current_build, current_build_updated_at, desc, fact, metacritic, source_name, source_url, header, accent_color_primary, accent_color_secondary, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    xrel_key = excluded.xrel_key, title = excluded.title, appid = excluded.appid, year = excluded.year,
    released = excluded.released, developer = excluded.developer, publisher = excluded.publisher,
    genres = excluded.genres, tags = excluded.tags, current_build = excluded.current_build,
    -- Straight overwrite, unlike accent colors below -- Steam's own
    -- timebuildupdated is always the ground truth of when current_build
    -- last changed, no "only if different" conditional needed (see
    -- migrations/0006's own comment).
    current_build_updated_at = excluded.current_build_updated_at, desc = excluded.desc,
    metacritic = excluded.metacritic, header = excluded.header,
    accent_color_primary = CASE
      WHEN excluded.accent_color_primary != ? OR accent_color_primary IS NULL OR accent_color_primary = ''
      THEN excluded.accent_color_primary ELSE accent_color_primary END,
    accent_color_secondary = CASE
      WHEN excluded.accent_color_secondary != ? OR accent_color_secondary IS NULL OR accent_color_secondary = ''
      THEN excluded.accent_color_secondary ELSE accent_color_secondary END,
    updated_at = excluded.updated_at
`;

// Same "collapse repeat releases from the same group down to their latest,
// only advance update_count when genuinely newer data arrives" rule
// parse.ts's dedupeByGroup applies within one tick's raw rows -- the WHERE
// clause makes this correct ACROSS ticks too (steady-state sync
// re-processing the same top-of-feed rows every 15 minutes must not
// re-insert or re-increment when nothing has actually changed for that
// group since the last time this row was written).
// first_seen_date/first_seen_build/first_seen_ts are deliberately absent
// from the DO UPDATE SET clause -- they're written on INSERT (a group's
// true first-ever row for this game) and never touched again, which is
// exactly what preserves the real original crack date/build against every
// later update overwriting date/build/ts (see migrations/0004's own
// comment for the full reasoning). first_seen_verified is bound to 1 on
// every fresh INSERT and, same as the fields above, deliberately excluded
// from DO UPDATE SET -- a row written by this code always has a real
// first-seen value (there's no "best-effort default" path left post-0005),
// and that must survive future updates exactly like the fields it
// describes (see migrations/0005 for the historical case this doesn't
// cover -- releases already in D1 before that migration ran).
const UPSERT_RELEASE_SQL = `
  INSERT INTO releases (game_id, method, group_name, build, version, date, ts, note, xrel_id, link_href, is_repack, is_anonymous, update_count, first_seen_date, first_seen_build, first_seen_ts, first_seen_verified)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  ON CONFLICT(game_id, group_name) DO UPDATE SET
    method = excluded.method, build = excluded.build, version = excluded.version, date = excluded.date,
    ts = excluded.ts, note = excluded.note, xrel_id = excluded.xrel_id, link_href = excluded.link_href,
    is_repack = excluded.is_repack, is_anonymous = excluded.is_anonymous,
    update_count = releases.update_count + 1
  WHERE excluded.ts > releases.ts
`;

const REFRESH_GAME_SQL = `
  UPDATE games SET
    title = ?, year = ?, released = ?, developer = ?, publisher = ?, genres = ?, tags = ?,
    current_build = ?, current_build_updated_at = ?, desc = ?, metacritic = ?, header = ?,
    accent_color_primary = CASE
      WHEN ? != ? OR accent_color_primary IS NULL OR accent_color_primary = ''
      THEN ? ELSE accent_color_primary END,
    accent_color_secondary = CASE
      WHEN ? != ? OR accent_color_secondary IS NULL OR accent_color_secondary = ''
      THEN ? ELSE accent_color_secondary END,
    updated_at = ?
  WHERE id = ?
`;

/* worker/backfill/refreshStale.ts's own tick: games whose Steam metadata
   (current_build above all) hasn't been re-checked in the longest time --
   oldest updated_at first, so this naturally cycles through the entire
   catalog over time rather than needing a fixed staleness threshold. Only
   games with a real resolved appid qualify (a game that somehow never
   resolved one has nothing to refresh against). */
export async function getStaleGames(db: D1Database, limit: number): Promise<Array<{ id: string; appid: number; title: string }>> {
  const rows = await db
    .prepare("SELECT id, appid, title FROM games WHERE appid IS NOT NULL ORDER BY updated_at ASC LIMIT ?")
    .bind(limit)
    .all<{ id: string; appid: number; title: string }>();
  return rows.results || [];
}

/* Plain UPDATE, not the full INSERT-with-defaults UPSERT_GAME_SQL above --
   this only ever touches a game D1 already has (getStaleGames selects
   existing rows), no xrel_key/releases involved, so the lighter statement
   is the honest shape for what this actually does. Same accent-color
   preservation logic as UPSERT_GAME_SQL: only overwrite with a fresh
   extraction if it's not just the fixed fallback pair (or the column was
   never populated), so a transient extraction failure on a refresh tick
   can't clobber a real color this game already had. */
export async function refreshStaleGame(db: D1Database, id: string, currentTitle: string, e: Enrichment): Promise<void> {
  await db
    .prepare(REFRESH_GAME_SQL)
    .bind(
      e.title || currentTitle,
      e.year,
      e.released,
      e.developer,
      e.publisher,
      JSON.stringify(e.genres),
      JSON.stringify(e.tags),
      e.currentBuild,
      e.currentBuildUpdatedAt,
      e.desc,
      e.metacritic,
      e.header,
      e.accentColorPrimary,
      FALLBACK_PRIMARY,
      e.accentColorPrimary,
      e.accentColorSecondary,
      FALLBACK_SECONDARY,
      e.accentColorSecondary,
      Date.now(),
      id,
    )
    .run();
}

// Safely under D1's bound-parameter ceiling per statement (confirmed live
// during the /api/catalog fix: 100 worked, 101 didn't) -- chunked so an
// existence check never risks hitting that limit even on a large tick.
const EXISTS_CHUNK = 50;

async function existingGameIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += EXISTS_CHUNK) {
    const chunk = ids.slice(i, i + EXISTS_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await db.prepare(`SELECT id FROM games WHERE id IN (${placeholders})`).bind(...chunk).all<{ id: string }>();
    for (const r of rows.results || []) found.add(r.id);
  }
  return found;
}

/* Batches every game + release write for one backfill tick into a single
   D1 .batch() round trip, not one .run() per row -- a browse page can
   yield 60-90 distinct titles, each with 1-5 releases, and D1 (like any
   networked DB) pays a real per-round-trip cost that adds up fast at that
   volume. A title that has never resolved a real Steam appid (not
   enriched this tick AND not already in D1 from an earlier successful
   one) is skipped entirely -- same "never insert an unresolved title"
   rule resolveAndEnrichBatch already applies, enforced again here as the
   last line of defense.

   FIX: a game that's ALREADY in D1 from an earlier successful enrichment
   no longer has its releases silently dropped just because THIS tick's
   live Steam re-resolve happened to fail or rate-limit -- only the game
   metadata refresh (desc/genres/build number) is skipped in that case,
   not the release write. Previously both were gated on a fresh
   successful enrichment every single tick, so a release update could go
   missing indefinitely whenever that one extra external call had a bad
   moment, with nothing about the release data itself being at fault. */
export async function upsertGames(db: D1Database, games: ParsedGame[], enrichments: Map<string, Enrichment>): Promise<number> {
  const unenrichedIds = games.filter((g) => !enrichments.has(g.title)).map((g) => g.id);
  const alreadyKnown = unenrichedIds.length ? await existingGameIds(db, unenrichedIds) : new Set<string>();

  const statements: D1PreparedStatement[] = [];
  const now = Date.now();

  for (const game of games) {
    const enrichment = enrichments.get(game.title);
    if (!enrichment && !alreadyKnown.has(game.id)) continue;

    if (enrichment) {
      statements.push(
        db.prepare(UPSERT_GAME_SQL).bind(
          game.id,
          game.xrel_key,
          // FIX (confirmed live): this used to write game.title -- the raw
          // xREL-derived title (grouped by worker/backfill/parse.ts's
          // groupRowsByTitle) that resolveTitle/upsertGames use as their
          // lookup key -- straight into the displayed games.title column.
          // xREL's own ext_info.title reflects whatever language/naming
          // that release's own scene/P2P group happened to package it
          // under (confirmed live: LEGO Batman: Legacy of the Dark
          // Knight's tracked releases are all German, so its xREL title
          // was "Lego Batman: Das Vermächtnis des Dunklen Ritters" -- and
          // that's what every game on this site displayed under until
          // now). enrichment.title is Steam's own real, canonical name
          // (appdetails.ts's `title` field) -- the actually-correct thing
          // to display. Falls back to game.title only in the
          // (essentially never, given d.appid already had to exist)
          // case Steam's response somehow omitted a name. `title =
          // excluded.title` in UPSERT_GAME_SQL's ON CONFLICT clause means
          // this self-corrects for every already-inserted game the next
          // time steady-state sync/deep backfill touches it again, no
          // separate migration needed.
          enrichment.title || game.title,
          enrichment.appid,
          enrichment.year ?? game.year,
          enrichment.released,
          enrichment.developer,
          enrichment.publisher,
          JSON.stringify(enrichment.genres),
          // FIX (confirmed live): this was a hardcoded JSON.stringify(["Denuvo"])
          // -- every single game ever written to D1 got tagged as Denuvo-protected
          // unconditionally, regardless of its real DRM, and ReleaseCard.tsx renders
          // this under a field literally labeled "Protection". Now a real per-game
          // lookup (worker/backfill/pcgamingwiki.ts, resolved by resolve.ts against
          // this same appid) -- an empty array when it finds no match, never a
          // guessed fallback.
          JSON.stringify(enrichment.tags),
          enrichment.currentBuild,
          enrichment.currentBuildUpdatedAt,
          enrichment.desc,
          null, // fact -- generated + cached client-side on demand, not backfilled
          enrichment.metacritic,
          "xREL",
          "https://www.xrel.to/",
          enrichment.header,
          enrichment.accentColorPrimary,
          enrichment.accentColorSecondary,
          now,
          FALLBACK_PRIMARY,
          FALLBACK_SECONDARY,
        ),
      );
    }

    for (const r of game.releases) {
      statements.push(
        db.prepare(UPSERT_RELEASE_SQL).bind(
          game.id,
          r.method,
          r.group_name,
          r.build,
          r.version,
          r.date,
          r.ts,
          r.note,
          r.xrel_id,
          r.link_href,
          r.is_repack ? 1 : 0,
          r.is_anonymous ? 1 : 0,
          r.update_count,
          r.first_seen_date,
          r.first_seen_build,
          r.first_seen_ts,
        ),
      );
    }
  }

  if (statements.length) await db.batch(statements);
  return statements.length;
}

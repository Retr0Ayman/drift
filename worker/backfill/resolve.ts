import type { Env } from "../shared/env";
import { handleResolve } from "../routes/resolve";
import { handleAppdetails } from "../routes/appdetails";
import { extractAccentColors, FALLBACK_PRIMARY, FALLBACK_SECONDARY } from "../shared/colorExtract";
import { resolveHighResHeader } from "../shared/steam";
import { lookupDrmForAppids } from "./pcgamingwiki";

// Same cap src/hooks/useLiveCatalog.ts already uses client-side -- confirmed
// live there that firing more concurrent /resolve calls at once measurably
// caused some to fail to resolve under real load (Steam storesearch rate
// limiting, not this app's own bug).
const RESOLVE_BATCH_SIZE = 6;

export interface Enrichment {
  appid: number;
  /* Steam's own real, canonical name (appdetails.ts's `title` field,
     straight from Steam's `name`) -- NOT the xREL-derived title
     resolveAndEnrichBatch/upsertGames key the enrichments map by. Those
     two can genuinely differ: xREL's own ext_info.title reflects
     whatever language/formatting that release's own scene/P2P group
     happened to package it under (confirmed live: LEGO Batman: Legacy of
     the Dark Knight's releases are all German, so xREL's canonical title
     for it was the German name), and upsertGames used to write THAT
     straight into the games.title column every game gets displayed
     under. This is what a caller should actually store/display -- see
     upsertGames' own comment for why this matters for every game, not
     just the one that surfaced it. */
  title: string;
  year: number | null;
  released: string;
  developer: string;
  publisher: string;
  genres: string[];
  currentBuild: number | null;
  /* Real Steam-side timestamp (unix seconds) of when currentBuild was
     actually published, straight from steamcmd.net's own timebuildupdated
     field (worker/shared/steam.ts's fetchBuildInfo) -- not derived from
     this app's own observation history. What src/lib/format.ts's
     survivalHrs() computes GameDetail's "Survival" stat from. null only
     when Steam/steamcmd genuinely didn't return one. */
  currentBuildUpdatedAt: number | null;
  desc: string;
  metacritic: number | null;
  /* The highest-quality reliably-confirmed cover/header image URL for
     this game -- steam.ts's resolveHighResHeader() HEAD-checks real
     high-res library CDN assets (library_hero.jpg preferred, matches the
     game-detail carousel's own aspect ratio best) and only falls back to
     Steam's own fixed-460x215 legacy header_image (appdetails.ts's
     `header` field) when neither high-res candidate is confirmed to
     exist for this specific appid. Never a client-side-reconstructed
     guess -- see migrations/0002_add_header_image.sql for why that
     stopped being reliable, and resolveHighResHeader's own comment for
     why even THIS resolution still needs a real, confirmed
     Steam-provided fallback rather than a second guessed path. */
  header: string | null;
  /* Cover-art ambient wash colors (worker/shared/colorExtract.ts) --
     extracted here, same point header itself is captured, so both the
     backfill and steady-state sync paths get it for free without a
     separate pass. */
  accentColorPrimary: string;
  accentColorSecondary: string;
  /* Real DRM/protection tags from PCGamingWiki (worker/backfill/
     pcgamingwiki.ts), looked up by this same appid -- empty array when no
     match or a failed query, never a guessed fallback (see that file's own
     comment for why title-based matching isn't used here). */
  tags: string[];
}

/* CONFIRMED live: xREL's own ext_info.title (the master_game's canonical
   title, what groupRowsByTitle groups releases by) is sometimes in
   whatever language that release's own scene/P2P group happened to
   package it under -- e.g. LEGO Batman: Legacy of the Dark Knight's
   x.X.RIDDICK.X.x/ElAmigos releases are all German (main_lang: "german"),
   so xREL's canonical title for it is "Lego Batman: Das Vermächtnis des
   Dunklen Ritters", not the English Steam listing name. This isn't a
   normalization gap resolve.ts's norm() can fix (that handles punctuation/
   trademark-symbol variants of the SAME string, not a different language
   entirely) -- resolveTitle needs to know the real title before it ever
   reaches Steam's storesearch. Small, explicit, extensible map rather than
   a fuzzy-match fallback: a wrong guess here would insert the wrong game
   under a real one's data, worse than staying unresolved. Add an entry
   whenever a seed title is confirmed stuck on this exact failure mode
   (found real xREL releases via search, never resolves) -- don't guess
   ahead of a confirmed case. */
const XREL_TITLE_ALIASES: Record<string, string> = {
  "lego batman: das vermächtnis des dunklen ritters": "LEGO Batman: Legacy of the Dark Knight",
  // Confirmed live during the Dishonored franchise-gap sweep -- same German-
  // xREL-title failure mode as LEGO Batman above, real releases exist but
  // resolveTitle never matched Steam's English listing without this.
  "dishonored 2: das vermächtnis der maske": "Dishonored 2",
  "dishonored: der tod des outsiders": "Dishonored: Death of the Outsider",
  "dishonored: die maske des zorns": "Dishonored",
  // Confirmed live via Steam's own storesearch: neither base listing is
  // independently searchable anymore -- "Infernal Edition"/"Dive Harder
  // Edition" are each the sole current purchasable SKU representing these,
  // not a generic "edition" suffix norm() already strips for the common
  // case (deluxe/ultimate/remastered/etc.). The alias value here is also
  // the literal search query resolveTitle sends to Steam's storesearch
  // (not just the comparison target) -- confirmed live that an en-dash in
  // the query itself ("Diablo II: Resurrected – Infernal Edition", Steam's
  // exact listed name) makes storesearch return zero results, while the
  // same string with the dash simply omitted returns the single correct
  // match. norm() already strips dashes from both sides for the actual
  // comparison, so this costs nothing there.
  "diablo ii: resurrected": "Diablo II: Resurrected Infernal Edition",
  "helldivers": "HELLDIVERS Dive Harder Edition",
  "injustice: götter unter uns": "Injustice: Gods Among Us Ultimate Edition",
};

/* Steam's real `name` is what enrichment.title now stores/displays (see
   that field's own comment), but Steam's raw name frequently carries
   cosmetic artifacts real users shouldn't see rendered literally on a
   game page: trademark/copyright glyphs ("LEGO® Batman™: Legacy of the
   Dark Knight"), and confirmed-live literal underscores standing in for
   spaces ("Watch_Dogs™"). This is deliberately lighter than resolve.ts's
   own norm() -- that one lowercases and strips punctuation too, which is
   correct for matching but would mangle a title meant to actually be
   displayed. Only the cosmetic artifacts get cleaned; casing and real
   punctuation (colons, apostrophes, dashes) are left exactly as Steam
   has them. */
function cleanDisplayTitle(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Calls the route handlers directly with a synthetic same-origin Request,
   same pattern worker/scheduled.ts already uses for the xREL routes --
   identical logic and edge caching, no extra network hop back into this
   same Worker. */
export async function resolveTitle(env: Env, title: string): Promise<number | null> {
  const realTitle = XREL_TITLE_ALIASES[title.trim().toLowerCase()] || title;
  const res = await handleResolve({
    request: new Request("https://internal.invalid/api/resolve?title=" + encodeURIComponent(realTitle)),
    env,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { appid?: number | null };
  return data.appid ?? null;
}

export async function enrichFromSteam(env: Env, appid: number): Promise<Enrichment | null> {
  const res = await handleAppdetails({
    request: new Request(`https://internal.invalid/api/appdetails?appid=${appid}`),
    env,
  });
  if (!res.ok) return null;
  const d = (await res.json()) as {
    appid?: number;
    title?: string;
    year?: number | null;
    released?: string;
    developers?: string[];
    publishers?: string[];
    genres?: string[];
    currentBuild?: number | null;
    currentBuildUpdatedAt?: number | null;
    desc?: string;
    about?: string;
    metacritic?: number | null;
    header?: string;
  };
  if (!d.appid) return null;
  // Accent extraction deliberately still reads d.header (the original
  // legacy-size image), not the high-res one resolved below -- Vibrant
  // only needs a representative color sample, not full resolution, and
  // fetching+decoding a much larger image here would slow down every
  // enrichment tick for no real accuracy gain this app has confirmed it
  // needs. Only the STORED/displayed header changes.
  const accent = d.header ? await extractAccentColors(d.header) : null;
  const drm = await lookupDrmForAppids([d.appid]);
  const header = await resolveHighResHeader(d.appid, d.header || null);
  return {
    appid: d.appid,
    title: d.title ? cleanDisplayTitle(d.title) : "",
    year: d.year ?? null,
    released: d.released || "",
    developer: d.developers?.[0] || "",
    publisher: d.publishers?.[0] || "",
    genres: d.genres || [],
    currentBuild: d.currentBuild ?? null,
    currentBuildUpdatedAt: d.currentBuildUpdatedAt ?? null,
    desc: d.about || d.desc || "",
    metacritic: d.metacritic ?? null,
    header,
    accentColorPrimary: accent?.primary ?? FALLBACK_PRIMARY,
    accentColorSecondary: accent?.secondary ?? FALLBACK_SECONDARY,
    tags: drm.get(d.appid) ?? [],
  };
}

/* Resolve+enrich a batch of titles, RESOLVE_BATCH_SIZE at a time -- the
   slow part of a backfill tick, budget for it accordingly (see
   worker/backfill/run.ts). A title that never resolves a real Steam appid
   is left out of the result map entirely, same "a game only ever renders
   if a Steam appid actually resolved" rule the client already follows --
   never insert an unresolved title into D1. */
export async function resolveAndEnrichBatch(
  env: Env,
  titles: string[],
): Promise<Map<string, Enrichment>> {
  const out = new Map<string, Enrichment>();
  for (let i = 0; i < titles.length; i += RESOLVE_BATCH_SIZE) {
    const batch = titles.slice(i, i + RESOLVE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (title) => {
        try {
          const appid = await resolveTitle(env, title);
          if (appid == null) return;
          const enrichment = await enrichFromSteam(env, appid);
          if (enrichment) out.set(title, enrichment);
        } catch {
          // One title's resolve/enrich throwing (a malformed upstream
          // response, a transient network error) must not lose the rest
          // of this Promise.all batch's already-successful results --
          // confirmed live as the actual cause of the backfill stalling
          // completely on every tick since deploy (see appdetails.ts's own
          // fix for the specific throw that triggered this).
        }
      }),
    );
  }
  return out;
}

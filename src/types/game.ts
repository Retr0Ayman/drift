export type CrackMethod = "hv" | "trad";

export interface Release {
  method: CrackMethod;
  label: string;
  group: string;
  build: number | null;
  version: string;
  date: string;
  note?: string;
  ts?: number;
  xrelId?: string;
  /* Real xREL page for this specific release (its own .../nfo.html), when
     known -- only present for live-tracked releases with a real xrelId,
     never fabricated for hand-authored seed entries. */
  link_href?: string;
  /* True when `group` is a known repack-only outfit (ElAmigos, RIDDICK,
     etc.) -- these rebundle someone else's DRM bypass, they didn't perform
     it, so display must credit them as "Repack by", never as the crack. */
  isRepack?: boolean;
  /* True when `group` is xREL's own "P2P" placeholder for an anonymous,
     unattributed upload -- not a real group name. */
  isAnonymous?: boolean;
  /* How many raw xREL rows (same group, same game) collapsed into this one
     entry -- e.g. a group's "Update v1.4", "Update v1.4.1" etc. all fold
     into the single latest release instead of piling up as separate cards.
     1 when there was only ever one release from this group. */
  updateCount?: number;
  /* The group's real FIRST-ever detected date/build/timestamp for this
     game -- set once at first insert (worker/backfill/db.ts's
     UPSERT_RELEASE_SQL never touches it again), distinct from date/build/
     ts above which keep updating to the latest known state. Without this,
     crackTimingDays (src/lib/format.ts) had no way to tell "the original
     crack" apart from "the most recent routine update," and was silently
     measuring the latter. Falls back to date/build/ts when absent (older
     un-backfilled rows, or a release where they're identical anyway). */
  firstSeenDate?: string;
  firstSeenBuild?: number | null;
  firstSeenTs?: number;
  /* False when firstSeenDate/Build/Ts is a known-flawed best-effort default
     rather than a genuinely confirmed original crack moment -- see
     migrations/0005_add_first_seen_verified.sql for the full history of
     why this exists. src/lib/format.ts's crackTimingDays/crackTimingLabel
     refuse to produce a "Cracked in N days" claim when this is false. */
  firstSeenVerified?: boolean;
}

export interface Dlc {
  n: string;
  p: string;
  appid?: number;
}

export interface Game {
  id: string;
  title: string;
  appid: number | null;
  /* Steam's own authoritative header image URL, when D1 has it (backfilled
     via worker/backfill/resolve.ts). Steam moved many titles' header image
     to a per-app hashed CDN path, so guessing steamImg(appid, "header.jpg")
     404s for most recently-added games -- coverImg() in lib/format.ts
     prefers this real URL and only falls back to the guess for rows not
     yet re-enriched. */
  header?: string | null;
  /* Cover-art derived ambient wash colors (worker/shared/colorExtract.ts),
     backfilled alongside header. Fixed neutral pair when extraction never
     ran or every candidate swatch failed the saturation gate -- never
     undefined for a game D1 has already enriched, only for rows written
     before this field existed. */
  accentColorPrimary?: string | null;
  accentColorSecondary?: string | null;
  year: number | null;
  released: string;
  developer?: string;
  publisher?: string;
  genres?: string[];
  tags?: string[];
  currentBuild: number;
  /* Real Steam-side unix-seconds timestamp of when currentBuild was last
     actually published (steamcmd.net's own timebuildupdated field, see
     worker/shared/steam.ts's fetchBuildInfo) -- not derived from this
     app's own observation history. What src/lib/format.ts's survivalHrs()
     computes GameDetail's "Survival" stat from. Undefined/null for a row
     D1 hasn't re-enriched since migrations/0006 added the column, or for
     bundled seed/synthetic Game objects that were never resolved against
     Steam at all -- survivalHrs() returns null (not a guess) in both cases. */
  currentBuildUpdatedAt?: number | null;
  releases: Release[];
  desc?: string;
  fact?: string;
  dlc?: Dlc[];
  source: { name: string; url: string };
  reviewPct?: number;
  metacritic?: number;
  xrelKey?: string;
  xrelTime?: number;
}

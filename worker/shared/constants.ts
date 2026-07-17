/* Mirrors src/lib/constants.ts -- the worker and frontend bundle
   independently (wrangler vs. Vite, see the note atop worker/shared/types.ts),
   so this is a deliberate, small, hand-synced copy of just what
   worker/scheduled.ts needs (which starred P2P groups to poll, and how to
   classify a release the same honest way the frontend does) rather than a
   cross-directory import that would couple the two build boundaries. Keep
   both files in sync by hand if either list ever changes. */
export const STARRED_GROUPS = ["voices38", "DenuvOwO"];

const normGroup = (g: string): string => (g || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const GROUP_METHOD: Record<string, "hv" | "trad"> = {
  denuvowo: "hv",
  "0xzeon": "hv",
  "0xze0n": "hv",
  voices38: "trad",
  rune: "trad",
  empress: "trad",
  cpy: "trad",
  codex: "trad",
  flt: "trad",
  tenoke: "trad",
  skidrow: "trad",
};

export const methodForGroup = (g: string): "hv" | "trad" => GROUP_METHOD[normGroup(g)] || "trad";

const REPACK_GROUPS = new Set(
  ["ElAmigos", "FitGirl", "DODI", "x.X.RIDDICK.X.x", "RIDDICK", "KaOsKrew"].map(normGroup),
);

export const isRepackGroup = (g: string): boolean => REPACK_GROUPS.has(normGroup(g));

export const isAnonymousUpload = (g: string): boolean => normGroup(g) === "p2p";

/* Confirmed live: some P2P groups (e.g. golemnight) dump console games
   under Sony's own internal content-ID prefixes instead of writing a
   literal platform name in the dirname -- "The.Witcher.3.Wild.Hunt.GOTY.
   Multi.CUSA05573-Golemnight" (PS4/PS5) and "Grand.Theft.Auto.V.Multi.
   BLES01807.341.355.4XX.CFW-golemnight" (PS3, plus the "CFW" custom-
   firmware marker) both matched none of the platform-name tokens below and
   were showing up as tracked Windows crack releases across 17 different
   games from this one group alone. cusa/ppsa (PS4/PS5) and bces/bcus/
   bles/blus/bcjs (PS3) are Sony's real, stable content-ID prefixes, not a
   guess -- always followed by digits in practice, so matched as one token
   with the digits included (the digits themselves aren't in the
   delimiter set, so a plain "cusa" alternative wouldn't reach the closing
   boundary). */
const NON_WINDOWS_PLATFORM =
  /(^|[._-])(nsw|switch|ps[2-5]|psvita|xbox(?:360|one|series)?|linux|mac[._-]?os|osx|cusa\d+|ppsa\d+|b[lc][eu]s\d+|bcjs\d+|cfw)([._-]|$)/i;

export const isWindowsRelease = (dirname: string): boolean => !NON_WINDOWS_PLATFORM.test(dirname || "");

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

const NON_WINDOWS_PLATFORM =
  /(^|[._-])(nsw|switch|ps[2-5]|psvita|xbox(?:360|one|series)?|linux|mac[._-]?os|osx)([._-]|$)/i;

export const isWindowsRelease = (dirname: string): boolean => !NON_WINDOWS_PLATFORM.test(dirname || "");

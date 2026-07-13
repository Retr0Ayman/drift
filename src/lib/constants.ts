/* Config list of starred groups (slugified) -- star badge, sorted to top of
   the Groups grid, distinct card treatment. Start with voices38 and
   DenuvOwO per the P2P-groups fix (see worker/routes/xrel/group.ts): these
   two never show up via the main Windows browse feed at all, only through
   the targeted per-group lookup, so they're the groups most worth pinning. */
export const STARRED_GROUPS = ["voices38", "denuvowo"];

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

/* Curated, well-documented repack groups -- these take an existing crack
   (someone else's DRM bypass) and rebundle the whole game into a compressed
   installer, they don't do the bypass themselves. Confirmed live example:
   AC Black Flag Resynced's xREL entries include a genuine 8MB DenuvOwO
   bypass release, then 40-65GB "releases" from P2P/ElAmigos/RIDDICK that
   are really just repacks of that same bypass. Crediting a repack group as
   if it cracked the game is a real, verifiable mislabel -- this list is
   only groups whose repack-only identity is public/well-known, same
   honesty bar as everywhere else in this file: extend it, never guess at
   it. group_name "P2P" itself is xREL's own placeholder for an anonymous/
   unattributed upload, not an actual group -- treated the same way (no
   crack credit implied) via isAnonymousUpload below. */
const REPACK_GROUPS = new Set(
  ["ElAmigos", "FitGirl", "DODI", "x.X.RIDDICK.X.x", "RIDDICK", "KaOsKrew"].map(normGroup),
);

export const isRepackGroup = (g: string): boolean => REPACK_GROUPS.has(normGroup(g));

export const isAnonymousUpload = (g: string): boolean => normGroup(g) === "p2p";

/* This is a Windows/Steam-build tracker specifically -- a release tagged
   for another platform has nothing to do with the Steam Windows build being
   compared against, and showing one as if it were a PC crack is actively
   misleading. Confirmed live: Civilization VII's search-driven detail page
   was showing a VENOM release as its only "crack option", credited as a
   Traditional Windows crack -- the dirname was
   "...Update.v1.4.1.1_NSW-VENOM", NSW meaning Nintendo Switch. Scene naming
   convention always tags a non-Windows platform explicitly (NSW, PS4, PS5,
   XBOX, Linux, MacOS/OSX); a release with none of those tags is the
   default-assumed Windows/PC case, so this only ever excludes, never
   requires, a "Windows" tag to be present.

   NOT \b-delimited: scene dirnames separate tokens with underscores
   ("..._NSW-VENOM") and JS regex treats "_" as a word character, so a
   naive \bnsw\b never matched "_NSW-" at all -- confirmed live, this exact
   miss let both a VENOM NSW release and two Linux releases (RazorDOX,
   Razor1911) straight through the first version of this filter for the
   same Civilization VII case above. Matches on the real scene separators
   (., _, -, or string start/end) instead. */
const NON_WINDOWS_PLATFORM =
  /(^|[._-])(nsw|switch|ps[2-5]|psvita|xbox(?:360|one|series)?|linux|mac[._-]?os|osx)([._-]|$)/i;

export const isWindowsRelease = (dirname: string): boolean => !NON_WINDOWS_PLATFORM.test(dirname || "");
